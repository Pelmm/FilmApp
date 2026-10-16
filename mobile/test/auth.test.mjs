import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { beforeEach, afterEach } from 'node:test';
import { registerUser, loginUser } from '../src/services/api.js';

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const user = {
  id: 'test-user-id',
  username: 'Testperson',
  email: 'test@example.com',
};
const credentials = {
  username: user.username,
  email: user.email,
  password: 'Testlosenord123!',
};

function authResponse() {
  return {
    token: randomBytes(32).toString('hex'),
    expiresIn: 3600,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    user: { ...user },
  };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3000/api';
});

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  }
});

test('registrering skickar rätt JSON till konfigurerad Express-adress', async (t) => {
  const data = authResponse();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/auth/register');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), credentials);
    return Response.json(data, { status: 201 });
  });

  assert.deepEqual(await registerUser({
    username: ' Testperson ',
    email: ' test@example.com ',
    password: credentials.password,
    confirmPassword: credentials.password,
  }), user);
});

test('inloggning skickar bara e-post och oförändrat lösenord', async (t) => {
  const password = ' Lösenord med blanksteg ';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/auth/login');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      email: user.email,
      password,
    });
    return Response.json(authResponse());
  });

  assert.deepEqual(await loginUser({ email: ' test@example.com ', password }), user);
});

test('felaktiga inloggningsuppgifter och upptagen e-post ger backendens begripliga fel', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: 'Felaktig e-postadress eller lösenord.',
  }, { status: 401 }));

  await assert.rejects(loginUser(credentials), {
    message: 'Felaktig e-postadress eller lösenord.',
  });

  mock.mock.mockImplementation(async () => Response.json({
    error: 'E-postadressen används redan.',
  }, { status: 409 }));

  await assert.rejects(registerUser(credentials), {
    message: 'E-postadressen används redan.',
  });

  mock.mock.mockImplementation(async () => Response.json({
    error: 'Ange en giltig e-postadress.',
  }, { status: 400 }));

  await assert.rejects(registerUser(credentials), {
    message: 'Ange en giltig e-postadress.',
  });
});

test('båda auth-anropen hanterar nätverksfel och serverfel', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Network request failed');
  });

  for (const action of [registerUser, loginUser]) {
    await assert.rejects(action(credentials), {
      message: 'Kunde inte nå servern. Kontrollera att backend är igång och att backendadressen och nätverket stämmer. Försök igen.',
    });
  }

  mock.mock.mockImplementation(async () => Response.json({
    error: 'Kunde inte logga in. Försök igen senare.',
  }, { status: 500 }));

  await assert.rejects(loginUser(credentials), {
    message: 'Kunde inte logga in. Försök igen senare.',
  });
});

function pendingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
  });
}

test('båda auth-anropen har timeout och stödjer avbrytning', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);

  for (const action of [registerUser, loginUser]) {
    await assert.rejects(action(credentials, { timeoutMs: 20 }), {
      message: 'Servern svarade inte i tid. Kontrollera anslutningen och försök igen.',
    });

    const controller = new AbortController();
    const pending = action(credentials, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  }
});

test('ogiltig JSON och ofullständiga auth-svar avvisas', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('Not JSON'));
  await assert.rejects(loginUser(credentials), {
    message: 'Servern skickade ett svar som inte är giltig JSON. Försök igen.',
  });

  for (const data of [null, {}, { user }, { token: 'test', user: {} }]) {
    mock.mock.mockImplementation(async () => Response.json(data));
    await assert.rejects(loginUser(credentials), {
      message: 'Servern skickade ett ogiltigt autentiseringssvar. Försök igen.',
    });
  }
});

test('JWT returneras inte till skärmarna och auth-anropen loggar inga uppgifter', async (t) => {
  const log = t.mock.method(console, 'log');
  const warn = t.mock.method(console, 'warn');
  const error = t.mock.method(console, 'error');
  const data = authResponse();
  data.user.passwordHash = 'får inte lämnas vidare';
  t.mock.method(globalThis, 'fetch', async () => Response.json(data));

  for (const action of [registerUser, loginUser]) {
    const result = await action(credentials);
    assert.deepEqual(Object.keys(result).sort(), ['email', 'id', 'username']);
    assert.equal(JSON.stringify(result).includes(data.token), false);
    assert.equal(result.passwordHash, undefined);
  }

  assert.equal(log.mock.callCount(), 0);
  assert.equal(warn.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});
