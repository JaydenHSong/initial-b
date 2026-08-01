// 버릴 코드. 판정: 서버 함수가 (1) 외부 사이트 HTML을 fetch하고 (2) DB에 행을 넣을 수 있나.
// 스파이크 한정으로 publishable key + 공개 insert 정책 사용. 실구현은 service key를 env로.
const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const KEY = 'sb_publishable_ZYCrRbAghMXoB_dUKG1X1g_TkhCDJYA';

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url query required' });

  // 판정 1: 외부 fetch
  const page = await fetch(target, { redirect: 'follow' });
  const html = await page.text();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || null;

  // 판정 2: DB insert
  const ins = await fetch(`${SUPA}/rest/v1/s01_spike_sites`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ url: target, title }),
  });
  const row = await ins.json();

  res.status(200).json({ fetched: page.status, title, inserted: ins.status, row });
}
