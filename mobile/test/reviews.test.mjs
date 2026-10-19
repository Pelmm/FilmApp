import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { beforeEach, afterEach } from 'node:test';
import { getMovieReviews, getMyReviews, createReview, updateReview, deleteReview, getReviewError } from '../src/services/api.js';

const originalUrl = process.env.EXPO_PUBLIC_API_URL;
const token = randomBytes(32).toString('hex');
const review = { id: 'review-id', movieId: 550, rating: 8, text: 'Bra film.' };
beforeEach(() => { process.env.EXPO_PUBLIC_API_URL = 'http://example.test/api'; });
afterEach(() => {
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalUrl;
});

// Inga anrop går till Atlas eller TMDB. Varje svar kommer från en fetch-dubbel.
test('publika och egna recensioner använder rätt endpoint och endast egna kräver JWT', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ reviews: [review] });
  });
  assert.deepEqual(await getMovieReviews(550), [review]);
  assert.deepEqual(await getMyReviews(token), [review]);
  assert.equal(calls[0].url, 'http://example.test/api/reviews/movie/550');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].url, 'http://example.test/api/reviews/mine');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${token}`);
});

for (const method of ['POST', 'PATCH']) {
  test(`${method} trimmar text och skickar rätt fält utan användar-ID`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(options.method, method);
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      const expected = { rating: 8, text: 'Bra film.' };
      if (method === 'POST') expected.movieId = 550;
      assert.deepEqual(JSON.parse(options.body), expected);
      let endpoint = 'http://example.test/api/reviews';
      if (method === 'PATCH') endpoint += '/review-id';
      assert.equal(url, endpoint);
      return Response.json({ review });
    });
    const input = { ...review, text: '  Bra film.  ', userId: 'ignored' };
    let result;
    if (method === 'POST') result = await createReview(token, input);
    else result = await updateReview(token, review.id, input);
    assert.deepEqual(result, review);
  });
}

test('DELETE använder JWT och accepterar 204 utan att läsa JSON', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://example.test/api/reviews/review-id');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return { status: 204, ok: true, json: () => assert.fail('204 har ingen JSON-body') };
  });
  assert.equal(await deleteReview(token, review.id), undefined);
});

test('saknad token stoppar alla skyddade anrop före fetch', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Inget anrop utan token'));
  for (const missing of [undefined, null, '']) {
    await assert.rejects(getMyReviews(missing), error => error.status === 401);
    await assert.rejects(createReview(missing, review), error => error.status === 401);
    await assert.rejects(updateReview(missing, review.id, review), error => error.status === 401);
    await assert.rejects(deleteReview(missing, review.id), error => error.status === 401);
  }
});

test('betyg och text valideras inklusive båda gränserna', () => {
  for (const rating of [0, 11, 1.5, '8', undefined, NaN]) {
    assert.ok(getReviewError(rating, 'Text').includes('heltalsbetyg'));
  }
  for (const text of ['', '   ', '\n\t', undefined]) {
    assert.equal(getReviewError(1, text), 'Skriv en recensionstext.');
  }
  assert.ok(getReviewError(10, 'a'.repeat(2001)).includes('2000'));
  assert.equal(getReviewError(1, ' a '), '');
  assert.equal(getReviewError(10, 'a'.repeat(2000)), '');
});

test('ogiltiga film-ID:n, recensions-ID:n och formulär skickas inte', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Ogiltig indata'));
  for (const movieId of [0, -1, 1.5, '550', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getMovieReviews(movieId));
    await assert.rejects(createReview(token, { ...review, movieId }));
  }
  await assert.rejects(updateReview(token, '', review));
  await assert.rejects(deleteReview(token, ''));
  await assert.rejects(createReview(token, { ...review, text: '  ' }));
  await assert.rejects(updateReview(token, review.id, { ...review, rating: 11 }));
});

for (const status of [400, 401, 403, 404, 409, 500]) {
  test(`HTTP ${status} och backendens felmeddelande bevaras`, async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Begripligt fel' }, { status }));
    await assert.rejects(createReview(token, review), error => {
      assert.equal(error.status, status);
      assert.equal(error.message, 'Begripligt fel');
      return true;
    });
  });
}

test('felaktiga svar hanteras för både lista och sparad recension', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  await assert.rejects(getMovieReviews(550), error => error.message.includes('ogiltig recensionslista'));
  fetch.mock.mockImplementation(async () => Response.json({ reviews: [] }));
  await assert.rejects(createReview(token, review), error => error.message.includes('ogiltig recension'));
});

test('nätverksfel ger ingen 401-status', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(getMyReviews(token), error => {
    assert.equal(error.status, undefined);
    assert.ok(error.message.includes('servern'));
    return true;
  });
});

test('timeout och extern avbrytning fungerar även för recensionsanrop', async t => {
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  await assert.rejects(getMyReviews(token, { timeoutMs: 5 }), error => error.message.includes('tid'));
  const controller = new AbortController();
  const pending = getMovieReviews(550, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});
