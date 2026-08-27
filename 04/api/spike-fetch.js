// S04 spike #1 — throwaway. Is Amazon still reachable today from a datacenter IP?
// Direct fetch first; if it fails and BRD_WS is set, retry via Bright Data browser.
// GET /api/spike-fetch?asin=B0H1GTPMC4
import puppeteer from 'puppeteer-core';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const isBot = (html) => /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html);

// Same discrimination as S02: blocked / gone / priced / soft-blocked-or-unavailable.
function read(html) {
  if (isBot(html)) return { ok: false, why: `bot page ${html.length}B` };
  const price = html.match(/"priceAmount":([0-9.]+)/)?.[1];
  if (price) return { ok: true, price: Number(price) };
  if (/currently unavailable|see all buying options/i.test(html)) return { ok: false, why: 'unavailable (or soft block)' };
  return { ok: false, why: `no price marker (${Math.round(html.length / 1024)}KB)` };
}

export default async function handler(req, res) {
  // ?probe=1 — report the SHAPE of BRD_WS (never the secret itself) to debug 407s.
  if (req.query.probe) {
    const v = process.env.BRD_WS || '';
    let u = null;
    try { u = new URL(v); } catch { /* not a URL */ }
    return res.status(200).json({
      set: !!v, len: v.length,
      scheme: u?.protocol ?? 'unparsable',
      hasAuth: v.includes('@'),
      userShape: u?.username ? u.username.replace(/(customer-)[^-]+/, '$1***') : '(none)',
      pwLen: u?.password?.length ?? 0,
      host: u ? `${u.hostname}:${u.port}` : '(none)',
    });
  }
  const asin = req.query.asin || 'B0H1GTPMC4';
  const url = `https://www.amazon.com/dp/${asin}`;
  const out = {};

  let t = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    const html = await r.text();
    // ?find=<문자열> — 해당 문자열 주변 마크업을 돌려준다 (로컬 IP는 봇 페이지라 여기서 봐야 한다)
    if (req.query.find) {
      const needle = String(req.query.find);
      const hits = [];
      for (let i = html.indexOf(needle); i !== -1 && hits.length < 3; i = html.indexOf(needle, i + 1)) {
        hits.push(html.slice(Math.max(0, i - 60), i + 200));
      }
      return res.status(200).json({ kb: Math.round(html.length / 1024), count: hits.length, hits });
    }
    out.direct = { status: r.status, kb: Math.round(html.length / 1024), ms: Date.now() - t, ...read(html) };
  } catch (e) {
    out.direct = { ok: false, why: String(e.message).slice(0, 60), ms: Date.now() - t };
  }

  if (!out.direct.ok && process.env.BRD_WS) {
    t = Date.now();
    let browser = null;
    try {
      browser = await puppeteer.connect({ browserWSEndpoint: process.env.BRD_WS });
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (q) => ['image', 'font', 'media'].includes(q.resourceType()) ? q.abort() : q.continue());
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(
        () => /"priceAmount":|currently unavailable|see all buying options/i.test(document.documentElement.innerHTML),
        { timeout: 12000 },
      ).catch(() => {});
      const html = await page.content();
      out.proxy = { kb: Math.round(html.length / 1024), ms: Date.now() - t, ...read(html) };
    } catch (e) {
      out.proxy = { ok: false, why: String(e.message).slice(0, 60), ms: Date.now() - t };
    } finally {
      await browser?.close().catch(() => {});
    }
  } else if (!out.direct.ok) {
    out.proxy = 'BRD_WS not set — register it in initial-b04 to judge the fallback path';
  }

  res.status(200).json(out);
}
