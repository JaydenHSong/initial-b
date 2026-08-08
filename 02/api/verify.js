// SPIKE — 버릴 코드다. 수요일 구현 때 price.js와 함께 지운다.
// Vercel에 SENSITIVE로 저장된 값은 되읽을 수 없어, 런타임 안에서만 검증된다.
// 붙여넣다 한 글자라도 깨지면 수요일에야 드러난다 — 그걸 오늘 확인한다.
// 비밀은 절대 응답에 싣지 않는다. 모양만 본다.
export default async function handler(req, res) {
  try {
    const k = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
    res.status(200).json({
      ok: true,
      projectId: k.project_id,
      clientEmail: k.client_email,
      privateKeyChars: k.private_key?.length ?? 0,
      privateKeyNewlines: (k.private_key?.match(/\n/g) || []).length,
      pemHeaderOk: !!k.private_key?.startsWith('-----BEGIN PRIVATE KEY-----'),
      pemFooterOk: !!k.private_key?.trimEnd().endsWith('-----END PRIVATE KEY-----'),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message).slice(0, 200) });
  }
}
