import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { afterEach, beforeEach } from 'node:test';
import app from '../../server/src/app.js';
import { getApiUrl, getHealth } from '../src/services/api.js';

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
beforeEach(() => { process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3000/api'; });
afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

test('API-adressen normaliseras och kan bytas till HTTPS', () => {
  assert.equal(getApiUrl('/health'), 'http://10.0.2.2:3000/api/health');
  assert.equal(getApiUrl('health', ' https://example.com/api/// '), 'https://example.com/api/health');
});

test('saknad eller felaktig konfiguration ger ett begripligt fel före fetch', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
  for (const value of ['', ' ', 'localhost:3000/api', 'ftp://example.com/api', 'http://', 'https://user:password@example.com/api', 'https://example.com/api?token=value', 'https://example.com/api#fragment']) {
    process.env.EXPO_PUBLIC_API_URL = value;
    await assert.rejects(getHealth(), (error) => error.code === 'CONFIG' && /EXPO_PUBLIC_API_URL/.test(error.message));
  }
  delete process.env.EXPO_PUBLIC_API_URL;
  await assert.rejects(getHealth(), { code: 'CONFIG' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('GET använder rätt endpoint, JSON-header och avbrytningssignal', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/health');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ status: 'ok' }));
  });
  assert.deepEqual(await getHealth(), { status: 'ok' });
});

test('HTTP-fel behandlas som fel även när fetch lyckas', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Server error', { status: 503 }));
  await assert.rejects(getHealth(), (error) => error.code === 'HTTP' && /503/.test(error.message));
});

test('ogiltig JSON och tomma svar hanteras', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const body of ['<html>Not JSON</html>', '']) {
    fetchMock.mock.mockImplementation(async () => new Response(body));
    await assert.rejects(getHealth(), { code: 'INVALID_JSON' });
  }
});

test('JSON måste innehålla status ok i ett objekt', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const data of [null, [], 'ok', {}, { status: 'error' }, { status: true }]) {
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(data)));
    await assert.rejects(getHealth(), { code: 'INVALID_RESPONSE' });
  }
});

test('nätverksfel översätts till ett begripligt meddelande', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(getHealth(), (error) => error.code === 'NETWORK' && /backend är igång/.test(error.message));
});

function pendingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

test('ett väntande anrop har inget resultat innan svaret kommer', async (t) => {
  let respond;
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { respond = resolve; }));
  let settled = false;
  const request = getHealth().then((data) => { settled = true; return data; });
  await Promise.resolve();
  assert.equal(settled, false);
  respond(new Response('{"status":"ok"}'));
  assert.deepEqual(await request, { status: 'ok' });
});

test('timeout avbryter ett långsamt anrop', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);
  await assert.rejects(getHealth({ timeoutMs: 20 }), { code: 'TIMEOUT' });
});

test('extern avbrytning avbryter fetch och skiljs från nätverksfel', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);
  const controller = new AbortController();
  const request = getHealth({ signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('redan avbruten signal hanteras', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(getHealth({ signal: controller.signal }), { name: 'AbortError' });
});

test('timeout och extern listener städas efter ett lyckat anrop', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"status":"ok"}'));
  const controller = new AbortController();
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  const clear = t.mock.method(globalThis, 'clearTimeout');
  await getHealth({ signal: controller.signal });
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(remove.mock.calls[0].arguments[0], 'abort');
  assert.equal(clear.mock.callCount(), 1);
});

async function startServer(port = 0) {
  const server = app.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

function stopServer(server) {
  server.closeAllConnections();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('riktig Express: igång → avstängd → startad igen', async () => {
  let server = await startServer();
  const port = server.address().port;
  process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${port}/api`;
  try {
    assert.deepEqual(await getHealth(), { status: 'ok' });
    await stopServer(server);
    server = null;
    await assert.rejects(getHealth(), { code: 'NETWORK' });
    server = await startServer(port);
    assert.deepEqual(await getHealth(), { status: 'ok' });
  } finally {
    if (server) await stopServer(server);
  }
});
