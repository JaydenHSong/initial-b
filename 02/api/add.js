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

    // 카테고리 — 브레드크럼 링크들. 없으면 <title> 꼬리(": Electronics")로 폴백.
    const crumbBlock = one(/wayfinding-breadcrumbs_feature_div([\s\S]{0,4000}?)<\/ul>/);
    let cats = crumbBlock
      ? [...crumbBlock.matchAll(/class="a-link-normal a-color-tertiary"[^>]*>([\s\S]{0,60}?)<\/a>/g)]
          .map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [];
    if (!cats.length) {
      const tail = one(/<title>[^<]*?:\s*([^:<]+)<\/title>/);
      if (tail) cats = [tail.trim()];
    }

    title = title
      .replace(/^\s*Amazon\.com\s*:\s*/i, '')
      .replace(/\s*:\s*[^:]*$/, '')
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .trim();
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' });

  const asin = String(req.body?.asin ?? '').trim().toUpperCase();
  const tags = [...new Set((req.body?.tags ?? []).map((t) => String(t).trim()).filter(Boolean))];

  if (!/^[A-Z0-9]{10}$/.test(asin)) return res.status(400).json({ error: 'ASIN은 영문/숫자 10자다' });
  if (!tags.length) return res.status(400).json({ error: '태그를 하나 이상 달아라 — 이번 주 핵심이다' });

  // 수집이 실패해도 저장은 한다. 대신 실패를 문서에 남겨 화면에 드러낸다.
  const got = await scrape(asin);

  // 카테고리에서 자동 태그 하나를 얹는다 (가장 구체적인 것). 손으로 단 태그가 앞에 온다.
  const auto = got.cats.length ? got.cats[got.cats.length - 1] : null;
  const tagNames = [...new Set(auto ? [...tags, auto] : tags)];

  const doc = {
    title: got.title,
    price: got.price,
    image: got.image,
    tagNames,
    autoTag: auto,
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
