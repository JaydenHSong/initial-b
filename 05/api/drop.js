// POST /api/drop { url } + Authorization: Bearer <로그인 JWT>
// S05: 누가 드랍했는지 JWT로 확인하고, 그 사람의 워크스페이스에 행을 쓴다.
// 첫 드랍 때 워크스페이스가 자동 생성된다(1인 1보드). 수집은 S04 그대로
// waitUntil() 백그라운드 — 그리고 이번 주부터 관측은 성공이든 실패든
// s05_price_checks에 이력으로 쌓인다. 읽기는 RLS가 소유자에게만 연다.
import puppeteer from 'puppeteer-core';
import { waitUntil } from '@vercel/functions';

const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON = 'sb_publishable_ZYCrRbAghMXoB_dUKG1X1g_TkhCDJYA';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const isBot = (html) => /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html);

// 관측 판별은 S04에서 검증된 그대로 — 판단을 섞지 말고 관측값을 남긴다.
function read(html) {
  const kb = Math.round(html.length / 1024);
  if (isBot(html)) return { status: 'blocked', note: `봇 확인 페이지 ${html.length}B` };
  if (/page not found|sorry! we couldn't find/i.test(html.match(/<title>([^<]*)/)?.[1] ?? '')) {
    return { status: 'failed', note: '페이지 없음', gone: true };
  }
  const decode = (s) => s
    ?.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>') ?? null;
  const title = decode(html.match(/id="productTitle"[^>]*>\s*([^<]+?)\s*</)?.[1]);
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

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function collect(wsId, asin) {
  let r = await direct(asin);
  if (r.status !== 'ok' && !r.gone && process.env.BRD_WS) {
    const p = await viaProxy(asin);
    r = p.note?.startsWith('프록시 실패') ? { ...r, note: `${r.note} / ${p.note}` } : p;
  }
  const patch = {
    status: r.status, note: r.note ?? null, via: r.via, checked_at: new Date().toISOString(),
    ...(r.status === 'ok' ? { price: r.price } : {}),
    ...(r.title ? { title: r.title } : {}),
    ...(r.image ? { image: r.image } : {}),
    ...(r.rating ? { rating: r.rating } : {}),
    ...(r.reviews ? { reviews: r.reviews } : {}),
  };
  await fetch(`${SUPA}/rest/v1/s05_products?workspace_id=eq.${wsId}&asin=eq.${asin}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(patch),
  }).catch(() => {});
  // 관측 이력은 성공/실패 가리지 않고 쌓는다 — 시간축의 원본 데이터
  await fetch(`${SUPA}/rest/v1/s05_price_checks`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      workspace_id: wsId, asin,
      price: r.status === 'ok' ? r.price : null,
      status: r.status, via: r.via, note: r.note ?? null,
    }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY 미설정' });

  // 누가 드랍했나 — 클라이언트 세션의 JWT를 Supabase에 물어 확인한다
  const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: '로그인이 필요하다' });
  const uRes = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
  if (!uRes.ok) return res.status(401).json({ error: '세션이 유효하지 않다 — 다시 로그인' });
  const uid = (await uRes.json()).id;

  const raw = String((req.body || {}).url || '').trim();
  const asin = (raw.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})(?![A-Z0-9])/i)?.[1]
    ?? raw.match(/^([A-Z0-9]{10})$/i)?.[1])?.toUpperCase();
  if (!asin) return res.status(400).json({ error: '아마존 상품 URL이 아니다 (/dp/ASIN 꼴이어야 한다)' });

  // 첫 드랍이면 워크스페이스 자동 생성 (owner unique → merge-duplicates가 기존 행을 돌려준다)
  const ws = await fetch(`${SUPA}/rest/v1/s05_workspaces?on_conflict=owner`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ owner: uid }),
  });
  if (!ws.ok) return res.status(502).json({ error: `workspace upsert ${ws.status}` });
  const wsId = (await ws.json())[0].id;

  const up = await fetch(`${SUPA}/rest/v1/s05_products?on_conflict=workspace_id,asin`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ workspace_id: wsId, asin, url: `https://www.amazon.com/dp/${asin}`, status: 'pending' }),
  });
  if (!up.ok) return res.status(502).json({ error: `DB upsert ${up.status}` });

  waitUntil(collect(wsId, asin));
  return res.status(200).json({ asin, status: 'pending' });
}
