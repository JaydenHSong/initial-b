// POST /api/analyze { text } — 붙여넣은 리뷰 덩어리를 리뷰 단위로 나눠 Claude(Sonnet 5)에
// 구조화 출력으로 보내고, 5줄 JSON + usage + 비용을 돌려준다. 호출마다 s06_analyses에
// 원장을 남긴다 — "1천 건이면 얼마"는 이 원장의 누적 실측에서 나온다.
// API 키는 여기(서버)에만 있다. 브라우저는 이 함수만 부른다.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const MODEL = 'claude-sonnet-5';
const PRICE = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5] }; // $/MTok in, out

// 스키마가 5줄을 강제한다: 긍정 ≤2 + 페인포인트 ≤2 + 총평 1
const Summary = z.object({
  positives: z.array(z.string()).max(2).describe('긍정 요인 — 리뷰가 반복해서 칭찬하는 것. 최대 2개, 한국어 한 문장씩'),
  pain_points: z.array(z.string()).max(2).describe('페인포인트 — 리뷰가 반복해서 불평하는 것. 최대 2개, 한국어 한 문장씩'),
  verdict: z.string().describe('총평 한 문장, 한국어'),
});

// 입력은 세 모양 중 하나다: ① 북마클릿이 넘긴 리뷰 목록(빈 줄 구분) ② 아마존 리뷰 페이지를
// 통째로 복사한 텍스트 ③ 손으로 고른 리뷰 몇 개. ②는 "Reviewed in … on <날짜>" 줄이
// 리뷰마다 붙는 것을 경계로 삼고, 앞의 메타(Verified Purchase·옵션)와 뒤의
// "N people found this helpful / Helpful / Report"를 잘라낸다.
function splitReviews(text) {
  const chunks = text.split(/\n(?=[ \t]*Reviewed in [^\n]+? on [A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (chunks.length >= 2) {
    const out = [];
    for (let i = 1; i < chunks.length; i++) {
      let lines = chunks[i].split('\n').map((l) => l.trim());
      lines.shift(); // "Reviewed in … on …"
      while (lines.length && /Verified Purchase|^(Color|Colour|Size|Style|Pattern Name|Material|Model)\s*:|^Vine Customer|^Early Reviewer|^Amazon Vine/i.test(lines[0])) lines.shift();
      const end = lines.findIndex((l) => /found this helpful|^Helpful$|^Report$|^Report abuse$|^Translate review/i.test(l));
      if (end >= 0) lines = lines.slice(0, end);
      const body = lines.filter((l) => l && !/^Read more$/i.test(l)).join('\n').trim();
      const prevLines = chunks[i - 1].trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const starLine = [...prevLines].reverse().find((l) => /out of 5 stars/i.test(l)) || '';
      const title = starLine.replace(/^.*?out of 5 stars\s*/i, '').trim() || (prevLines.length && !/out of 5 stars/i.test(prevLines[prevLines.length - 1]) ? prevLines[prevLines.length - 1] : '');
      if (body.length > 5) out.push(title && title.length < 120 ? `${title} — ${body}` : body);
    }
    if (out.length) return out.slice(0, 20);
  }
  let parts = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) parts = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  return parts.map((s) => s.replace(/^\s*\d+[.)]\s*/, '')).filter((s) => s.length > 5).slice(0, 20);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' });
  const text = String((req.body || {}).text || '').trim();
  const reviews = splitReviews(text);
  if (reviews.length < 1) return res.status(400).json({ error: '리뷰를 붙여넣어라 — 리뷰 사이는 빈 줄로' });

  const client = new Anthropic();
  const t0 = Date.now();
  let msg;
  try {
    msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: '너는 이커머스 운영팀의 리뷰 분석가다. 주어진 아마존 리뷰들에서 반복되는 긍정 요인과 페인포인트를 뽑아 짧게 요약한다. 리뷰에 없는 내용을 지어내지 않는다. 한 리뷰에만 나온 것보다 여러 리뷰에서 반복된 것을 우선한다.',
      messages: [{ role: 'user', content: `다음 리뷰 ${reviews.length}개를 분석해라.\n\n` + reviews.map((r, i) => `[${i + 1}] ${r}`).join('\n\n') }],
      output_config: { format: zodOutputFormat(Summary) },
    });
  } catch (e) {
    return res.status(502).json({ error: 'Claude 호출 실패: ' + String(e.message).slice(0, 120) });
  }
  const ms = Date.now() - t0;
  if (!msg.parsed_output) return res.status(502).json({ error: `JSON 파싱 실패 (stop_reason: ${msg.stop_reason})` });

  const u = msg.usage;
  const cost = Object.fromEntries(Object.entries(PRICE).map(([m, [i, o]]) => [m, +((u.input_tokens * i + u.output_tokens * o) / 1e6).toFixed(6)]));

  // 원장 기록 — 실패해도 결과는 돌려준다 (기록은 부수, 분석이 본체)
  let id = null;
  if (KEY) {
    const ins = await fetch(`${SUPA}/rest/v1/s06_analyses`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        review_count: reviews.length, input_chars: text.length, result: msg.parsed_output, model: MODEL,
        input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost_usd: cost[MODEL], ms,
      }),
    }).catch(() => null);
    if (ins?.ok) id = (await ins.json())[0]?.id ?? null;
  }

  return res.status(200).json({
    id, model: MODEL, reviews: reviews.length, result: msg.parsed_output,
    usage: { input: u.input_tokens, output: u.output_tokens },
    cost_usd: cost[MODEL], per_1000: Object.fromEntries(Object.entries(cost).map(([m, c]) => [m, +(c * 1000).toFixed(2)])), ms,
  });
}
