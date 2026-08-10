// 하루 한 번 전 제품 가격을 다시 수집하고, 목표가 이하로 떨어지면 Google Chat으로 알린다.
// vercel.json 의 crons 가 이 경로를 부른다. 데모에서는 ?key=<CRON_SECRET> 로 손으로도 부른다.
//
// 수집은 두 단계다. 먼저 그냥 fetch 로 받아보고(무료), 아마존이 봇 페이지를 주면 그것만
// Bright Data 스크래핑 브라우저로 다시 받는다(유료, $8/GB). 전부 프록시로 돌리지 않는 이유는
// 비용도 있지만, 직접 성공률이 계속 기록돼야 "얼마나 막히고 있나"를 볼 수 있어서다.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import puppeteer from 'puppeteer-core';

if (!getApps().length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(key), projectId: key.project_id });
}
const db = getFirestore();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBot = (html) => /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html);

// 받은 HTML에서 가격을 뽑고, 없으면 왜 없는지까지 가른다.
function readPrice(html) {
  if (isBot(html)) return { ok: false, blocked: true, reason: `아마존이 차단했다 (봇 확인 페이지 ${html.length}B)` };
  if (/page not found|sorry! we couldn't find/i.test(html.match(/<title>([^<]*)/)?.[1] ?? '')) {
    return { ok: false, reason: '페이지 없음' };
  }
  const p = html.match(/"priceAmount":([0-9.]+)/)?.[1];
  if (p) return { ok: true, price: Number(p) };
  // priceAmount 는 구매 가능한 오퍼가 있을 때만 생기는 필드다. 페이지가 멀쩡히 왔는데
  // 이게 없으면 대개 판매자가 빠진 것이다. a-offscreen 으로 폴백하면 안 된다 —
  // 연관상품 가격이 섞여 엉뚱한 값이 저장된다(2026-08-10 실측).
  if (/currently unavailable|see all buying options/i.test(html)) {
    return { ok: false, reason: '판매자 없음 (Currently unavailable)' };
  }
  return { ok: false, reason: `가격 표시 없음 (${Math.round(html.length / 1024)}KB)` };
}

async function direct(asin) {
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    return readPrice(await r.text());
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 60) };
  }
}

// 이미지·폰트·미디어는 막는다 — 가격은 HTML 안에 있고 트래픽이 곧 요금이다(건당 ~1.1MB).
// CSS는 막지 않는다. 처음엔 같이 막았는데 아마존 JS 렌더 타이밍이 틀어져서
// 291KB짜리 반쪽 HTML을 읽거나 아예 타임아웃 났다 (2026-08-10).
async function viaBrowser(browser, asin) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) =>
      ['image', 'font', 'media'].includes(req.resourceType()) ? req.abort() : req.continue());
    await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // domcontentloaded 시점엔 가격이 아직 없을 수 있다. 나올 때까지만 짧게 기다린다.
    await page.waitForFunction(
      () => /"priceAmount":|currently unavailable|see all buying options/i.test(document.documentElement.innerHTML),
      { timeout: 12000 },
    ).catch(() => {});   // 못 기다려도 일단 읽어보고 사유는 readPrice 가 가른다
    return readPrice(await page.content());
  } catch (e) {
    return { ok: false, reason: '프록시 실패: ' + String(e.message).slice(0, 60) };
  } finally {
    await page.close().catch(() => {});
  }
}

async function notify(text) {
  const url = process.env.GCHAT_WEBHOOK;
  if (!url) return 'GCHAT_WEBHOOK 없음';
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
    });
    return r.ok ? 'sent' : `HTTP ${r.status}`;
  } catch (e) {
    return String(e.message).slice(0, 60);
  }
}

export default async function handler(req, res) {
  // Vercel 크론은 Authorization: Bearer $CRON_SECRET 을 붙여 부른다.
  // 손으로 부를 때는 ?key= 로 같은 값을 넘긴다. CRON_SECRET 이 없으면 잠그지 않는다.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (bearer !== secret && req.query.key !== secret) return res.status(401).json({ error: '권한 없음' });
  }

  const day = new Date().toISOString().slice(0, 10);
  const snap = await db.collection('products').get();
  const got = new Map();

  // ── 1단계: 그냥 받아본다. 한 건씩, 사이에 간격을 둔다.
  // 병렬로 쐈더니 아마존이 동시 요청 대부분에 봇 페이지를 줬다 (2026-08-10).
  for (const d of snap.docs) {
    if (got.size) await sleep(700 + Math.floor(Math.random() * 900));
    got.set(d.id, { ...(await direct(d.id)), via: '직접' });
  }

  // ── 2단계: 직접 경로가 가격을 못 얻은 것만 프록시로. 연결은 한 번만 연다.
  // 처음엔 봇 페이지(v.blocked)만 넘겼는데, 직접 경로에서 "판매자 없음"이던 제품이
  // 프록시로는 $31.99 로 나왔다 (2026-08-10). 아마존이 의심 IP에는 봇 페이지 대신
  // 가격만 뺀 페이지를 주기도 한다 — 그 소프트 차단은 품절과 구분이 안 된다.
  // 페이지 자체가 없는 경우만 빼고 전부 다시 받아본다.
  const blocked = [...got.entries()]
    .filter(([, v]) => !v.ok && v.reason !== '페이지 없음').map(([a]) => a);
  let browser = null;
  if (blocked.length && process.env.BRD_WS) {
    try {
      browser = await puppeteer.connect({ browserWSEndpoint: process.env.BRD_WS });
      for (const asin of blocked) got.set(asin, { ...(await viaBrowser(browser, asin)), via: '프록시' });
    } catch (e) {
      for (const asin of blocked) {
        const prev = got.get(asin);
        got.set(asin, { ...prev, reason: prev.reason + ' / 프록시 연결 실패: ' + String(e.message).slice(0, 50) });
      }
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  // ── 3단계: 저장
  const results = [];
  for (const d of snap.docs) {
    const p = d.data();
    const g = got.get(d.id);
    if (!g.ok) {
      await d.ref.set({ checkedAt: FieldValue.serverTimestamp(), fetchNote: g.reason, fetchOk: false }, { merge: true });
      results.push({ asin: d.id, ok: false, via: g.via, reason: g.reason });
      continue;
    }
    const price = g.price;
    const minPrice = p.minPrice == null ? price : Math.min(p.minPrice, price);
    const target = p.targetPrice ?? null;
    // 목표가를 새로 뚫었을 때만 알린다. hitAt 이 있으면 이미 알린 것이다.
    const hit = target != null && price <= target && !p.hitAt;

    await d.ref.collection('prices').doc(day).set({ price, at: day });
    await d.ref.set({
      lastPrice: price, minPrice, fetchOk: true, fetchNote: null, fetchVia: g.via,
      checkedAt: FieldValue.serverTimestamp(),
      ...(hit ? { hitAt: FieldValue.serverTimestamp() } : {}),
      // 목표가 위로 다시 올라가면 다음 하락 때 또 알리도록 이력을 푼다.
      ...(target != null && price > target && p.hitAt ? { hitAt: null } : {}),
    }, { merge: true });

    results.push({ asin: d.id, ok: true, price, via: g.via, prev: p.lastPrice ?? null, target, hit, title: p.title ?? d.id });
  }

  const hits = results.filter((r) => r.hit);
  const fails = results.filter((r) => !r.ok);
  const viaProxy = results.filter((r) => r.ok && r.via === '프록시').length;
  let notified = null;

  if (hits.length) {
    notified = await notify('*목표가 도달*\n' + hits.map((h) =>
      `• ${h.title.slice(0, 60)}\n  $${h.price} (목표 $${h.target}) — https://www.amazon.com/dp/${h.asin}`).join('\n'));
  } else if (fails.length) {
    // 수집이 실패해도 조용히 죽지 않는다. 며칠째 못 긁고 있는 걸 모르는 게 더 나쁘다.
    notified = await notify(`*가격 수집 실패 ${fails.length}건* (${day})\n`
      + fails.map((f) => `• ${f.asin} — ${f.reason}`).join('\n'));
  }

  res.status(200).json({
    day, checked: results.length, hits: hits.length, failed: fails.length,
    directOk: results.filter((r) => r.ok && r.via === '직접').length,
    proxyOk: viaProxy, blocked: blocked.length, notified, results,
  });
}
