// POST /api/fix { id, field, value } — 표에서 손으로 고친 값을 저장한다.
// 고친 칸은 corrected에 표시가 남는다 → "3장 중 n장 정확"의 근거 (고친 행 = OCR이 틀린 행).
const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const FIELDS = { merchant: (v) => String(v).trim().slice(0, 120) || null,
  receipt_date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
  total: (v) => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY 미설정' });
  const { id, field, value } = req.body || {};
  if (!Number.isInteger(id) || !(field in FIELDS)) return res.status(400).json({ error: 'id·field가 이상하다' });
  const clean = FIELDS[field](value ?? '');
  if (clean === null && field !== 'merchant') return res.status(400).json({ error: field === 'total' ? '숫자로 넣어라 (예: 16.49)' : 'YYYY-MM-DD로 넣어라' });
  const cur = await fetch(`${SUPA}/rest/v1/s07_receipts?id=eq.${id}&select=corrected`, { headers: H });
  const corrected = { ...((await cur.json())[0]?.corrected || {}), [field]: true };
  const r = await fetch(`${SUPA}/rest/v1/s07_receipts?id=eq.${id}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ [field]: clean, corrected }),
  });
  if (!r.ok) return res.status(502).json({ error: `DB update ${r.status}` });
  return res.status(200).json({ row: (await r.json())[0] });
}
