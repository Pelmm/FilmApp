import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import test, { beforeEach, afterEach } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Review from '../src/models/Review.js';

const realFetch = globalThis.fetch;
const originalSecret = process.env.JWT_SECRET;
const secret = randomBytes(32).toString('hex');
const actor = new User({ username: 'Recensent', email: 'private@example.com', passwordHash: 'private-hash' });
const other = new User({ username: 'Annan användare', email: 'other@example.com', passwordHash: 'other-hash' });
const input = { movieId: 550, rating: 8, text: 'En bra film.' };
const createdAt = new Date('2026-01-01T12:00:00.000Z');
let server;
let baseUrl;
let token;
let findUser;
let findReviews;
let findReview;
let createReview;
let deleteReview;
let sortReviews;
let populateReviews;

// Efterliknar ett dokument med save och populate utan att något sparas i databasen.
function reviewDocument(t, fields = {}) {
  const review = {
    _id: new Review()._id,
    user: actor._id,
    ...input,
    createdAt,
    updatedAt: createdAt,
    ...fields,
  };
  review.save = t.mock.fn(async () => review);
  review.populate = t.mock.fn(async (path, selection) => {
    assert.equal(path, 'user');
    assert.equal(selection, 'username');
    if (review.user) {
      review.user = String(review.user) === String(actor._id) ? actor : other;
    }
    return review;
  });
  return review;
}

beforeEach(async (t) => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({}, secret, { subject: String(actor._id), expiresIn: '1h' });
  // Alla databasmetoder som routern kan använda ersätts. Ingen Atlas-anslutning görs.
  findUser = t.mock.method(User, 'findById', async () => actor);
  populateReviews = t.mock.fn(async () => []);
  sortReviews = t.mock.fn(() => ({ populate: populateReviews }));
  findReviews = t.mock.method(Review, 'find', () => ({ sort: sortReviews }));
  findReview = t.mock.method(Review, 'findById', async () => null);
  createReview = t.mock.method(Review, 'create', async (fields) => {
    await new Review(fields).validate();
    return reviewDocument(t, fields);
  });
  deleteReview = t.mock.method(Review, 'deleteOne', async () => ({ deletedCount: 1 }));

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/reviews`;
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

async function request(path, { method = 'GET', body, authorization = `Bearer ${token}` } = {}) {
  const headers = {};
  if (authorization) headers.Authorization = authorization;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('publik filmlista filtrerar på film, sorterar nyaste först och visar bara tillåtna fält', async (t) => {
  const review = reviewDocument(t, { user: actor, internal: 'private-value' });
  populateReviews.mock.mockImplementation(async () => [review]);
  const response = await request('/movie/550', { authorization: null });
  assert.equal(response.status, 200);
  assert.deepEqual(findReviews.mock.calls[0].arguments[0], { movieId: 550 });
  assert.deepEqual(sortReviews.mock.calls[0].arguments[0], { createdAt: -1, _id: -1 });
  assert.deepEqual(populateReviews.mock.calls[0].arguments, ['user', 'username']);
  assert.deepEqual(response.body, {
    reviews: [{
      id: String(review._id),
      ...input,
      user: { id: String(actor._id), username: actor.username },
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    }],
  });
  const output = JSON.stringify(response.body);
  for (const privateValue of ['private-hash', 'private@example.com', 'private-value', token, secret]) {
    assert.equal(output.includes(privateValue), false);
  }
  assert.equal(findUser.mock.callCount(), 0);
});

test('film utan recensioner ger en tom lista och borttagen recensent hanteras', async (t) => {
  assert.deepEqual(await request('/movie/550', { authorization: null }), {
    status: 200, body: { reviews: [] },
  });
  populateReviews.mock.mockImplementation(async () => [reviewDocument(t, { user: null })]);
  const response = await request('/movie/550', { authorization: null });
  assert.deepEqual(response.body.reviews[0].user, { id: null, username: 'Borttagen användare' });
});

test('film-ID i URL måste bestå av siffror och vara ett positivt, säkert heltal', async () => {
  for (const id of ['0', '-1', '1.5', '1e2', '0x10', 'abc', '%20550', '550%20', 'NaN', 'Infinity',
    String(Number.MAX_SAFE_INTEGER + 1), '%D9%A1']) {
    assert.equal((await request(`/movie/${id}`, { authorization: null })).status, 400);
  }
  assert.equal(findReviews.mock.callCount(), 0);
  assert.equal((await request('/movie/000550', { authorization: null })).status, 200);
  assert.deepEqual(findReviews.mock.calls[0].arguments[0], { movieId: 550 });
  assert.equal((await request(`/movie/${Number.MAX_SAFE_INTEGER}`, { authorization: null })).status, 200);
});

test('mine hämtar enbart JWT-användarens recensioner oavsett queryparametrar', async (t) => {
  populateReviews.mock.mockImplementation(async () => [reviewDocument(t, { user: actor })]);
  const response = await request(`/mine?user=${other._id}&userId=${other._id}`);
  assert.equal(response.status, 200);
  assert.equal(String(findReviews.mock.calls[0].arguments[0].user), String(actor._id));
  assert.deepEqual(sortReviews.mock.calls[0].arguments[0], { createdAt: -1, _id: -1 });
  assert.deepEqual(populateReviews.mock.calls[0].arguments, ['user', 'username']);
  assert.equal(response.body.reviews[0].user.id, String(actor._id));
});

test('POST använder JWT-ägaren, trimmar text och returnerar 201', async () => {
  const response = await request('', { method: 'POST', body: { ...input, text: '  En bra film.  ' } });
  assert.equal(response.status, 201);
  const saved = createReview.mock.calls[0].arguments[0];
  assert.equal(String(saved.user), String(actor._id));
  assert.equal(saved.text, input.text);
  assert.deepEqual(Object.keys(saved).sort(), ['movieId', 'rating', 'text', 'user']);
  assert.equal(response.body.review.user.id, String(actor._id));
  assert.equal(response.body.review.rating, 8);
  assert.equal(response.body.review.movieId, 550);
});

test('POST avvisar ogiltiga film-ID, betyg och text före sparning', async () => {
  const invalidFields = [
    { movieId: undefined }, { movieId: '550' }, { movieId: 0 }, { movieId: -1 }, { movieId: 1.5 },
    { movieId: Number.MAX_SAFE_INTEGER + 1 }, { movieId: true }, { movieId: { $gt: 0 } },
    { rating: undefined }, { rating: 0 }, { rating: 11 }, { rating: 7.5 }, { rating: '8' },
    { rating: null }, { rating: true }, { rating: { $gt: 0 } },
    { text: undefined }, { text: '' }, { text: ' \n\t ' }, { text: 'a'.repeat(2001) },
    { text: 123 }, { text: null }, { text: [] },
  ];
  for (const fields of invalidFields) {
    assert.equal((await request('', { method: 'POST', body: { ...input, ...fields } })).status, 400);
  }
  for (const body of [undefined, null, [], {}, 'text']) {
    assert.equal((await request('', { method: 'POST', body })).status, 400);
  }
  assert.equal(createReview.mock.callCount(), 0);
});

test('POST accepterar gränsvärden 1, 10 och 2000 tecken', async () => {
  for (const rating of [1, 10]) {
    const response = await request('', {
      method: 'POST', body: { ...input, movieId: Number.MAX_SAFE_INTEGER, rating, text: 'a'.repeat(2000) },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.review.text.length, 2000);
  }
});

test('POST avvisar försök att ange annan ägare och andra otillåtna fält', async () => {
  for (const field of ['user', 'userId', '_id', 'createdAt', 'updatedAt', 'passwordHash', '$set']) {
    const response = await request('', { method: 'POST', body: { ...input, [field]: String(other._id) } });
    assert.deepEqual(response, { status: 400, body: { error: 'Förfrågan innehåller otillåtna fält.' } });
  }
  assert.equal(createReview.mock.callCount(), 0);
});

test('duplicate-key-fel och samtidiga POST-anrop hanteras med 409', async (t) => {
  let inserted = false;
  createReview.mock.mockImplementation(async (fields) => {
    if (inserted) {
      const error = new Error('Intern duplicate-key-detalj');
      error.code = 11000;
      throw error;
    }
    inserted = true;
    return reviewDocument(t, fields);
  });
  const responses = await Promise.all([
    request('', { method: 'POST', body: input }),
    request('', { method: 'POST', body: input }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.deepEqual(responses.find(response => response.status === 409).body, {
    error: 'Du har redan recenserat den här filmen.',
  });
});

test('PATCH sparar nya värden på den egna recensionen och bevarar ägare och film', async (t) => {
  const review = reviewDocument(t);
  findReview.mock.mockImplementation(async () => review);
  const response = await request(`/${review._id}`, {
    method: 'PATCH', body: { rating: 9, text: '  Uppdaterad text.  ' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.review.rating, 9);
  assert.equal(response.body.review.text, 'Uppdaterad text.');
  assert.equal(response.body.review.movieId, input.movieId);
  assert.equal(response.body.review.user.id, String(actor._id));
  assert.equal(response.body.review.createdAt, createdAt.toISOString());
  assert.equal(review.save.mock.callCount(), 1);
});

test('PATCH tillåter delvis ändring av rating eller text', async (t) => {
  for (const body of [{ rating: 10 }, { text: 'Ny text.' }]) {
    const review = reviewDocument(t);
    findReview.mock.mockImplementation(async () => review);
    const response = await request(`/${review._id}`, { method: 'PATCH', body });
    assert.equal(response.status, 200);
    assert.equal(response.body.review.rating, body.rating || input.rating);
    assert.equal(response.body.review.text, body.text || input.text);
  }
});

test('PATCH och DELETE ger 403 för annan ägare och ändrar ingenting', async (t) => {
  const review = reviewDocument(t, { user: other._id });
  findReview.mock.mockImplementation(async () => review);
  const patched = await request(`/${review._id}`, { method: 'PATCH', body: { rating: 9 } });
  const deleted = await request(`/${review._id}`, { method: 'DELETE' });
  assert.deepEqual(patched, { status: 403, body: { error: 'Du får bara redigera dina egna recensioner.' } });
  assert.deepEqual(deleted, { status: 403, body: { error: 'Du får bara ta bort dina egna recensioner.' } });
  assert.equal(review.save.mock.callCount(), 0);
  assert.equal(deleteReview.mock.callCount(), 0);
});

test('PATCH avvisar förbjudna eller okända fält, tomma ändringar och ogiltiga värden', async (t) => {
  const review = reviewDocument(t);
  findReview.mock.mockImplementation(async () => review);
  for (const field of ['user', 'movieId', '_id', 'createdAt', 'updatedAt', 'unknown', '__proto__', '$set']) {
    const body = JSON.parse(JSON.stringify({ rating: 9 }));
    Object.defineProperty(body, field, { value: 'forbidden', enumerable: true });
    assert.equal((await request(`/${review._id}`, { method: 'PATCH', body })).status, 400);
  }
  for (const body of [{}, [], null, { rating: 0 }, { rating: 11 }, { rating: 1.5 },
    { rating: '8' }, { rating: null }, { text: '' }, { text: '  ' }, { text: 'a'.repeat(2001) }, { text: {} }]) {
    assert.equal((await request(`/${review._id}`, { method: 'PATCH', body })).status, 400);
  }
  assert.equal(review.save.mock.callCount(), 0);
  assert.equal(findReview.mock.callCount(), 0);
});

test('PATCH och DELETE avvisar ogiltiga ObjectId och ger 404 när recensionen saknas', async () => {
  for (const id of ['bad-id', '123', '123456789012', 'z'.repeat(24)]) {
    assert.equal((await request(`/${id}`, { method: 'PATCH', body: { rating: 8 } })).status, 400);
    assert.equal((await request(`/${id}`, { method: 'DELETE' })).status, 400);
  }
  assert.equal(findReview.mock.callCount(), 0);
  const id = String(new Review()._id);
  assert.equal((await request(`/${id}`, { method: 'PATCH', body: { rating: 8 } })).status, 404);
  assert.equal((await request(`/${id}`, { method: 'DELETE' })).status, 404);
});

test('DELETE tar bort egen recension med ägarfilter och ger 204 utan svarskropp', async (t) => {
  const review = reviewDocument(t);
  findReview.mock.mockImplementation(async () => review);
  assert.deepEqual(await request(`/${review._id}`, { method: 'DELETE' }), { status: 204, body: null });
  assert.deepEqual(deleteReview.mock.calls[0].arguments[0], { _id: review._id, user: actor._id });
});

test('alla privata endpoints kräver giltig HS256-token och befintlig användare', async () => {
  const id = String(new Review()._id);
  const expired = jwt.sign({}, secret, { subject: String(actor._id), expiresIn: -1 });
  const wrongAlgorithm = jwt.sign({}, secret, { subject: String(actor._id), expiresIn: '1h', algorithm: 'HS384' });
  const wrongSecret = jwt.sign({}, randomBytes(32).toString('hex'), { subject: String(actor._id), expiresIn: '1h' });
  const invalidSubject = jwt.sign({}, secret, { subject: 'bad-id', expiresIn: '1h' });
  const noExpiry = jwt.sign({}, secret, { subject: String(actor._id) });
  const actions = [
    { path: '/mine', method: 'GET' },
    { path: '', method: 'POST', body: input },
    { path: `/${id}`, method: 'PATCH', body: { rating: 8 } },
    { path: `/${id}`, method: 'DELETE' },
  ];
  for (const authorization of [null, 'Basic abc', 'Bearer bad-token', `Bearer ${expired}`,
    `Bearer ${wrongAlgorithm}`, `Bearer ${wrongSecret}`, `Bearer ${invalidSubject}`, `Bearer ${noExpiry}`]) {
    for (const action of actions) {
      assert.equal((await request(action.path, { ...action, authorization })).status, 401);
    }
  }
  assert.equal(findUser.mock.callCount(), 0);
  findUser.mock.mockImplementation(async () => null);
  for (const action of actions) {
    assert.equal((await request(action.path, action)).status, 401);
  }
  assert.equal(createReview.mock.callCount(), 0);
  assert.equal(findReview.mock.callCount(), 0);
  assert.equal(findReviews.mock.callCount(), 0);
  assert.equal(deleteReview.mock.callCount(), 0);
});

test('asynkrona databasfel ger neutrala 500-svar från samtliga recensionsoperationer', async (t) => {
  const fail = async () => { throw new Error(`private-detail ${token} ${secret}`); };
  populateReviews.mock.mockImplementation(fail);
  const list = await request('/movie/550', { authorization: null });
  const mine = await request('/mine');
  createReview.mock.mockImplementation(fail);
  const create = await request('', { method: 'POST', body: input });
  findReview.mock.mockImplementation(fail);
  const id = String(new Review()._id);
  const patchLookup = await request(`/${id}`, { method: 'PATCH', body: { rating: 8 } });
  const deleteLookup = await request(`/${id}`, { method: 'DELETE' });
  const review = reviewDocument(t);
  findReview.mock.mockImplementation(async () => review);
  review.save.mock.mockImplementation(fail);
  const patchSave = await request(`/${id}`, { method: 'PATCH', body: { text: 'Ny text' } });
  deleteReview.mock.mockImplementation(fail);
  const remove = await request(`/${id}`, { method: 'DELETE' });
  for (const response of [list, mine, create, patchLookup, deleteLookup, patchSave, remove]) {
    assert.deepEqual(response, {
      status: 500, body: { error: 'Kunde inte hantera recensionerna. Försök igen senare.' },
    });
  }
});

test('autentiseringens databas- och konfigurationsfel döljs även för recensioner', async () => {
  findUser.mock.mockImplementation(async () => { throw new Error('private-database-detail'); });
  assert.deepEqual(await request('/mine'), {
    status: 500, body: { error: 'Kunde inte kontrollera sessionen. Försök igen senare.' },
  });
  delete process.env.JWT_SECRET;
  assert.equal((await request('/mine')).status, 500);
});

test('modellen validerar dataintegritet och deklarerar det sammansatta unika indexet', async () => {
  const indexes = Review.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.user === 1 && fields.movieId === 1 && options.unique === true));
  const review = new Review({ ...input, user: actor._id, text: '  Trimmad text.  ' });
  await review.validate();
  assert.equal(review.text, 'Trimmad text.');
  assert.equal(Review.schema.options.timestamps, true);
  for (const fields of [{ movieId: 0 }, { movieId: 1.5 }, { movieId: Number.MAX_SAFE_INTEGER + 1 },
    { rating: 1.5 }, { rating: 0 }, { rating: 11 }, { text: '  ' }, { text: 'a'.repeat(2001) }]) {
    await assert.rejects(new Review({ ...input, user: actor._id, ...fields }).validate(), { name: 'ValidationError' });
  }
});

test('recensionsanrop gör inga TMDB-anrop och loggar inga hemligheter', async (t) => {
  const externalFetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected external call'); });
  const log = t.mock.method(console, 'log');
  const warn = t.mock.method(console, 'warn');
  const error = t.mock.method(console, 'error');
  assert.equal((await request('/movie/550', { authorization: null })).status, 200);
  assert.equal((await request('', { method: 'POST', body: input })).status, 201);
  assert.equal(externalFetch.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
  assert.equal(warn.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});
