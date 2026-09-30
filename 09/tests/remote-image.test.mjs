import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImageUrl, getDroppedUrl, downloadImage } from '../src/remote-image.js';

test('accepts direct HTTP URLs and rejects executable or credentialed URLs', () => {
  assert.equal(parseImageUrl(' https://example.com/photo.png?size=800 ').hostname, 'example.com');
  for (const value of ['not a url', 'javascript:alert(1)', 'data:image/png,abc', 'https://user:pass@example.com/a.png']) assert.throws(() => parseImageUrl(value));
});
test('URL drop uses URI list first, ignores comment lines, falls back to plain text', () => {
  assert.equal(getDroppedUrl({ getData: type => type === 'text/uri-list' ? '# comment\r\nhttps://example.com/a.png\r\nhttps://example.com/b.png' : 'wrong' }), 'https://example.com/a.png');
  assert.equal(getDroppedUrl({ getData: type => type === 'text/plain' ? ' https://example.com/a.png ' : '' }), 'https://example.com/a.png');
});
test('downloads an image as a file without credentials or a referrer', async t => {
  let options;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { options = init; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }); });
  const file = await downloadImage('https://example.com/my%20photo?size=200');
  assert.equal(file.name, 'my photo.png'); assert.equal(file.type, 'image/png'); assert.equal(file.size, 3);
  assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
});
test('HTML pages receive actionable image-address guidance', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  await assert.rejects(downloadImage('https://example.com/page'), /웹페이지 주소/);
});
test('blocked network access is explained and not bypassed', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(downloadImage('https://example.com/a.png'), /외부 접근/);
});
test('streaming limit also applies when content length is absent', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(20 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }));
  await assert.rejects(downloadImage('https://example.com/a.png'), /20MB/);
});
