import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from '../server.js';

const handler = createMcpHandler(() => createServer());

export async function POST(request: Request) {
  return handler.fetch(request);
}

export async function GET(request: Request) {
  return handler.fetch(request);
}

export async function DELETE(request: Request) {
  return handler.fetch(request);
}
