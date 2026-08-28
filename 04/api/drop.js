// POST /api/drop { url } — 아마존 상품 URL에서 ASIN을 뽑아 `수집 중` 행을 upsert하고
// 즉시 응답한다. 수집은 waitUntil() 백그라운드에서: 직접 fetch → 실패 건만 Bright Data
// 폴백 (S02 검증 구조). 재드랍 = 같은 URL을 다시 POST — 상태가 pending으로 돌아가고
// 새 관측값이 덮는다. fire-and-forget fetch는 쓰지 않는다 — 응답과 함께 얼려진다 (04/SPIKE.md).
import puppeteer from 'puppeteer-core';
import { waitUntil } from '@vercel/functions';

const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const isBot = (html) => /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html);

// 받은 HTML을 관측값으로 가른다. 판단을 미리 섞지 않는다 — note에는 바이트 수·마커를 남긴다.
// a-offscreen 폴백은 금지: 연관상품 가격이 섞인다 (S02 골프공 $31.99).
function read(html) {
  const kb = Math.round(html.length / 1024);
  if (isBot(html)) return { status: 'blocked', note: `봇 확인 페이지 ${html.length}B` };
  if (/page not found|sorry! we couldn't find/i.test(html.match(/<title>([^<]*)/)?.[1] ?? '')) {
    return { status: 'failed', note: '페이지 없음', gone: true };
  }
  // 원본 HTML의 엔티티(&amp; 등)를 풀어서 저장한다 — 안 풀면 카드에 &amp;가 그대로 보인다
  const decode = (s) => s
    ?.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>') ?? null;
  const title = decode(html.match(/id="productTitle"[^>]*>\s*([^<]+?)\s*</)?.[1]);
  // 이미지·별점·리뷰 수는 같은 응답에서 공짜로 나온다. 전부 고유 마커(hiRes JSON·id 속성)에
  // 앵커해서 뽑는다 — 느슨한 클래스 매칭은 연관상품 값이 섞인다 (S02 a-offscreen $31.99).
  // 메인 이미지는 landingImage 요소의 이미지 ID에 앵커한다 — "첫 hiRes"만 믿으면
  // 갤러리 순서가 다른 페이지에서 메인 아닌 그림을 집을 수 있다.
  const imgId = html.match(/id="landingImage"[^>]*data-a-dynamic-image="\{&quot;https:\/\/m\.media-amazon\.com\/images\/I\/([\w+%-]+)\./)?.[1];
  const image = (imgId
    ? html.match(new RegExp(`"hiRes":"(https://m\\.media-amazon\\.com/images/I/${imgId}\\.[^"]+)"`))?.[1]
    : null)
    ?? html.match(/"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1]
    ?? html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1] ?? null;
  const rating = Number(html.match(/id="acrPopover"[^>]*title="([0-9.]+) out of 5 stars"/)?.[1]) || null;
  const reviews = Number((html.match(/id="acrCustomerReviewText"[^>]*aria-label="([\d,]+) Reviews?"/i)?.[1] ?? '').replace(/,/g, '')) || null;
  const extra = { title, image, rating, reviews };
  const price = html.match(/"priceAmount":([0-9.]+)/)?.[1];
  if (price) return { status: 'ok', price: Number(price), ...extra, note: `${kb}KB` };
  if (/currently unavailable|see all buying options/i.test(html)) {
    return { status: 'failed', ...extra, note: `가격 없음 — Currently unavailable (${kb}KB, 품절 또는 소프트 차단)` };
  }
  return { status: 'failed', ...extra, note: `가격 마커 없음 (${kb}KB)` };
}

async function direct(asin) {
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    return { ...read(await r.text()), via: 'direct' };
  } catch (e) {
    return { status: 'failed', note: String(e.message).slice(0, 80), via: 'direct' };
  }
}

// 직접 경로가 가격을 못 얻으면 (페이지 없음만 빼고) 전부 프록시로 다시 받는다.
// 소프트 차단은 품절과 관측으로 구분이 안 되므로, 다른 경로로 같은 걸 받아봐야 갈린다 (S02).
async function viaProxy(asin) {
  let browser = null;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: process.env.BRD_WS });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (q) => ['image', 'font', 'media'].includes(q.resourceType()) ? q.abort() : q.continue());
    await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => /"priceAmount":|currently unavailable|see all buying options/i.test(document.documentElement.innerHTML),
      { timeout: 12000 },
    ).catch(() => {});
    return { ...read(await page.content()), via: 'proxy' };
  } catch (e) {
    return { status: 'failed', note: '프록시 실패: ' + String(e.message).slice(0, 60), via: 'proxy' };
  } finally {
    await browser?.close().catch(() => {});
  }
}

const headers = {
  apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
};

async function collect(asin) {
  let r = await direct(asin);
  if (r.status !== 'ok' && !r.gone && process.env.BRD_WS) {
    const p = await viaProxy(asin);
    // 프록시가 연결조차 안 됐으면 직접 관측을 남기고 사유만 덧붙인다.
    r = p.note?.startsWith('프록시 실패') ? { ...r, note: `${r.note} / ${p.note}` } : p;
  }
  const patch = {
    status: r.status, note: r.note ?? null, via: r.via, checked_at: new Date().toISOString(),
    // 값이 있을 때만 덮는다 — 실패가 멀쩡한 지난 가격·제목을 지우지 않는다.
    ...(r.status === 'ok' ? { price: r.price } : {}),
    ...(r.title ? { title: r.title } : {}),
    ...(r.image ? { image: r.image } : {}),
    ...(r.rating ? { rating: r.rating } : {}),
    ...(r.reviews ? { reviews: r.reviews } : {}),
  };
  await fetch(`${SUPA}/rest/v1/s04_products?asin=eq.${asin}`, {
    method: 'PATCH', headers, body: JSON.stringify(patch),
  }).catch(() => { /* 저장 실패 시 행은 pending으로 남는다 — 복구는 재드랍 */ });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY 미설정' });

  const raw = String((req.body || {}).url || '').trim();
  const asin = (raw.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})(?![A-Z0-9])/i)?.[1]
    ?? raw.match(/^([A-Z0-9]{10})$/i)?.[1])?.toUpperCase();
  if (!asin) return res.status(400).json({ error: '아마존 상품 URL이 아니다 (/dp/ASIN 꼴이어야 한다)' });

  const up = await fetch(`${SUPA}/rest/v1/s04_products?on_conflict=asin`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ asin, url: `https://www.amazon.com/dp/${asin}`, status: 'pending' }),
  });
  if (!up.ok) return res.status(502).json({ error: `DB upsert ${up.status}` });

  waitUntil(collect(asin));
  return res.status(200).json({ asin, status: 'pending' });
}
