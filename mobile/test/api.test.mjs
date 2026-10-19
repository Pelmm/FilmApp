import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { afterEach, beforeEach } from 'node:test';
import app from '../../server/src/app.js';
import {
  getApiUrl, getHealth, getPopularMovies, searchMovies, getMovieDetails,
  getMovieGenres, discoverMovies,
} from '../src/services/api.js';

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
beforeEach(() => { process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3000/api'; });
afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  }
});

test('API-adressen normaliseras och kan bytas till HTTPS', () => {
  assert.equal(getApiUrl('/health'), 'http://10.0.2.2:3000/api/health');
  assert.equal(getApiUrl('health', ' https://example.com/api/// '), 'https://example.com/api/health');
});

test('saknad eller felaktig konfiguration ger ett begripligt fel före fetch', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
  const invalidUrls = [
    '',
    ' ',
    'localhost:3000/api',
    'ftp://example.com/api',
    'http://',
    'https://user:password@example.com/api',
    'https://example.com/api?token=value',
    'https://example.com/api#fragment',
  ];
  for (const value of invalidUrls) {
    process.env.EXPO_PUBLIC_API_URL = value;
    await assert.rejects(getHealth(), (error) => {
      assert.equal(error.name, 'Error');
      assert.ok(error.message.includes('EXPO_PUBLIC_API_URL'));
      return true;
    });
  }
  delete process.env.EXPO_PUBLIC_API_URL;
  await assert.rejects(getHealth(), {
    message: 'Backendadressen saknas. Ange EXPO_PUBLIC_API_URL i mobile/.env och ladda om appen.',
  });
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
  await assert.rejects(getHealth(), (error) => {
    assert.equal(error.name, 'Error');
    assert.ok(error.message.includes('503'));
    return true;
  });
});

test('ogiltig JSON och tomma svar hanteras', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const body of ['<html>Not JSON</html>', '']) {
    fetchMock.mock.mockImplementation(async () => new Response(body));
    await assert.rejects(getHealth(), {
      message: 'Servern skickade ett svar som inte är giltig JSON. Försök igen.',
    });
  }
});

test('JSON måste innehålla status ok i ett objekt', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const data of [null, [], 'ok', {}, { status: 'error' }, { status: true }]) {
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(data)));
    await assert.rejects(getHealth(), {
      message: 'Serverns svar saknar förväntad status "ok". Försök igen.',
    });
  }
});

test('nätverksfel översätts till ett begripligt meddelande', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(getHealth(), (error) => {
    assert.equal(error.name, 'Error');
    assert.ok(error.message.includes('backend är igång'));
    return true;
  });
});

// Efterliknar ett anrop som bara avslutas när det avbryts eller når tidsgränsen.
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
  await assert.rejects(getHealth({ timeoutMs: 20 }), {
    message: 'Servern svarade inte i tid. Kontrollera anslutningen och försök igen.',
  });
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
  // Port 0 låter systemet välja en ledig port till den lokala testservern.
  const server = app.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

function stopServer(server) {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test('riktig Express: igång → avstängd → startad igen', async () => {
  let server = await startServer();
  const port = server.address().port;
  process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${port}/api`;
  try {
    assert.deepEqual(await getHealth(), { status: 'ok' });
    await stopServer(server);
    server = null;
    await assert.rejects(getHealth(), {
      message: 'Kunde inte nå servern. Kontrollera att backend är igång och att backendadressen och nätverket stämmer. Försök igen.',
    });
    server = await startServer(port);
    assert.deepEqual(await getHealth(), { status: 'ok' });
  } finally {
    if (server) {
      await stopServer(server);
    }
  }
});

test('filmfunktionerna anropar Express och returnerar JSON för listor och detaljer', async (t) => {
  const movies = { page: 2, total_pages: 3, results: [{ id: 11, title: 'En film' }] };
  const mock = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/movies/popular?page=2');
    return Response.json(movies);
  });
  assert.deepEqual(await getPopularMovies(2), movies);
  mock.mock.mockImplementation(async (url) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/movies/search?query=Avatar%20%26%20%C3%85&page=1');
    return Response.json({ ...movies, page: 1 });
  });
  assert.deepEqual(await searchMovies(' Avatar & Å '), { ...movies, page: 1 });
  mock.mock.mockImplementation(async (url) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/movies/11');
    return Response.json({ id: 11, title: 'En film', runtime: 120 });
  });
  assert.deepEqual(await getMovieDetails(11), { id: 11, title: 'En film', runtime: 120 });
});

test('en tom filmlista kan användas för empty state', async (t) => {
  const movies = { page: 1, total_pages: 0, results: [] };
  t.mock.method(globalThis, 'fetch', async () => Response.json(movies));
  assert.deepEqual(await getPopularMovies(), movies);
});

test('filmfunktionerna avvisar felaktiga svar och felaktiga sökord/ID', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(null));
  await assert.rejects(getPopularMovies(), { message: 'Servern skickade en ogiltig filmlista.' });
  mock.mock.mockImplementation(async () => Response.json({ results: {} }));
  await assert.rejects(getPopularMovies(), { message: 'Servern skickade en ogiltig filmlista.' });
  mock.mock.mockImplementation(async () => Response.json({ id: 12 }));
  await assert.rejects(getMovieDetails(11), { message: 'Servern skickade ogiltiga filmdetaljer.' });
  await assert.rejects(getMovieDetails('not-an-id'), { message: 'Film-ID måste vara ett positivt heltal.' });
  await assert.rejects(searchMovies(' '), { message: 'Ange ett sökord.' });
});

test('serverns begripliga JSON-fel visas även för filmanrop', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Filmen hittades inte.' }, { status: 404 }));
  await assert.rejects(getMovieDetails(11), {
    name: 'Error',
    message: 'Filmen hittades inte.',
  });
});

test('tom söktext avvisas före nätverksanropet', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
  await assert.rejects(searchMovies('   '), { message: 'Ange ett sökord.' });
  assert.equal(mock.mock.callCount(), 0);
});

test('filmsökning kan avbrytas när skärmen lämnas', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);
  const controller = new AbortController();
  const pending = searchMovies('Avatar', 1, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('nätverksfel vid filmsökning ger ett begripligt fel', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(searchMovies('Avatar'), {
    message: 'Kunde inte nå servern. Kontrollera att backend är igång och att backendadressen och nätverket stämmer. Försök igen.',
  });
});

test('ogiltiga film-ID avvisas före nätverksanropet', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const id of [undefined, null, '', 0, -1, 1.5, 'abc', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getMovieDetails(id), { message: 'Film-ID måste vara ett positivt heltal.' });
  }
  assert.equal(mock.mock.callCount(), 0);
});

test('filmdetaljer kan avbrytas när vald film ändras', async (t) => {
  t.mock.method(globalThis, 'fetch', pendingFetch);
  const controller = new AbortController();
  const pending = getMovieDetails(157336, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('genreanropet hämtar backendens direkta lista utan JWT', async (t) => {
  const genres = [{ id: 27, name: 'Skräck' }];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://10.0.2.2:3000/api/movies/genres');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(genres);
  });
  assert.deepEqual(await getMovieGenres(), genres);
});

test('Discover utan filter skickar bara standardvärden och bevarar backendens fältnamn', async (t) => {
  const data = { page: 1, total_pages: 12, total_results: 230, results: [{ id: 11 }] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const params = new URL(url).searchParams;
    assert.equal(new URL(url).pathname, '/api/movies/discover');
    assert.equal(params.size, 2);
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('sortBy'), 'popular');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(data);
  });
  assert.deepEqual(await discoverMovies(), data);
});

test('Discover skickar genre, år, betyg och sortering men ingen söktext eller senare sida', async (t) => {
  t.mock.method(globalThis, 'fetch', async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.size, 5);
    assert.equal(params.get('genre'), '27');
    assert.equal(params.get('year'), '2020');
    assert.equal(params.get('minRating'), '7');
    assert.equal(params.get('sortBy'), 'rating');
    assert.equal(params.get('page'), '1');
    assert.equal(params.has('query'), false);
    return Response.json({ results: [], page: 1, total_pages: 0, total_results: 0 });
  });
  await discoverMovies({ genre: 27, year: 2020, minRating: 7, sortBy: 'rating', query: 'Batman', page: 4 });
});

test('Discover kan skicka ett enskilt filter och kodar specialtecken', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('genre'), '27');
    assert.equal(params.has('year'), false);
    assert.equal(params.has('minRating'), false);
    return Response.json({ results: [] });
  });
  await discoverMovies({ genre: 27 });
  mock.mock.mockImplementation(async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('sortBy'), 'bad&query=Batman');
    assert.equal(params.has('query'), false);
    assert.equal(params.get('minRating'), '0');
    return Response.json({ results: [] });
  });
  await discoverMovies({ sortBy: 'bad&query=Batman', minRating: 0 });
});

test('genrer och Discover avvisar felaktiga svar och behåller backendens feltext', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ genres: [] }));
  await assert.rejects(getMovieGenres(), { message: 'Servern skickade en ogiltig genrelista.' });
  mock.mock.mockImplementation(async () => Response.json({ results: {} }));
  await assert.rejects(discoverMovies(), { message: 'Servern skickade en ogiltig filmlista.' });
  mock.mock.mockImplementation(async () => Response.json({ error: 'Ogiltigt filter.' }, { status: 400 }));
  await assert.rejects(discoverMovies(), { message: 'Ogiltigt filter.', status: 400 });
});

test('genre- och Discover-anrop hanterar nätverksfel, timeout och avbrytning', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  const actions = [options => getMovieGenres(options), options => discoverMovies({}, options)];
  for (const action of actions) {
    mock.mock.mockImplementation(async () => { throw new TypeError('Network request failed'); });
    await assert.rejects(action(), error => error.message.includes('Kunde inte nå servern'));
    mock.mock.mockImplementation(pendingFetch);
    await assert.rejects(action({ timeoutMs: 5 }), error => error.message.includes('inte i tid'));
    const controller = new AbortController();
    const pending = action({ signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  }
});
