// ASIN 하나를 등록한다. 아마존에서 제목·가격을 1회 수집하고 Firestore에 쓴다.
// 서비스 계정 키는 여기(서버)에만 있다. 브라우저는 읽기만 한다.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(key), projectId: key.project_id });
}
const db = getFirestore();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 아마존 상품 페이지에서 제목·가격만 뽑는다. 실패해도 던지지 않는다 — 저장은 되어야 한다.
async function scrape(asin) {
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    const html = await r.text();
    const one = (re) => html.match(re)?.[1] ?? null;
    const price = html.match(/"priceAmount":([0-9.]+)/)?.[1];
    let title = html.match(/<title>([^<]*)/)?.[1] ?? '';

    // 썸네일 — 갤러리 첫 칸의 제품컷을 노린다.
    // og:image를 먼저 봤더니 아마존이 거기에 문구가 박힌 A+ 마케팅 배너를 넣어둬서
    // 제품컷이 아니었다(Echo Dot·Blink 둘 다). hiRes/large는 /dp/ASIN 페이지에서
    // 그 ASIN 기준으로 채워지는 갤러리 목록이라 이쪽이 대표 제품컷이다.
    const image =
      one(/"hiRes":"(https:[^"]+)"/) ??
      one(/"large":"(https:[^"]+)"/) ??
      one(/id="landingImage"[^>]*\ssrc="([^"]+)"/) ??
      one(/<meta property="og:image" content="([^"]+)"/);

    // 카테고리 — <title> 꼬리(": Electronics")가 전부다.
    // 브레드크럼·베스트셀러 순위·JSON-LD를 전부 시도했으나, 아마존이 데이터센터 IP에
    // 주는 축약 페이지에는 그 블록들이 아예 없다 (2026-08-08 실측, SPIKE.md 참고).
    // <title>은 HTML 엔티티가 들어 있는 원문이다. 제목이든 카테고리든 풀어서 써야 한다 —
    // 안 풀면 "Sports &amp; Outdoors"가 그대로 태그가 되고, 화면에서 한 번 더 이스케이프돼
    // 사용자 눈에 &amp; 로 보인다.
    const decode = (s) => s == null ? null : s
      .replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/gi, "'")
      .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();

    const category = decode(one(/<title>[^<]*?:\s*([^:<]+)<\/title>/));

    title = decode(title
      .replace(/^\s*Amazon\.com\s*:\s*/i, '')
      .replace(/\s*:\s*[^:]*$/, ''));

    // 가격대 — 달러 기준 구간. 제품을 고를 때 실제로 쓰는 축이다.
    const p = price ? Number(price) : null;
    const band = p == null ? null
      : p < 25 ? '$0–25' : p < 50 ? '$25–50' : p < 100 ? '$50–100'
      : p < 200 ? '$100–200' : p < 500 ? '$200–500' : '$500+';

    const cats = [category, band].filter(Boolean);
    // 없는 ASIN이어도 아마존은 200에 "Page Not Found" 페이지를 준다 — 제목만 보고 성공으로 치면 안 된다.
    if (/page not found|sorry! we couldn't find/i.test(title)) {
      return { ok: false, title: null, price: null, image: null, cats: [], reason: '아마존에 그 ASIN 페이지가 없다' };
    }
    if (!price) {
      return { ok: false, title: title || null, price: null, image, cats, reason: '가격을 못 찾았다 (품절이거나 차단됐다)' };
    }
    return { ok: true, title: title || null, price: Number(price), image, cats, reason: null };
  } catch (e) {
    return { ok: false, title: null, price: null, image: null, cats: [], reason: String(e.message).slice(0, 80) };
  }
}

// ASIN 열 자를 그대로 받거나, 아마존 URL에서 뽑아낸다. 둘 다 붙여넣을 수 있어야 한다.
async function toAsin(raw) {
  const s = String(raw ?? '').trim();
  if (/^[A-Za-z0-9]{10}$/.test(s)) return s.toUpperCase();
  const pick = (u) => u.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/|[?&]asin=)([A-Za-z0-9]{10})/i)?.[1];
  const direct = pick(s);
  if (direct) return direct.toUpperCase();
  // amzn.to 같은 단축 링크는 따라가야 ASIN이 나온다.
  if (/^https?:\/\/(amzn\.to|a\.co)\//i.test(s)) {
    try {
      const r = await fetch(s, { redirect: 'follow', headers: { 'user-agent': UA } });
      const hit = pick(r.url);
      if (hit) return hit.toUpperCase();
    } catch { /* 실패하면 아래에서 null */ }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' });

  const asin = await toAsin(req.body?.asin);
  const tags = [...new Set((req.body?.tags ?? []).map((t) => String(t).trim()).filter(Boolean))];

  if (!asin) return res.status(400).json({ error: 'ASIN 10자나 아마존 상품 URL을 넣어라' });
  if (!tags.length) return res.status(400).json({ error: '태그를 하나 이상 달아라 — 이번 주 핵심이다' });

  // 수집이 실패해도 저장은 한다. 대신 실패를 문서에 남겨 화면에 드러낸다.
  const got = await scrape(asin);

  // 자동 태그(카테고리·가격대)를 얹는다. 손으로 단 태그가 앞에 온다.
  const autoTags = got.cats.filter((t) => !tags.includes(t));
  const tagNames = [...new Set([...tags, ...autoTags])];

  const ref = db.collection('products').doc(asin);
  const prev = (await ref.get()).data() ?? {};

  // 최저가는 제품 문서에 중복 보관한다. 안 그러면 목록 한 번 그릴 때마다 제품 수만큼
  // prices 서브컬렉션을 읽어야 한다 (스파이크 실측: 20회 대 5회).
  const minPrice = got.price == null ? (prev.minPrice ?? null)
    : prev.minPrice == null ? got.price : Math.min(prev.minPrice, got.price);

  const doc = {
    title: got.title,
    price: got.price,
    image: got.image,
    tagNames,
    autoTags,
    fetchOk: got.ok,
    fetchNote: got.reason,
    minPrice,
    checkedAt: FieldValue.serverTimestamp(),
    addedAt: prev.addedAt ?? FieldValue.serverTimestamp(),
  };

  try {
    // merge 로 쓴다 — 재등록해도 targetPrice·hitAt 같은 사용자 설정이 날아가면 안 된다.
    await ref.set(doc, { merge: true });
    // 등록 시점의 가격을 시계열에 한 점 남긴다. 같은 날 다시 등록하면 그 날 점을 덮는다.
    if (got.price != null) {
      const day = new Date().toISOString().slice(0, 10);
      await ref.collection('prices').doc(day).set({ price: got.price, at: day });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Firestore 쓰기 실패: ' + String(e.message).slice(0, 120) });
  }
  res.status(200).json({ asin, ...doc, addedAt: null });
}
