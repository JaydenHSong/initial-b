// POST /api/analyze { image_url } — Storage에 이미 올라간 영수증 사진 URL을 받아
// ① Google Vision(DOCUMENT_TEXT_DETECTION)으로 글자를 뽑고 ② 그 텍스트를 Claude(Sonnet 5)
// 구조화 출력으로 날짜·총액·가게명 3열로 만들고 ③ s07_receipts에 한 행을 남긴다.
// 키(Vision·Anthropic·service)는 전부 여기(서버)에만 있다. DB엔 파일이 아니라 URL만.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const SUPA = 'https://mathlgugjqnnhsexvqjy.supabase.co';
const PUB = `${SUPA}/storage/v1/object/public/s07-receipts/`;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const Receipt = z.object({
  merchant: z.string().describe('가게 이름 — 영수증 상단의 상호만. 주소·전화번호·슬로건 제외. 원문 표기 그대로 (예: Ralphs, Costco Wholesale)'),
  date: z.string().describe('거래 날짜를 YYYY-MM-DD로. 두 자리 연도(09/09/26)는 20xx로. 영수증에 없으면 빈 문자열'),
  total: z.number().nullable().describe('최종 결제 총액(달러 숫자). 팁을 손으로 더한 TOTAL이 있으면 그 값. Subtotal·Tax·Savings·Change·Balance 이전 값이 아니다. 못 찾으면 null'),
  category: z.enum(['식비', '식료품', '교통', '숙박', '사무용품', '장비', '접대', '기타']).describe('경비 분류 — 식비(식당·카페), 식료품(마트·슈퍼), 교통(주유·주차·라이드), 숙박, 사무용품(문구·소모품), 장비(전자기기·공구), 접대(고객 동반 식사·선물), 기타. 가게명과 항목으로 판단'),
});

async function insert(row) {
  const r = await fetch(`${SUPA}/rest/v1/s07_receipts`, { method: 'POST', headers: H, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`DB insert ${r.status}`);
  return (await r.json())[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY || !process.env.GOOGLE_VISION_KEY || !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: '서버 키 미설정' });
  const url = String((req.body || {}).image_url || '');
  if (!url.startsWith(PUB)) return res.status(400).json({ error: '영수증 버킷의 공개 URL만 받는다' });

  // ① Vision — 이미지는 서버가 받아 base64로 보낸다 (Storage URL을 Vision에 직접 주지 않는다)
  const img = await fetch(url);
  if (!img.ok) return res.status(502).json({ error: `이미지를 못 읽었다 (${img.status})` });
  const content = Buffer.from(await img.arrayBuffer()).toString('base64');
  const t0 = Date.now();
  const v = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }),
  });
  const vj = await v.json();
  if (!v.ok) return res.status(502).json({ error: `Vision ${v.status}: ${String(vj.error?.message || '').slice(0, 100)}` });
  const text = vj.responses?.[0]?.fullTextAnnotation?.text || '';
  const visionMs = Date.now() - t0;
  if (text.trim().length < 20) {
    const row = await insert({ image_url: url, status: 'failed', ocr_text: text, ocr_chars: text.length, note: `Vision이 글자를 못 읽었다 (${text.length}자)` });
    return res.status(200).json({ row });
  }

  // ② Claude — 텍스트를 3열로. 스키마가 형태를 강제한다
  const t1 = Date.now();
  let parsed;
  try {
    const msg = await new Anthropic().messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: '너는 경비 정산 담당자다. OCR로 읽은 영수증 텍스트에서 가게명·거래 날짜·최종 결제 총액을 뽑는다. 텍스트에 없는 값을 지어내지 않는다.',
      messages: [{ role: 'user', content: `영수증 OCR 텍스트:\n\n${text}` }],
      output_config: { format: zodOutputFormat(Receipt) },
    });
    parsed = msg.parsed_output;
    if (!parsed) throw new Error(`stop_reason ${msg.stop_reason}`);
  } catch (e) {
    const row = await insert({ image_url: url, status: 'failed', ocr_text: text, ocr_chars: text.length, note: '구조화 실패: ' + String(e.message).slice(0, 80) });
    return res.status(200).json({ row });
  }

  // ③ 기록 — 날짜가 YYYY-MM-DD 꼴이 아니면 비워둔다 (틀린 값보다 빈 값)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const row = await insert({
    image_url: url, merchant: parsed.merchant || null, receipt_date: date, total: parsed.total, category: parsed.category || null,
    ocr_text: text, ocr_chars: text.length, status: 'ok',
    note: `vision ${visionMs}ms · claude ${Date.now() - t1}ms`,
  });
  return res.status(200).json({ row });
}
