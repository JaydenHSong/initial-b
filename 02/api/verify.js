// SPIKE — 버릴 코드다. 수요일 구현 때 price.js와 함께 지운다.
// Vercel에 SENSITIVE로 저장된 값은 되읽을 수 없어, 런타임 안에서만 검증된다.
// 비밀은 절대 응답에 싣지 않는다 — 모양만 확인한다.
export default async function handler(req, res) {
  if (req.query.run !== 's02') {
    return res.status(400).json({ error: '?run=s02 를 붙여라 (실수로 채팅에 알림이 가는 걸 막는다)' });
  }
  const out = {};

  // 1. 서비스 계정 JSON이 저장 과정에서 안 깨졌나
  try {
    const k = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
    out.serviceAccount = {
      ok: true,
      projectId: k.project_id,
      clientEmail: k.client_email,
      privateKeyChars: k.private_key?.length ?? 0,
      privateKeyNewlines: (k.private_key?.match(/\n/g) || []).length,
      pemHeaderOk: !!k.private_key?.startsWith('-----BEGIN PRIVATE KEY-----'),
    };
  } catch (e) {
    out.serviceAccount = { ok: false, error: String(e.message).slice(0, 160) };
  }

  // 2. Google Chat 웹훅이 실제로 받나
  const url = process.env.GCHAT_WEBHOOK;
  if (!url) {
    out.chat = { ok: false, error: 'GCHAT_WEBHOOK 없음' };
  } else {
    try {
      const t = Date.now();
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          text: '*S02 ASIN 스크랩북 — 웹훅 연결 테스트*\nVercel 함수에서 보냈습니다. 이 메시지가 보이면 크론이 가격 하락 알림을 여기로 보낼 수 있습니다. (지워도 됩니다)',
        }),
      });
      out.chat = { ok: r.ok, status: r.status, ms: Date.now() - t };
      if (!r.ok) out.chat.body = (await r.text()).slice(0, 200);
    } catch (e) {
      out.chat = { ok: false, error: String(e.message).slice(0, 160) };
    }
  }

  res.status(200).json(out);
}
