// POST /api/drop { url } — 드랍된 URL의 기획서(/docs/plan.html)를 읽고,
// 스크린샷을 1회 찍어 Storage에 저장한 뒤 sites에 기록한다. 저장 실패 없이 항상 카드가 생긴다.
const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
// publishable key는 공개 설계 키. service key를 env로 받으면 그쪽을 쓴다.
const KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_ZYCrRbAghMXoB_dUKG1X1g_TkhCDJYA';

const fetchWithTimeout = (url, ms, opts = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { redirect: 'follow', signal: ctrl.signal, ...opts }).finally(() => clearTimeout(t));
};

const pick = (html, name) => {
  const m = html.match(new RegExp(`data-f="${name}"[^>]*>\\s*([^<]+?)\\s*<`, 'i'));
  return m ? m[1].trim() : null;
};
const pickTitle = html => {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
};

// 드랍 시 1회: 스크린샷을 Storage에 복사해 우리 URL을 반환.
// 캡처 자체는 브라우저가 microlink를 호출해 src를 넘긴다 (Vercel 공유 IP는 무료 쿼터가 늘 소진돼 있음).
// src 없이 오면 서버가 직접 시도한다 (API 직접 호출용 폴백).
async function capture(target, src) {
  if (!src) {
    const api = `https://api.microlink.io/?url=${encodeURIComponent(target)}&screenshot=true`;
    const meta = await fetchWithTimeout(api, 15000).then(r => r.json());
    src = meta?.data?.screenshot?.url;
  }
  if (!src) return null;
  // 서버가 fetch하는 건 microlink CDN만 — 임의 URL 프록시 방지
  if (!/\.microlink\.io$/.test(new URL(src).hostname)) return null;
  const img = await fetchWithTimeout(src, 10000);
  if (!img.ok) return null;
  const buf = await img.arrayBuffer();
  const name = new URL(target).hostname.replace(/[^a-z0-9.-]/gi, '_') + '.png';
  const up = await fetch(`${SUPA}/storage/v1/object/shots/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'image/png', 'x-upsert': 'true',
    },
    body: buf,
  });
  if (!up.ok) return null;
  return `${SUPA}/storage/v1/object/public/shots/${name}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let target;
  try {
    target = new URL(String((req.body || {}).url || '').trim());
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'http(s) URL이 아니다' });
  }
  const base = target.origin + target.pathname.replace(/\/+$/, '');

  const row = { url: base, sprint: null, title: null, author: null, stack_option: null, intro: null, shot_url: null };
  try {
    const plan = await fetchWithTimeout(`${base}/docs/plan.html`, 6000);
    if (plan.ok) {
      const html = await plan.text();
      row.sprint = pick(html, 'sprint');
      row.author = pick(html, 'author');
      row.stack_option = pick(html, 'option');
      row.intro = pick(html, 'intro');
      row.title = pick(html, 'title') || pickTitle(html);
    }
  } catch { /* 기획서 없음 — 폴백 */ }
  if (!row.title) {
    try {
      const page = await fetchWithTimeout(base, 6000);
      if (page.ok) row.title = pickTitle(await page.text());
    } catch { /* 도메인 카드로 */ }
  }
  if (!row.title) row.title = target.hostname;

  try { row.shot_url = await capture(base, (req.body || {}).shot_src); } catch { /* 썸네일 없이 저장 */ }

  const ins = await fetch(`${SUPA}/rest/v1/sites?on_conflict=url`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!ins.ok) return res.status(502).json({ error: `DB insert ${ins.status}` });
  const saved = await ins.json();

  if (!saved.length) {
    const ex = await fetch(`${SUPA}/rest/v1/sites?url=eq.${encodeURIComponent(base)}&select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const rows = await ex.json();
    return res.status(200).json({ duplicate: true, row: rows[0] || null });
  }
  return res.status(200).json({ duplicate: false, row: saved[0] });
}
