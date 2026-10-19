import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { beforeEach, afterEach } from 'node:test';
import app from '../src/app.js';
import { getPopularMovies, discoverMovies, getMovieGenres } from '../src/services/tmdb.js';

// HTTP-anropen till Express är riktiga. Bara serverns fetch till TMDB mockas.
const realFetch = globalThis.fetch;
const movie = { id: 11, title: 'En film', poster_path: '/poster.jpg', release_date: '2024-05-01', vote_average: 7.5 };
const movieList = { page: 1, total_pages: 3, results: [movie] };
let server;
let baseUrl;

beforeEach(async () => {
  process.env.TMDB_ACCESS_TOKEN = 'test-only-token';
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/movies`;
});

afterEach(async () => {
  delete process.env.TMDB_ACCESS_TOKEN;
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

async function request(path) {
  const response = await realFetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

test('populära filmer använder Bearer, svenska och standardpage utan att exponera extra data', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://api.themoviedb.org');
    assert.equal(url.pathname, '/3/movie/popular');
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(url.searchParams.get('language'), 'sv-SE');
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    return Response.json({ ...movieList, internal: 'test-only-token', results: [{ ...movie, secret: 'test-only-token' }] });
  });
  const response = await request('/popular');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, movieList);
  assert.equal(JSON.stringify(response.body).includes('test-only-token'), false);
});

test('sökning tar emot titel och sida utan att specialtecken ändrar URL-parametrar', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.pathname, '/3/search/movie');
    assert.equal(url.searchParams.get('query'), 'Avatar & Å');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('include_adult'), 'false');
    assert.equal(url.searchParams.get('language'), 'sv-SE');
    return Response.json({ ...movieList, page: 2 });
  });
  assert.deepEqual(await request('/search?query=Avatar%20%26%20%C3%85&page=2'), { status: 200, body: { ...movieList, page: 2 } });
});

test('filmdetaljer innehåller beskrivning, genrer och speltid', async (t) => {
  const details = { ...movie, overview: 'En berättelse.', genres: [{ id: 12, name: 'Äventyr' }], runtime: 120 };
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.pathname, '/3/movie/11');
    assert.equal(url.searchParams.get('language'), 'sv-SE');
    return Response.json({ ...details, secret: 'test-only-token' });
  });
  assert.deepEqual(await request('/11'), { status: 200, body: details });
});

test('tomma listor är lyckade svar och saknad filmdata får neutrala värden', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ page: 1, total_pages: 0, results: [] }));
  assert.deepEqual(await request('/popular'), { status: 200, body: { page: 1, total_pages: 0, results: [] } });
  mock.mock.mockImplementation(async () => Response.json({ page: 1, total_pages: 1, results: [{ id: 11 }] }));
  const response = await request('/popular');
  assert.deepEqual(response.body.results[0], { id: 11, title: '', poster_path: null, release_date: '', vote_average: null });
});

test('felaktiga parametrar ger 400 före TMDB-anrop', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected TMDB request'); });
  const invalidPaths = [
    '/popular?page=0',
    '/popular?page=501',
    '/popular?page=1.5',
    '/popular?page=abc',
    '/popular?page=',
    '/popular?page=1e2',
    '/popular?page=0x10',
    '/popular?page=%201',
    '/popular?page=1%20',
    '/popular?page=%2B1',
    '/popular?page=1%0A',
    '/popular?page=%D9%A1',
    '/popular?page=1&page=2',
    '/search',
    '/search?query=%20',
    '/search?query=a&query=b',
    '/search?query=Avatar&page=-1',
    '/0',
    '/-1',
    '/abc',
    '/1.5',
    '/1e2',
    '/0x10',
    '/%201',
    '/1%20',
    '/%2B1',
    '/1%0A',
    '/%D9%A1',
    '/9007199254740992',
  ];
  for (const path of invalidPaths) {
    const response = await request(path);
    assert.equal(response.status, 400, path);
    assert.equal(typeof response.body.error, 'string');
  }
  assert.equal(mock.mock.callCount(), 0);
});

test('saknad token ger ett begripligt 500-svar utan fetch', async (t) => {
  delete process.env.TMDB_ACCESS_TOKEN;
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected TMDB request'); });
  assert.deepEqual(await request('/popular'), { status: 500, body: { error: 'Filmtjänsten är inte konfigurerad på servern.' } });
  assert.equal(mock.mock.callCount(), 0);
});

test('TMDB-fel ger rätt HTTP-status och råa fel med hemligheter skickas aldrig vidare', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const [upstreamStatus, expectedStatus] of [[401, 502], [403, 502], [404, 404], [429, 503], [500, 502]]) {
    mock.mock.mockImplementation(async () => new Response('Internal details test-only-token', { status: upstreamStatus }));
    const response = await request('/11');
    assert.equal(response.status, expectedStatus);
    assert.equal(JSON.stringify(response.body).includes('test-only-token'), false);
    assert.equal(JSON.stringify(response.body).includes('Internal details'), false);
  }
});

test('nätverksfel döljer interna fel och ger 502', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network internals test-only-token'); });
  assert.deepEqual(await request('/popular'), { status: 502, body: { error: 'Kunde inte nå filmtjänsten. Försök igen senare.' } });
});

test('ogiltig JSON och felaktig liststruktur ger 502', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const body of [
    'not json', 'null', '[]', '{}',
    '{"page":1,"total_pages":1,"results":[{"id":"bad"}]}',
    '{"page":1,"total_pages":1,"results":[null]}',
    '{"page":0,"total_pages":1,"results":[]}',
    '{"page":1,"total_pages":-1,"results":[]}',
  ]) {
    mock.mock.mockImplementation(async () => new Response(body));
    const response = await request('/popular');
    assert.equal(response.status, 502);
    assert.equal(typeof response.body.error, 'string');
  }
});

test('långsamma TMDB-anrop avbryts och ger timeout 504', async (t) => {
  // Flyttar testklockan framåt i stället för att vänta åtta riktiga sekunder.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = getPopularMovies(1);
  t.mock.timers.tick(8000);
  await assert.rejects(pending, { status: 504, name: 'Error' });
});

test('backend kontrollerar affisch, datum och betyg innan data skickas till MovieCard', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    page: 1,
    total_pages: 1,
    results: [
      { ...movie, title: '   ', poster_path: 'https://example.com/poster.jpg', release_date: 'inte ett datum', vote_average: 11 },
      { ...movie, id: 12, title: 123, poster_path: '/folder/poster.jpg', release_date: '2024', vote_average: '7.5' },
      { ...movie, id: 13, vote_average: 0 },
    ],
  }));
  const response = await request('/popular');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results[0], {
    id: 11, title: '', poster_path: null, release_date: '', vote_average: null,
  });
  assert.deepEqual(response.body.results[1], {
    id: 12, title: '', poster_path: null, release_date: '', vote_average: null,
  });
  assert.equal(response.body.results[2].vote_average, 0);
});

test('detaljer använder standardvärden och tar bara med giltiga genrer', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    ...movie,
    overview: null,
    runtime: -1,
    genres: [null, { id: 'bad', name: 'Fel' }, { id: 1, name: 123 }, { id: 12, name: 'Äventyr', extra: 'tas inte med' }],
  }));
  const response = await request('/11');
  assert.equal(response.status, 200);
  assert.equal(response.body.overview, '');
  assert.equal(response.body.runtime, null);
  assert.deepEqual(response.body.genres, [{ id: 12, name: 'Äventyr' }]);
});

test('sifferkontrollen behåller giltiga sidnummer och ID med inledande nollor', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.pathname === '/3/movie/11') {
      return Response.json(movie);
    }
    const page = Number(url.searchParams.get('page'));
    return Response.json({ ...movieList, page });
  });
  assert.equal((await request('/popular?page=0001')).body.page, 1);
  assert.equal((await request('/popular?page=500')).body.page, 500);
  assert.equal((await request('/00011')).body.id, 11);
});

test('affischsökvägar avvisar externa adresser och mappar, filnamn URL-kodas säkert', async (t) => {
  const invalidPaths = [
    '', '/', 'poster.jpg', '/folder/poster.jpg', 'https://example.com/poster.jpg',
    '/folder\\poster.jpg', '/.', '/..',
    '/poster.jpg\n', '/poster.jpg\r', '/poster.jpg\u2028', null, 123,
  ];
  const mock = t.mock.method(globalThis, 'fetch');
  for (const posterPath of invalidPaths) {
    mock.mock.mockImplementation(async () => Response.json({
      ...movieList,
      results: [{ ...movie, poster_path: posterPath }],
    }));
    const response = await request('/popular');
    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].poster_path, null);
  }
  mock.mock.mockImplementation(async () => Response.json({
    ...movieList,
    results: [{ ...movie, poster_path: '/AbC_12-3.jpg' }],
  }));
  assert.equal((await request('/popular')).body.results[0].poster_path, '/AbC_12-3.jpg');
  for (const posterPath of ['/a b.jpg', '/å.jpg', '/a%20.jpg', '/poster.jpg?size=1', '/poster.jpg#part']) {
    mock.mock.mockImplementation(async () => Response.json({
      ...movieList,
      results: [{ ...movie, poster_path: posterPath }],
    }));
    const response = await request('/popular');
    const safePath = response.body.results[0].poster_path;
    assert.equal(safePath, '/' + encodeURIComponent(posterPath.slice(1)));
    const imageUrl = new URL('https://image.tmdb.org/t/p/w500' + safePath);
    assert.equal(imageUrl.origin, 'https://image.tmdb.org');
    assert.equal(imageUrl.search, '');
    assert.equal(imageUrl.hash, '');
  }
});

test('datum måste vara ett verkligt kalenderdatum i formatet år-månad-dag', async (t) => {
  const invalidDates = [
    '', '2024', '2024-1-01', '2024-01-1', '24-01-01', '2024/01/01', 'abcd-01-01',
    '2024-01-01-extra', ' 2024-01-01', '2024-01-01\n', '2024-01-01\r',
    '2024-01-01\u2028', '2024-99-99', '2024-02-30', '2023-02-29', null, 2024,
  ];
  const mock = t.mock.method(globalThis, 'fetch');
  for (const releaseDate of invalidDates) {
    mock.mock.mockImplementation(async () => Response.json({
      ...movieList,
      results: [{ ...movie, release_date: releaseDate }],
    }));
    const response = await request('/popular');
    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].release_date, '');
  }
  for (const releaseDate of ['2024-05-01', '2024-02-29']) {
    mock.mock.mockImplementation(async () => Response.json({
      ...movieList,
      results: [{ ...movie, release_date: releaseDate }],
    }));
    assert.equal((await request('/popular')).body.results[0].release_date, releaseDate);
  }
});

test('fel film-ID i TMDB:s detaljsvar avvisas i backend', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...movie, id: 12 }));
  assert.deepEqual(await request('/11'), {
    status: 502,
    body: { error: 'Filmtjänsten skickade ogiltig filmdata.' },
  });
});

const discoverList = { ...movieList, total_results: 45 };

test('Discover utan filter använder svenska, sida ett och popularitet', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/3/discover/movie');
    assert.equal(url.searchParams.get('language'), 'sv-SE');
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(url.searchParams.get('sort_by'), 'popularity.desc');
    assert.equal(url.searchParams.get('include_adult'), 'false');
    assert.equal(url.searchParams.has('with_genres'), false);
    assert.equal(url.searchParams.has('primary_release_year'), false);
    assert.equal(url.searchParams.has('vote_average.gte'), false);
    assert.equal(url.searchParams.has('vote_count.gte'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ ...discoverList, internal: 'test-only-token' });
  });
  assert.deepEqual(await request('/discover'), { status: 200, body: discoverList });
});

for (const [query, parameter, value] of [
  ['genre=27', 'with_genres', '27'],
  ['year=2020', 'primary_release_year', '2020'],
  ['minRating=7.5', 'vote_average.gte', '7.5'],
]) {
  test(`Discover stöder filtret ${query} för sig`, async (t) => {
    t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url.pathname, '/3/discover/movie');
      assert.equal(url.searchParams.get(parameter), value);
      if (parameter === 'vote_average.gte') {
        assert.equal(url.searchParams.get('vote_count.gte'), '100');
      } else {
        assert.equal(url.searchParams.has('vote_count.gte'), false);
      }
      return Response.json(discoverList);
    });
    assert.equal((await request('/discover?' + query)).status, 200);
  });
}

test('Discover kombinerar alla filter och bevarar den begärda sidan', async (t) => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.searchParams.get('with_genres'), '27');
    assert.equal(url.searchParams.get('primary_release_year'), '2020');
    assert.equal(url.searchParams.get('vote_average.gte'), '7');
    assert.equal(url.searchParams.get('sort_by'), 'vote_average.desc');
    assert.equal(url.searchParams.get('vote_count.gte'), '100');
    assert.equal(url.searchParams.get('page'), '3');
    assert.equal(url.searchParams.has('query'), false);
    return Response.json({ ...discoverList, page: 3 });
  });
  const response = await request('/discover?genre=27&year=2020&minRating=7&sortBy=rating&page=3');
  assert.deepEqual(response, { status: 200, body: { ...discoverList, page: 3 } });
});

for (const [sortBy, expected] of [
  ['popular', 'popularity.desc'],
  ['rating', 'vote_average.desc'],
  ['newest', 'primary_release_date.desc'],
  ['oldest', 'primary_release_date.asc'],
]) {
  test(`Discover översätter sorteringen ${sortBy} till ett tillåtet TMDB-värde`, async (t) => {
    t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url.searchParams.get('sort_by'), expected);
      assert.equal(url.searchParams.has('vote_count.gte'), sortBy === 'rating');
      return Response.json(discoverList);
    });
    assert.equal((await request('/discover?sortBy=' + sortBy)).status, 200);
  });
}

test('Discover accepterar gränsvärden och hämtar senare sidor utan att kapa totalsiffrorna', async (t) => {
  const lastYear = new Date().getFullYear() + 5;
  t.mock.method(globalThis, 'fetch', async url => {
    const page = Number(url.searchParams.get('page'));
    assert.ok([1, 500].includes(page));
    assert.ok(['0', '10'].includes(url.searchParams.get('vote_average.gte')));
    assert.ok(['1888', String(lastYear)].includes(url.searchParams.get('primary_release_year')));
    return Response.json({ ...discoverList, page, total_pages: 900, total_results: 18000 });
  });
  for (const query of [
    'genre=00027&year=1888&minRating=0&page=0001',
    `genre=27&year=${lastYear}&minRating=10&page=500`,
  ]) {
    const response = await request('/discover?' + query);
    assert.equal(response.status, 200);
    assert.equal(response.body.total_pages, 900);
    assert.equal(response.body.total_results, 18000);
  }
});

test('Discover avvisar ogiltiga och upprepade parametrar före TMDB-anrop', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected TMDB request'); });
  const invalidQueries = [
    'genre=', 'genre=0', 'genre=-1', 'genre=1.5', 'genre=1e2', 'genre=0x10',
    'genre=%2027', 'genre=27%20', 'genre=9007199254740992', 'genre=27&genre=28',
    'genre[]=27', 'genre[id]=27', 'genre=action', 'genre=27|28',
    'year=', 'year=1887', `year=${new Date().getFullYear() + 6}`, 'year=2020.5',
    'year=2e3', 'year=%202020', 'year=2020&year=2021',
    'minRating=', 'minRating=%20', 'minRating=-1', 'minRating=10.1', 'minRating=NaN',
    'minRating=Infinity', 'minRating=0x7', 'minRating=7e0', 'minRating=7,5',
    'minRating=7..5', 'minRating=7&minRating=8',
    'sortBy=', 'sortBy=vote_average.desc', 'sortBy=unknown', 'sortBy=__proto__',
    'sortBy=constructor', 'sortBy=popular&sortBy=rating',
    'page=0', 'page=501', 'page=-1', 'page=1.5', 'page=1e2', 'page=',
    'page=%201', 'page=1&page=2', 'query=Batman', 'title=Batman',
    'query=Batman&genre=28&minRating=7', 'unexpected=value',
  ];
  for (const query of invalidQueries) {
    const response = await request('/discover?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.body.error, 'string', query);
    assert.ok(response.body.error.length > 0);
  }
  assert.equal(mock.mock.callCount(), 0);
});

test('Discover kontrollerar filmdata och totalsiffror och godtar en tom lista', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const data of [
    null, {}, { ...discoverList, results: {} },
    { ...discoverList, results: [null] }, { ...discoverList, results: [{ id: 'bad' }] },
    { ...discoverList, total_results: undefined }, { ...discoverList, total_results: -1 },
    { ...discoverList, total_results: '45' }, { ...discoverList, total_results: 1.5 },
  ]) {
    mock.mock.mockImplementation(async () => Response.json(data));
    assert.equal((await request('/discover')).status, 502);
  }
  mock.mock.mockImplementation(async () => Response.json({
    ...discoverList, results: [{ ...movie, poster_path: 'https://example.com/image', secret: 'test-only-token' }],
  }));
  const mapped = await request('/discover');
  assert.deepEqual(mapped.body.results, [{ ...movie, poster_path: null }]);
  const empty = { page: 1, total_pages: 0, total_results: 0, results: [] };
  mock.mock.mockImplementation(async () => Response.json(empty));
  assert.deepEqual(await request('/discover'), { status: 200, body: empty });
});

test('Discover behåller neutral felhantering vid TMDB-fel och nätverksfel', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const [upstream, expected] of [[401, 502], [403, 502], [404, 404], [429, 503], [500, 502]]) {
    mock.mock.mockImplementation(async () => new Response('Internal test-only-token', { status: upstream }));
    const response = await request('/discover');
    assert.equal(response.status, expected);
    assert.equal(JSON.stringify(response.body).includes('test-only-token'), false);
  }
  mock.mock.mockImplementation(async () => { throw new Error('Network test-only-token'); });
  assert.equal((await request('/discover')).status, 502);
  mock.mock.mockImplementation(async () => new Response('Not JSON'));
  assert.equal((await request('/discover')).status, 502);
  delete process.env.TMDB_ACCESS_TOKEN;
  assert.equal((await request('/discover')).status, 500);
});

test('Discover använder den befintliga åtta sekunders tidsgränsen', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = discoverMovies({ page: 2, genre: 27 });
  t.mock.timers.tick(8000);
  await assert.rejects(pending, { status: 504 });
});

test('Genrelistan stöder svenska namn, cache och samma felhantering som filmer', async (t) => {
  const hour = 60 * 60 * 1000;
  // Testklockan börjar i det förflutna så att cachen är utgången när testet är klart.
  let now = Date.now() - 3 * hour;
  t.mock.method(Date, 'now', () => now);
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/3/genre/movie/list');
    assert.equal(url.searchParams.get('language'), 'sv-SE');
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    return Response.json({ genres: [
      { id: 27, name: ' Skräck ', extra: 'test-only-token' }, { id: 35, name: 'Komedi' },
    ] });
  });
  const expected = [{ id: 27, name: 'Skräck' }, { id: 35, name: 'Komedi' }];
  assert.deepEqual(await request('/genres'), { status: 200, body: expected });
  assert.deepEqual((await request('/genres')).body, expected);
  assert.equal(mock.mock.callCount(), 1);
  now += hour + 1;
  assert.deepEqual((await request('/genres')).body, expected);
  assert.equal(mock.mock.callCount(), 2);

  // Låter cachen gå ut innan felaktiga svar och nätverksfel provas.
  now += hour + 1;
  const invalidData = [
    {}, { genres: null }, { genres: {} }, { genres: [null] },
    { genres: [{ id: '27', name: 'Skräck' }] }, { genres: [{ id: 0, name: 'Skräck' }] },
    { genres: [{ id: 27, name: '' }] }, { genres: [{ id: 27, name: 123 }] },
  ];
  for (const data of invalidData) {
    mock.mock.mockImplementation(async () => Response.json(data));
    const response = await request('/genres');
    assert.equal(response.status, 502);
    assert.equal(typeof response.body.error, 'string');
  }
  assert.equal(mock.mock.callCount(), 2 + invalidData.length);

  for (const [upstream, expected] of [[401, 502], [404, 404], [429, 503], [500, 502]]) {
    mock.mock.mockImplementation(async () => new Response('Internal test-only-token', { status: upstream }));
    const response = await request('/genres');
    assert.equal(response.status, expected);
    assert.equal(JSON.stringify(response.body).includes('test-only-token'), false);
  }
  mock.mock.mockImplementation(async () => { throw new Error('Network test-only-token'); });
  assert.equal((await request('/genres')).status, 502);
  mock.mock.mockImplementation(async () => new Response('Not JSON'));
  assert.equal((await request('/genres')).status, 502);
  delete process.env.TMDB_ACCESS_TOKEN;
  assert.equal((await request('/genres')).status, 500);
  process.env.TMDB_ACCESS_TOKEN = 'test-only-token';

  t.mock.timers.enable({ apis: ['setTimeout'] });
  mock.mock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = getMovieGenres();
  t.mock.timers.tick(8000);
  await assert.rejects(pending, { status: 504 });
});

test('Genrelistan avvisar okända parametrar utan TMDB-anrop', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected TMDB request'); });
  assert.equal((await request('/genres?language=en')).status, 400);
  assert.equal(mock.mock.callCount(), 0);
});
