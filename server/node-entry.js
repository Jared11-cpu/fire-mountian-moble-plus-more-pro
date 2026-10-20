import http from 'node:http';
import worker from './index.js';

const hostname = String(process.env.HOST || '127.0.0.1').trim();
const port = parsePort(process.env.PORT || '8787');

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const response = await worker.fetch(request, process.env);
    await sendWebResponse(response, outgoing);
  } catch (error) {
    console.error('[chuyou-api] Unhandled request error:', error);
    if (!outgoing.headersSent) {
      outgoing.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
    }
    outgoing.end(JSON.stringify({ error: '服务暂时不可用，请稍后重试' }));
  }
});

server.listen(port, hostname, () => {
  console.log(`[chuyou-api] Listening on http://${hostname}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error('[chuyou-api] Shutdown error:', error);
        process.exitCode = 1;
      }
      process.exit();
    });
  });
}

async function toWebRequest(incoming) {
  const protocol = firstHeaderValue(incoming.headers['x-forwarded-proto']) || 'http';
  const host = incoming.headers.host || `${hostname}:${port}`;
  const url = new URL(incoming.url || '/', `${protocol}://${host}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const method = String(incoming.method || 'GET').toUpperCase();
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : Buffer.concat(await readIncomingBody(incoming));

  return new Request(url, {
    method,
    headers,
    body,
    ...(body ? { duplex: 'half' } : {}),
  });
}

async function sendWebResponse(response, outgoing) {
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  outgoing.writeHead(response.status, headers);

  if (!response.body) {
    outgoing.end();
    return;
  }

  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function readIncomingBody(incoming) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    incoming.on('end', () => resolve(chunks));
    incoming.on('error', reject);
  });
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0]?.split(',')[0]?.trim();
  return String(value || '').split(',')[0].trim();
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return parsed;
}
