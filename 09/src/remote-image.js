const MAX_BYTES = 20 * 1024 * 1024;
const supportedTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function parseImageUrl(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('https://로 시작하는 이미지 주소를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('http:// 또는 https://로 시작하는 공개 이미지 주소를 입력해 주세요.');
  }
  return url;
}

export function getDroppedUrl(transfer) {
  const uri = transfer.getData('text/uri-list').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
  return (uri || transfer.getData('text/plain')).trim();
}

export async function downloadImage(value) {
  const url = parseImageUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let response;
    try {
      response = await fetch(url.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('이미지를 불러올 수 없어요. 주소를 확인하거나, 사이트에서 외부 접근을 막는 경우 파일로 올려주세요.');
    }
    if (!response.ok) throw new Error('이미지 주소를 열 수 없어요. 주소가 유효하고 공개되어 있는지 확인해 주세요.');
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type === 'text/html') throw new Error('웹페이지 주소예요. 사진을 우클릭해 “이미지 주소 복사”를 선택한 뒤 붙여넣어 주세요.');
    if (!supportedTypes[type]) throw new Error('JPG, PNG, WEBP 이미지의 주소를 입력해 주세요.');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('20MB 이하의 이미지 주소를 입력해 주세요.');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('20MB 이하의 이미지 주소를 입력해 주세요.'); }
      chunks.push(chunk);
    }
    let filename = url.pathname.split('/').pop() || 'image';
    try { filename = decodeURIComponent(filename); } catch { /* Keep a usable original name. */ }
    if (!/\.(jpe?g|png|webp)$/i.test(filename)) filename += `.${supportedTypes[type]}`;
    return new File(chunks, filename, { type });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('이미지를 불러오는 데 시간이 걸려요. 잠시 후 다시 시도해 주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}
