// 목표가를 저장한다. 브라우저는 보안 규칙으로 쓰기가 막혀 있어 서버 함수를 거친다.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(key), projectId: key.project_id });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' });

  const asin = String(req.body?.asin ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return res.status(400).json({ error: 'ASIN이 이상하다' });

  const raw = req.body?.target;
  // 빈 값이면 목표가를 지운다.
  const target = raw === null || raw === '' || raw === undefined ? null : Number(raw);
  if (target !== null && (!Number.isFinite(target) || target <= 0)) {
    return res.status(400).json({ error: '목표가는 0보다 큰 숫자다' });
  }

  const ref = db.collection('products').doc(asin);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: '없는 제품이다' });

  // 목표가를 바꾸면 알림 이력을 지운다 — 새 기준으로 다시 판정해야 한다.
  await ref.set({ targetPrice: target, hitAt: null }, { merge: true });

  const now = snap.data().lastPrice ?? null;
  res.status(200).json({
    asin,
    targetPrice: target,
    lastPrice: now,
    alreadyBelow: target != null && now != null && now <= target,
  });
}
