// POST /api/drop { url } — 드랍된 URL의 기획서(/docs/plan.html)를 읽어 sites에 저장한다.
// 기획서가 없으면 그 사이트의 <title>로 폴백. 저장 실패 없이 항상 카드가 생긴다.
const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
// publishable key는 공개 설계 키. service key를 env로 받으면 그쪽을 쓴다.
const KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_ZYCrRbAghMXoB_dUKG1X1g_TkhCDJYA';

const fetchWithTimeout = (url, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { redirect: 'follow', signal: ctrl.signal }).finally(() => clearTimeout(t));
};

// 팀 템플릿의 data-f 필드에서 안쪽 텍스트를 뽑는다
const pick = (html, name) => {
  const m = html.match(new RegExp(`data-f="${name}"[^>]*>\\s*([^<]+?)\\s*<`, 'i'));
  return m ? m[1].trim() : null;
};
const pickTitle = html => {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
};

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

  // 1순위: 규약 경로의 기획서 → 2순위: 사이트 자체의 <title>
  const row = { url: base, sprint: null, title: null, author: null, stack_option: null, intro: null };
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
  } catch { /* 기획서 없음 — 폴백으로 */ }
  if (!row.title) {
    try {
      const page = await fetchWithTimeout(base, 6000);
      if (page.ok) row.title = pickTitle(await page.text());
    } catch { /* 사이트도 못 읽음 — 도메인 카드로 */ }
  }
  if (!row.title) row.title = target.hostname;

  const ins = await fetch(`${SUPA}/rest/v1/sites?on_conflict=url`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!ins.ok) return res.status(502).json({ error: `DB insert ${ins.status}` });
  const saved = await ins.json();

  // 중복 드랍이면 빈 배열이 온다 → 기존 행을 돌려준다
  if (!saved.length) {
    const ex = await fetch(`${SUPA}/rest/v1/sites?url=eq.${encodeURIComponent(base)}&select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const rows = await ex.json();
    return res.status(200).json({ duplicate: true, row: rows[0] || null });
  }
  return res.status(200).json({ duplicate: false, row: saved[0] });
}
