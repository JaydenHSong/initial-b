// S07 spike #2 — throwaway. Does Google Vision read a real receipt photo?
// POST /api/spike-vision { image_url }  -> text length, first lines, date/total-looking hits
export default async function handler(req, res) {
  if (!process.env.GOOGLE_VISION_KEY) return res.status(500).json({ error: 'GOOGLE_VISION_KEY 미설정' });
  const url = String((req.body || {}).image_url || '');
  if (!url.startsWith('https://mathlgugjqnnhsexvqjy.supabase.co/storage/v1/object/public/s07-receipts/')) return res.status(400).json({ error: 's07-receipts 공개 URL만' });
  const t0 = Date.now();
  const img = await fetch(url); if (!img.ok) return res.status(502).json({ error: `이미지 fetch ${img.status}` });
  const content = Buffer.from(await img.arrayBuffer()).toString('base64');
  const t1 = Date.now();
  const v = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }),
  });
  const j = await v.json();
  if (!v.ok) return res.status(502).json({ error: 'vision', status: v.status, code: j.error?.code, msg: String(j.error?.message || '').slice(0, 120) });
  const text = j.responses?.[0]?.fullTextAnnotation?.text || '';
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  res.status(200).json({
    chars: text.length, lines: lines.length, ms: { fetch: t1 - t0, vision: Date.now() - t1 },
    head: lines.slice(0, 6),
    dates: (text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b[A-Z][a-z]{2} \d{1,2},? \d{4}\b/g) || []).slice(0, 4),
    totals: lines.filter((l) => /total/i.test(l) && !/sub/i.test(l)).slice(0, 4),
  });
}
