// S06 spike — throwaway. Two verdicts in one function:
//   GET /api/spike?mode=reviews&asin=B0...   -> how many review bodies the raw /dp/ HTML carries
//   GET /api/spike?mode=analyze&asin=B0...   -> those reviews through Claude with a JSON schema; returns parsed + usage + cost
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const strip = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+\n/g, '\n').trim();

async function reviewsFromDp(asin) {
  const r = await fetch(`https://www.amazon.com/dp/${asin}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  const html = await r.text();
  const bodies = [...html.matchAll(/data-hook="review-body"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<\/span>/g)].map((m) => strip(m[1])).filter(Boolean);
  const titles = [...html.matchAll(/data-hook="review-title"[^>]*>(?:\s*<span[^>]*>[^<]*<\/span>)?\s*<span>([\s\S]*?)<\/span>/g)].map((m) => strip(m[1]));
  return { status: r.status, kb: Math.round(html.length / 1024), bot: /api-services-support@amazon\.com|Enter the characters you see/i.test(html), bodies, titles };
}

const Summary = z.object({
  positives: z.array(z.string()).max(2).describe('긍정 요인 — 리뷰가 반복해서 칭찬하는 것, 최대 2개, 한국어 한 문장씩'),
  pain_points: z.array(z.string()).max(2).describe('페인포인트 — 리뷰가 반복해서 불평하는 것, 최대 2개, 한국어 한 문장씩'),
  verdict: z.string().describe('총평 한 문장, 한국어'),
});
const PRICE = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5] }; // $/MTok in, out

export default async function handler(req, res) {
  const { mode = 'reviews', asin = 'B09B8V1LZ3' } = req.query;
  const t0 = Date.now();
  const rv = mode === 'analyze' && req.body?.reviews ? { bodies: [] } : await reviewsFromDp(asin);
  if (mode === 'find') {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    const html = await r.text();
    const count = (re) => (html.match(re) || []).length;
    const at = html.indexOf(req.query.q || 'review-body');
    return res.status(200).json({ kb: Math.round(html.length / 1024), bot: /api-services-support@amazon\.com/i.test(html),
      markers: { 'review-body': count(/review-body/g), 'review-text-content': count(/review-text-content/g), 'customer_review-': count(/customer_review-/g), 'reviewsMedley': count(/reviewsMedley/g), 'cm-cr-': count(/cm-cr-/g), 'Top reviews': count(/Top reviews/g), 'review-title': count(/review-title/g) },
      snippet: at >= 0 ? html.slice(Math.max(0, at - 200), at + 500) : null });
  }
  if (mode === 'reviews') {
    return res.status(200).json({ asin, status: rv.status, kb: rv.kb, bot: rv.bot, count: rv.bodies.length, titles: rv.titles.slice(0, 3), sample: rv.bodies.slice(0, 2).map((b) => b.slice(0, 160)), ms: Date.now() - t0 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' });
  const client = new Anthropic();
  const reviews = (Array.isArray(req.body?.reviews) && req.body.reviews.length ? req.body.reviews : rv.bodies).slice(0, 10);
  const t1 = Date.now();
  const msg = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 2000,
    system: '너는 이커머스 운영팀의 리뷰 분석가다. 주어진 아마존 리뷰들에서 반복되는 긍정 요인과 페인포인트를 뽑아 짧게 요약한다. 리뷰에 없는 내용을 지어내지 않는다.',
    messages: [{ role: 'user', content: `다음 리뷰 ${reviews.length}개를 분석해라.\n\n` + reviews.map((r, i) => `[${i + 1}] ${r}`).join('\n\n') }],
    output_config: { format: zodOutputFormat(Summary) },
  });
  const u = msg.usage;
  const cost = Object.fromEntries(Object.entries(PRICE).map(([m, [i, o]]) => [m, +((u.input_tokens * i + u.output_tokens * o) / 1e6).toFixed(5)]));
  return res.status(200).json({ asin, reviews: reviews.length, parsed: msg.parsed_output, stop: msg.stop_reason, usage: u, cost_usd: cost, per_1000: Object.fromEntries(Object.entries(cost).map(([m, c]) => [m, +(c * 1000).toFixed(2)])), claude_ms: Date.now() - t1 });
}
