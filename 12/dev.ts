import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { POST } from './api/mcp.js';

createServer(async (req, res) => {
  try {
    const path = new URL(req.url!, 'http://localhost:3012').pathname;
    if (path === '/api/mcp') {
      const chunks: Buffer[] = [];
      if (req.method === 'POST') for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = req.method === 'POST' ? Buffer.concat(chunks) : undefined;
      const response = await POST(new Request('http://localhost:3012/api/mcp', {
        method: req.method, headers: req.headers as Record<string, string>, body
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body as never).pipe(res);
      else res.end();
      return;
    }
    const pages: Record<string, string> = {
      '/': 'index.html', '/docs/plan.html': 'docs/plan.html', '/docs/report.html': 'docs/report.html',
      '/docs/setup.html': 'docs/setup.html', '/docs/demo.html': 'docs/demo.html'
    };
    if (!pages[path]) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await readFile(new URL(`./public/${pages[path]}`, import.meta.url)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request failed');
    res.writeHead(500).end('Request failed');
  }
}).listen(3012, '127.0.0.1', () => console.error('http://localhost:3012'));
