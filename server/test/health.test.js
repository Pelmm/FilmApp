import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import app from '../src/app.js';

test('GET /api/health fungerar utan databas eller API-nyckel', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
