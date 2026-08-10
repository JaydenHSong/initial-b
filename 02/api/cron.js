// 하루 한 번 전 제품 가격을 다시 수집하고, 목표가 이하로 떨어지면 Google Chat으로 알린다.
// vercel.json 의 crons 가 이 경로를 부른다. 데모에서는 ?key=<CRON_SECRET> 로 손으로도 부른다.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(key), projectId: key.project_id });
}
const db = getFirestore();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// add.js 의 수집과 달리 여기서는 가격만 필요하다. 제목·사진·카테고리는 등록 때 이미 채웠다.
// 실패 사유를 뭉뚱그리지 않는다 — 차단인지 품절인지 알아야 대응이 갈린다.
async function fetchPrice(asin) {
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    const html = await r.text();
    if (/api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html)) {
      return { ok: false, reason: `아마존이 차단했다 (봇 확인 페이지 ${html.length}B)` };
    }
    if (/page not found|sorry! we couldn't find/i.test(html.match(/<title>([^<]*)/)?.[1] ?? '')) {
      return { ok: false, reason: '페이지 없음' };
    }
    const p = html.match(/"priceAmount":([0-9.]+)/)?.[1];
    if (p) return { ok: true, price: Number(p) };
    // 1MB짜리 정상 페이지인데 가격이 없는 경우가 생겼다. 셀렉터가 바뀐 건지
    // 진짜 품절인지 가르려면 어떤 가격 마크업이 남아 있는지 봐야 한다. (조사용, 확인 후 제거)
    const n = (re) => (html.match(re) ?? []).length;
    const probe = [
      `whole=${n(/a-price-whole/g)}`,
      `off=${n(/a-offscreen/g)}`,
      `core=${n(/corePrice/g)}`,
      `block=${n(/priceblock/gi)}`,
      `unavail=${/currently unavailable|일시 품절/i.test(html) ? 1 : 0}`,
      `sample=${(html.match(/a-offscreen">([^<]{1,12})</) ?? [])[1] ?? '-'}`,
    ].join(' ');
    return { ok: false, reason: `가격 없음 ${html.length}B [${probe}]` };
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 60) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 차단은 간헐적이다 — 같은 요청을 몇 초 뒤에 다시 보내면 통과하는 경우가 많다.
// 품절·페이지 없음은 다시 시도해도 답이 같으니 재시도하지 않는다.
async function fetchPriceRetry(asin, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(2500 + Math.floor(Math.random() * 2500));
    last = await fetchPrice(asin);
    if (last.ok || !/차단했다/.test(last.reason)) return { ...last, tries: i + 1 };
  }
  return { ...last, tries };
}

async function notify(text) {
  const url = process.env.GCHAT_WEBHOOK;
  if (!url) return 'GCHAT_WEBHOOK 없음';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
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
    if (bearer !== secret && req.query.key !== secret) {
      return res.status(401).json({ error: '권한 없음' });
    }
  }

  const day = new Date().toISOString().slice(0, 10);
  const snap = await db.collection('products').get();

  // 병렬로 쐈더니 아마존이 같은 IP에서 동시에 들어온 요청 대부분에 봇 페이지를 줬다
  // (2026-08-10: 5개 중 1개만 통과, 통과하는 제품이 매번 바뀜). 그래서 한 건씩 순서대로,
  // 사이에 무작위 간격을 둔다. 함수 시간은 vercel.json 의 maxDuration 으로 늘렸다.
  const results = [];
  for (const d of snap.docs) {
    if (results.length) await sleep(700 + Math.floor(Math.random() * 900));
    const p = d.data();
    const got = await fetchPriceRetry(d.id);
    if (!got.ok) {
      await d.ref.set({ checkedAt: FieldValue.serverTimestamp(), fetchNote: got.reason, fetchOk: false }, { merge: true });
      results.push({ asin: d.id, ok: false, reason: got.reason, tries: got.tries });
      continue;
    }

    const price = got.price;
    const minPrice = p.minPrice == null ? price : Math.min(p.minPrice, price);
    const target = p.targetPrice ?? null;
    // 목표가를 새로 뚫었을 때만 알린다. hitAt 이 있으면 이미 알린 것이다.
    const hit = target != null && price <= target && !p.hitAt;

    await d.ref.collection('prices').doc(day).set({ price, at: day });
    await d.ref.set({
      lastPrice: price, minPrice, fetchOk: true, fetchNote: null,
      checkedAt: FieldValue.serverTimestamp(),
      ...(hit ? { hitAt: FieldValue.serverTimestamp() } : {}),
      // 목표가 위로 다시 올라가면 다음 하락 때 또 알리도록 이력을 푼다.
      ...(target != null && price > target && p.hitAt ? { hitAt: null } : {}),
    }, { merge: true });

    results.push({ asin: d.id, ok: true, price, prev: p.lastPrice ?? null, target, hit, tries: got.tries, title: p.title ?? d.id });
  }

  const hits = results.filter((r) => r.ok && r.hit);
  const fails = results.filter((r) => !r.ok);
  let notified = null;

  if (hits.length) {
    notified = await notify(
      '*목표가 도달*\n' + hits.map((h) =>
        `• ${h.title.slice(0, 60)}\n  $${h.price} (목표 $${h.target}) — https://www.amazon.com/dp/${h.asin}`).join('\n')
    );
  } else if (fails.length) {
    // 수집이 실패해도 조용히 죽지 않는다. 며칠째 못 긁고 있는 걸 모르는 게 더 나쁘다.
    notified = await notify(
      `*가격 수집 실패 ${fails.length}건* (${day})\n` +
      fails.map((f) => `• ${f.asin} — ${f.reason}`).join('\n')
    );
  }

  res.status(200).json({ day, checked: results.length, hits: hits.length, failed: fails.length, notified, results });
}
