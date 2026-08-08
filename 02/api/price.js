// SPIKE — 버릴 코드다. 판정 하나: Vercel 데이터센터 IP에서 아마존 가격이 나오나?
export default async function handler(req, res) {
  const asin = req.query.asin || 'B0H1GTPMC4';
  const t0 = Date.now();
  try {
    const r = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = await r.text();
    res.json({
      status: r.status,
      bytes: html.length,
      ms: Date.now() - t0,
      price: html.match(/"priceAmount":([0-9.]+)/)?.[1] ?? null,
      title: html.match(/<title>([^<]*)/)?.[1]?.slice(0, 80) ?? null,
      blocked: /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html),
    });
  } catch (e) {
    res.status(500).json({ error: String(e), ms: Date.now() - t0 });
  }
}
