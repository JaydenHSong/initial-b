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

    // 썸네일 — 아마존이 페이지마다 다른 자리에 넣어서 순서대로 떨어뜨린다.
    const image =
      one(/"hiRes":"(https:[^"]+)"/) ??
      one(/"large":"(https:[^"]+)"/) ??
      one(/<meta property="og:image" content="([^"]+)"/) ??
      one(/id="landingImage"[^>]*\ssrc="([^"]+)"/);

    // 카테고리 — <title> 꼬리(": Electronics")가 전부다.
    // 브레드크럼·베스트셀러 순위·JSON-LD를 전부 시도했으나, 아마존이 데이터센터 IP에
    // 주는 축약 페이지에는 그 블록들이 아예 없다 (2026-08-08 실측, SPIKE.md 참고).
    const category = one(/<title>[^<]*?:\s*([^:<]+)<\/title>/)?.trim() ?? null;

    title = title
      .replace(/^\s*Amazon\.com\s*:\s*/i, '')
      .replace(/\s*:\s*[^:]*$/, '')
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .trim();

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

  const doc = {
    title: got.title,
    price: got.price,
    image: got.image,
    tagNames,
    autoTags,
    fetchOk: got.ok,
    fetchNote: got.reason,
    addedAt: FieldValue.serverTimestamp(),
  };

  try {
    await db.collection('products').doc(asin).set(doc);
  } catch (e) {
    return res.status(500).json({ error: 'Firestore 쓰기 실패: ' + String(e.message).slice(0, 120) });
  }
  res.status(200).json({ asin, ...doc, addedAt: null });
}
