import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test, { beforeEach, afterEach } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/User.js';

const runFile = promisify(execFile);
const originalSecret = process.env.JWT_SECRET;
const secret = randomBytes(32).toString('hex');
const credentials = { username: 'Testperson', email: 'test@example.com', password: 'EttSakertLosenord123!' };
let server;
let baseUrl;
let findUser;
let createUser;

beforeEach(async (t) => {
  process.env.JWT_SECRET = secret;
  // Bara modelldelarna ersätts. Ingen Atlas-anslutning eller beständig testdata används.
  findUser = t.mock.method(User, 'findOne', async () => null);
  createUser = t.mock.method(User, 'create', async (data) => {
    const user = new User(data);
    await user.validate();
    return user;
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

afterEach(async () => {
  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function checkToken(body) {
  const payload = jwt.verify(body.token, secret, { algorithms: ['HS256'] });
  assert.equal(payload.sub, body.user.id);
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(body.expiresIn, 3600);
  assert.equal(body.expiresAt, new Date(payload.exp * 1000).toISOString());
  assert.ok(Math.abs(payload.iat - Math.floor(Date.now() / 1000)) < 5);
  assert.throws(() => jwt.verify(body.token, secret, { clockTimestamp: payload.exp + 1 }), { name: 'TokenExpiredError' });
  assert.throws(() => jwt.verify(body.token, randomBytes(32).toString('hex')));
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'username']);
  assert.equal(JSON.stringify(body).includes(credentials.password), false);
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
}

test('registrering normaliserar uppgifter, sparar bcrypt-hash och ger en begränsad JWT-respons', async () => {
  const response = await request('/register', {
    ...credentials, username: ' Testperson ', email: ' TEST@Example.COM ', passwordHash: 'får inte sparas', role: 'admin',
  });
  assert.equal(response.status, 201);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], { email: credentials.email });
  const saved = createUser.mock.calls[0].arguments[0];
  assert.equal(saved.username, credentials.username);
  assert.equal(saved.email, credentials.email);
  assert.notEqual(saved.passwordHash, credentials.password);
  assert.equal(await bcrypt.compare(credentials.password, saved.passwordHash), true);
  assert.equal(bcrypt.getRounds(saved.passwordHash), 12);
  assert.deepEqual(Object.keys(saved).sort(), ['email', 'passwordHash', 'username']);
  assert.equal(JSON.stringify(response.body).includes(saved.passwordHash), false);
  checkToken(response.body);
});

test('samma lösenord får olika salt och hash', async () => {
  await request('/register', credentials);
  await request('/register', { ...credentials, email: 'other@example.com' });
  const first = createUser.mock.calls[0].arguments[0].passwordHash;
  const second = createUser.mock.calls[1].arguments[0].passwordHash;
  assert.notEqual(first, second);
});

test('befintlig e-postadress ger 409 utan att skapa användare', async () => {
  findUser.mock.mockImplementation(async () => ({ email: credentials.email }));
  const response = await request('/register', credentials);
  assert.deepEqual(response, { status: 409, body: { error: 'E-postadressen används redan.' } });
  assert.equal(createUser.mock.callCount(), 0);
});

test('duplicate-key-fel från en samtidig registrering ger också 409', async () => {
  createUser.mock.mockImplementation(async () => {
    const error = new Error('Intern databasdetalj');
    error.code = 11000;
    throw error;
  });
  assert.deepEqual(await request('/register', credentials), {
    status: 409, body: { error: 'E-postadressen används redan.' },
  });
});

test('ogiltiga registreringsfält ger 400 före databasanrop', async () => {
  const invalidFields = [
    { username: undefined }, { username: null }, { username: 12 }, { username: '   ' }, { username: 'a'.repeat(101) },
    { email: undefined }, { email: { $ne: null } }, { email: 'no-address' }, { email: '@example.com' },
    { email: 'a@@example.com' }, { email: 'a@example' }, { email: 'a@.com' }, { email: 'a@b..com' },
    { email: 'a b@example.com' }, { email: 'a\nb@example.com' }, { email: 'a@-example.com' }, { email: '.a@example.com' },
    { email: 'a@example.com/path' }, { email: 'a@example!.com' },
    { password: undefined }, { password: 12 }, { password: 'kort' }, { password: '        ' },
    { password: 'a'.repeat(73) }, { password: 'å'.repeat(37) },
  ];
  for (const fields of invalidFields) {
    const response = await request('/register', { ...credentials, ...fields });
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(response.body), ['error']);
  }
  for (const body of [undefined, {}, [], null]) {
    assert.equal((await request('/register', body)).status, 400);
  }
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(createUser.mock.callCount(), 0);
});

test('ett lösenord på exakt 72 byte ändras eller kapas inte', async () => {
  const password = 'å'.repeat(36);
  assert.equal((await request('/register', { ...credentials, password })).status, 201);
  const hash = createUser.mock.calls[0].arguments[0].passwordHash;
  assert.equal(await bcrypt.compare(password, hash), true);
});

test('inloggning jämför hash och ger JWT utan att lämna ut hashvärdet', async () => {
  const passwordHash = await bcrypt.hash(credentials.password, 12);
  findUser.mock.mockImplementation(async () => new User({ ...credentials, passwordHash }));
  const response = await request('/login', { email: ' TEST@Example.COM ', password: credentials.password });
  assert.equal(response.status, 200);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], { email: credentials.email });
  assert.equal(JSON.stringify(response.body).includes(passwordHash), false);
  assert.equal(createUser.mock.callCount(), 0);
  checkToken(response.body);
});

test('okänd e-post och fel lösenord ger samma neutrala 401-svar', async () => {
  const unknown = await request('/login', credentials);
  const passwordHash = await bcrypt.hash(credentials.password, 12);
  findUser.mock.mockImplementation(async () => new User({ ...credentials, passwordHash }));
  const wrongPassword = await request('/login', { ...credentials, password: 'fel' });
  assert.deepEqual(unknown, { status: 401, body: { error: 'Felaktig e-postadress eller lösenord.' } });
  assert.deepEqual(wrongPassword, unknown);
});

test('ogiltiga inloggningsfält ger 400 före databasanrop', async () => {
  for (const body of [undefined, {}, { email: 12, password: 'test' }, { email: 'fel', password: 'test' },
    { email: credentials.email, password: null }, { email: credentials.email, password: '' },
    { email: credentials.email, password: 'a'.repeat(73) }]) {
    assert.equal((await request('/login', body)).status, 400);
  }
  assert.equal(findUser.mock.callCount(), 0);
});

test('saknad eller för kort JWT_SECRET ger inga tokens och skapar inga konton', async () => {
  for (const value of [undefined, '', 'short', ' '.repeat(40)]) {
    if (value === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = value;
    }
    for (const path of ['/register', '/login']) {
      const response = await request(path, credentials);
      assert.equal(response.status, 500);
      assert.deepEqual(Object.keys(response.body), ['error']);
    }
  }
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(createUser.mock.callCount(), 0);
});

test('databasfel döljs vid registrering och inloggning', async () => {
  findUser.mock.mockImplementation(async () => { throw new Error('Intern anslutningssträng och lösenord'); });
  for (const path of ['/register', '/login']) {
    const response = await request(path, credentials);
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(response.body).includes('Intern'), false);
    assert.deepEqual(Object.keys(response.body), ['error']);
  }
  findUser.mock.mockImplementation(async () => null);
  createUser.mock.mockImplementation(async () => { throw new Error('Intern skrivdetalj'); });
  assert.deepEqual(await request('/register', credentials), {
    status: 500, body: { error: 'Kunde inte registrera användaren. Försök igen senare.' },
  });
});

test('felaktig JSON lämnar aldrig ut requestens lösenord', async () => {
  const response = await fetch(`${baseUrl}/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"hemligt",',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Skicka giltig JSON.' });
});

test('serverstart avvisar saknad databas, svag JWT-hemlighet och ogiltig port före anslutning', async () => {
  const cases = [
    { MONGODB_URI: '', JWT_SECRET: secret, PORT: '3000', message: 'MONGODB_URI saknas' },
    { MONGODB_URI: 'mongodb://127.0.0.1:1/isolated', JWT_SECRET: '', PORT: '3000', message: 'JWT_SECRET måste' },
    { MONGODB_URI: 'mongodb://127.0.0.1:1/isolated', JWT_SECRET: 'short', PORT: '3000', message: 'JWT_SECRET måste' },
    { MONGODB_URI: '', JWT_SECRET: secret, PORT: '65536', message: 'PORT måste' },
  ];
  for (const settings of cases) {
    const { message, ...config } = settings;
    await assert.rejects(runFile(process.execPath, ['src/server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...config, DOTENV_CONFIG_PATH: 'test/nonexistent-env-file' },
      timeout: 5000,
    }), (error) => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes(message));
      assert.equal(error.stdout.includes('Ansluten'), false);
      assert.equal(error.stderr.includes(secret), false);
      return true;
    });
  }
});

async function currentUser(authorization) {
  const headers = {};
  if (authorization) headers.Authorization = authorization;
  const response = await fetch(`${baseUrl}/me`, { headers });
  return { status: response.status, body: await response.json() };
}

test('me verifierar HS256 och sub samt hämtar aktuell användare utan hash', async (t) => {
  const user = new User({ ...credentials, passwordHash: 'inte i svaret' });
  const lookup = t.mock.method(User, 'findById', async (id) => {
    assert.equal(id, String(user._id));
    return user;
  });
  const token = jwt.sign({}, secret, { subject: String(user._id), expiresIn: '1h' });
  const result = await currentUser(`Bearer ${token}`);
  assert.deepEqual(result, {
    status: 200,
    body: { id: String(user._id), username: user.username, email: user.email },
  });
  assert.equal(lookup.mock.callCount(), 1);
  assert.equal(JSON.stringify(result.body).includes(token), false);
});

test('me avvisar saknad, ogiltig och utgången token före databasanrop', async (t) => {
  const lookup = t.mock.method(User, 'findById', async () => { throw new Error('Unexpected database call'); });
  const id = String(new User()._id);
  const expired = jwt.sign({}, secret, { subject: id, expiresIn: -1 });
  const wrongSecret = jwt.sign({}, randomBytes(32).toString('hex'), { subject: id, expiresIn: '1h' });
  const wrongAlgorithm = jwt.sign({}, secret, { subject: id, expiresIn: '1h', algorithm: 'HS384' });
  const invalidId = jwt.sign({}, secret, { subject: 'bad-id', expiresIn: '1h' });
  const noExpiry = jwt.sign({}, secret, { subject: id });
  const invalidHeaders = [undefined, 'Basic abc', 'Bearer', 'Bearer abc extra', 'Bearer abc',
    `Bearer ${expired}`, `Bearer ${wrongSecret}`, `Bearer ${wrongAlgorithm}`, `Bearer ${invalidId}`, `Bearer ${noExpiry}`];
  for (const header of invalidHeaders) {
    assert.deepEqual(await currentUser(header), {
      status: 401,
      body: { error: 'Sessionen är ogiltig eller har gått ut. Logga in igen.' },
    });
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('me ger 401 för borttagen användare och neutrala 500-svar vid driftfel', async (t) => {
  const lookup = t.mock.method(User, 'findById', async () => null);
  const token = jwt.sign({}, secret, { subject: String(new User()._id), expiresIn: '1h' });
  assert.equal((await currentUser(`Bearer ${token}`)).status, 401);
  lookup.mock.mockImplementation(async () => { throw new Error('Intern databasdetalj'); });
  assert.deepEqual(await currentUser(`Bearer ${token}`), {
    status: 500,
    body: { error: 'Kunde inte kontrollera sessionen. Försök igen senare.' },
  });
  delete process.env.JWT_SECRET;
  assert.equal((await currentUser(`Bearer ${token}`)).status, 500);
});
