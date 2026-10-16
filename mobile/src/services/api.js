const REQUEST_TIMEOUT_MS = 10000;

export function getApiUrl(path, baseUrl = process.env.EXPO_PUBLIC_API_URL) {
  if (
    typeof baseUrl !== 'string' ||
    !baseUrl.trim()
  ) {
    throw new Error(
      'Backendadressen saknas. Ange EXPO_PUBLIC_API_URL i mobile/.env och ladda om appen.'
    );
  }

  let url;

  try {
    url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error();
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'Backendadressen är ogiltig. EXPO_PUBLIC_API_URL ska vara en HTTP- eller HTTPS-adress utan inloggningsuppgifter, query eller fragment.'
    );
  }

  let address = url.toString();

  while (address.endsWith('/')) {
    address = address.slice(0, -1);
  }
  while (path.startsWith('/')) {
    path = path.slice(1);
  }
  return `${address}/${path}`;
}

async function getJson(path, { signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = getApiUrl(path);
  const controller = new AbortController();
  const abortRequest = () => controller.abort();

  signal?.addEventListener('abort', abortRequest);
  if (signal?.aborted) {
    controller.abort();
  }

  const timeout = setTimeout(abortRequest, timeoutMs);
  let response;
  let data;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    data = await response.json();

    if (!response.ok) {
      if (typeof data?.error === 'string') {
        throw new Error(data.error);
      }
      throw new Error(`Servern svarade med HTTP ${response.status}. Försök igen.`);
    }
    return data;
  } catch (error) {
    // Avmontering ska avbryta tyst; timeout ska ge ett begripligt fel.
    if (signal?.aborted) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        'Servern svarade inte i tid. Kontrollera anslutningen och försök igen.'
      );
    }
    if (!response) {
      throw new Error(
        'Kunde inte nå servern. Kontrollera att backend är igång och att backendadressen och nätverket stämmer. Försök igen.'
      );
    }
    if (data === undefined) {
      if (!response.ok) {
        throw new Error(`Servern svarade med HTTP ${response.status}. Försök igen.`);
      }
      throw new Error('Servern skickade ett svar som inte är giltig JSON. Försök igen.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}

export async function getHealth(options) {
  const data = await getJson('health', options);

  if (data?.status !== 'ok') {
    throw new Error('Serverns svar saknar förväntad status "ok". Försök igen.');
  }
  return data;
}

function checkMovieList(data) {
  if (!Array.isArray(data?.results)) {
    throw new Error('Servern skickade en ogiltig filmlista.');
  }
  return data;
}

export async function getPopularMovies(page = 1, options) {
  const data = await getJson(`movies/popular?page=${encodeURIComponent(page)}`, options);

  return checkMovieList(data);
}

export async function searchMovies(query, page = 1, options) {
  if (
    typeof query !== 'string' ||
    !query.trim()
  ) {
    throw new Error('Ange ett sökord.');
  }

  const data = await getJson(
    `movies/search?query=${encodeURIComponent(query.trim())}&page=${encodeURIComponent(page)}`,
    options
  );

  return checkMovieList(data);
}

export async function getMovieDetails(id, options) {
  const movieId = Number(id);

  if (
    !Number.isSafeInteger(movieId) ||
    movieId < 1
  ) {
    throw new Error('Film-ID måste vara ett positivt heltal.');
  }

  const data = await getJson(`movies/${encodeURIComponent(id)}`, options);

  if (data?.id !== movieId) {
    throw new Error('Servern skickade ogiltiga filmdetaljer.');
  }
  return data;
}
