// SPIKE — 버릴 코드다. 지금은 썸네일·카테고리를 뽑을 수 있는지 조사하는 용도다.
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
    const one = (re) => html.match(re)?.[1] ?? null;

    // 브레드크럼 영역 안의 링크 텍스트 = 카테고리 경로
    const crumbBlock = one(/wayfinding-breadcrumbs_feature_div([\s\S]{0,4000}?)<\/div>\s*<\/div>/);
    const crumbs = crumbBlock
      ? [...crumbBlock.matchAll(/class="a-link-normal a-color-tertiary"[^>]*>([\s\S]{0,80}?)<\/a>/g)]
          .map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [];

    res.json({
      status: r.status,
      bytes: html.length,
      ms: Date.now() - t0,
      price: one(/"priceAmount":([0-9.]+)/),
      title: one(/<title>([^<]*)/)?.slice(0, 70) ?? null,
      // 썸네일 후보들 — 어느 게 잡히는지 본다
      img_hiRes: one(/"hiRes":"(https:[^"]+)"/),
      img_large: one(/"large":"(https:[^"]+)"/),
      img_og: one(/<meta property="og:image" content="([^"]+)"/),
      img_landing: one(/id="landingImage"[^>]*src="([^"]+)"/),
      img_dynamic: one(/data-a-dynamic-image="\{&quot;(https:[^&]+)&quot;/),
      // 카테고리 후보
      crumbs,
      titleTail: one(/<title>[^<]*?:\s*([^:<]+)<\/title>/),
      blocked: /api-services-support@amazon\.com|Enter the characters you see|automated access/i.test(html),
    });
  } catch (e) {
    res.status(500).json({ error: String(e), ms: Date.now() - t0 });
  }
}
