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
async function fetchPrice(asin) {
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    const html = await r.text();
    if (/page not found|sorry! we couldn't find/i.test(html.match(/<title>([^<]*)/)?.[1] ?? '')) {
      return { ok: false, reason: '페이지 없음' };
    }
    const p = html.match(/"priceAmount":([0-9.]+)/)?.[1];
    return p ? { ok: true, price: Number(p) } : { ok: false, reason: '가격 못 찾음 (품절이거나 차단)' };
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 60) };
  }
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

  // 제품 하나당 1.4초쯤 걸린다. 함수 상한이 10초라 직렬로 돌리면 6개에서 죽는다 — 반드시 병렬.
  const results = await Promise.all(snap.docs.map(async (d) => {
    const p = d.data();
    const got = await fetchPrice(d.id);
    if (!got.ok) {
      await d.ref.set({ checkedAt: FieldValue.serverTimestamp(), fetchNote: got.reason, fetchOk: false }, { merge: true });
      return { asin: d.id, ok: false, reason: got.reason };
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

    return { asin: d.id, ok: true, price, prev: p.lastPrice ?? null, target, hit, title: p.title ?? d.id };
  }));

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
