import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function toWebRequest(req: IncomingMessage) {
  const protocol = 'http';
  const host = req.headers.host ?? 'localhost:3000';
  const url = `${protocol}://${host}${req.url ?? '/'}`;
  const body = req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : await readRequestBody(req);

  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body,
    ...(body ? ({ duplex: 'half' } as RequestInit) : {}),
  } as RequestInit);
}

export async function sendWebResponse(res: ServerResponse, webResponse: Response) {
  res.statusCode = webResponse.status;

  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const arrayBuffer = await webResponse.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

export { createServer };
