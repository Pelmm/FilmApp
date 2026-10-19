const REQUEST_TIMEOUT_MS = 10000;

// Kontrollerar backendadressen och sätter ihop den med den endpoint som ska anropas.
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

// Gemensam hantering av JSON, timeout och fel för appens API-anrop.
async function getJson(path, {
  signal,
  timeoutMs = REQUEST_TIMEOUT_MS,
  method = 'GET',
  body,
  token,
} = {}) {
  const url = getApiUrl(path);
  const controller = new AbortController();
  const abortRequest = () => controller.abort();

  // Skärmen och tidsgränsen kan båda avbryta samma nätverksanrop.
  signal?.addEventListener('abort', abortRequest);
  if (signal?.aborted) {
    controller.abort();
  }

  const timeout = setTimeout(abortRequest, timeoutMs);
  let response;
  let data;

  const request = {
    method,
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  };

  if (body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }

  // Skyddade anrop skickar JWT i headern, inte i adressen.
  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }

  try {
    response = await fetch(url, request);
    // Lyckad radering har ingen JSON att läsa.
    if (response.status === 204) {
      return null;
    }
    data = await response.json();

    if (!response.ok) {
      let message = `Servern svarade med HTTP ${response.status}. Försök igen.`;
      if (typeof data?.error === 'string') {
        message = data.error;
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    // Skärmen kan ignorera avbrutna anrop, medan timeout får ett eget felmeddelande.
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
    // Behåller HTTP-status även om ett felsvar inte innehåller giltig JSON.
    if (data === undefined) {
      if (!response.ok) {
        const error = new Error(`Servern svarade med HTTP ${response.status}. Försök igen.`);
        error.status = response.status;
        throw error;
      }
      throw new Error('Servern skickade ett svar som inte är giltig JSON. Försök igen.');
    }
    throw error;
  } finally {
    // Städar även när anropet misslyckas eller avbryts.
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

  // Kodar sökordet så att specialtecken inte ändrar URL-parametrarna.
  const data = await getJson(
    `movies/search?query=${encodeURIComponent(query.trim())}&page=${encodeURIComponent(page)}`,
    options
  );

  return checkMovieList(data);
}

// Backend skickar genrelistan direkt som en array med ID och namn.
export async function getMovieGenres(options) {
  const data = await getJson('movies/genres', options);
  if (!Array.isArray(data)) {
    throw new Error('Servern skickade en ogiltig genrelista.');
  }
  return data;
}

// Skickar bara valda filter. Utforska hämtar än så länge endast sida 1.
export async function discoverMovies({ genre, year, minRating, sortBy = 'popular' } = {}, options) {
  const params = ['page=1', `sortBy=${encodeURIComponent(sortBy)}`];
  if (genre !== undefined) {
    params.push(`genre=${encodeURIComponent(genre)}`);
  }
  if (year !== undefined) {
    params.push(`year=${encodeURIComponent(year)}`);
  }
  if (minRating !== undefined) {
    params.push(`minRating=${encodeURIComponent(minRating)}`);
  }
  const data = await getJson(`movies/discover?${params.join('&')}`, options);
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

// Kontrollerar användarsvaret och väljer bara de fält som appen ska använda.
function getUser(data) {
  if (
    typeof data?.id !== 'string' ||
    typeof data.username !== 'string' ||
    typeof data.email !== 'string'
  ) {
    throw new Error('Servern skickade ett ogiltigt autentiseringssvar. Försök igen.');
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email,
  };
}

function getAuthUser(data) {
  if (typeof data?.token !== 'string' || !data.token) {
    throw new Error('Servern skickade ett ogiltigt autentiseringssvar. Försök igen.');
  }
  return getUser(data.user);
}

// Trimmar namn och e-post men låter lösenordet skickas oförändrat.
export async function registerUser({ username, email, password }, options) {
  const data = await getJson('auth/register', {
    ...options,
    method: 'POST',
    body: {
      username: username.trim(),
      email: email.trim(),
      password,
    },
  });

  return getAuthUser(data);
}

export async function loginUser({ email, password }, options) {
  const data = await getJson('auth/login', {
    ...options,
    method: 'POST',
    body: {
      email: email.trim(),
      password,
    },
  });

  const user = getAuthUser(data);

  if (!Number.isFinite(Date.parse(data.expiresAt)) || !Number.isInteger(data.expiresIn)) {
    throw new Error('Servern skickade ett ogiltigt autentiseringssvar. Försök igen.');
  }
  // Hela svaret används endast av AuthContext, aldrig som skärmtext.
  return {
    token: data.token,
    expiresIn: data.expiresIn,
    expiresAt: data.expiresAt,
    user,
  };
}

// Kontrollerar den sparade inloggningen mot backend.
export async function getCurrentUser(token, options) {
  const data = await getJson('auth/me', { ...options, token });
  return getUser(data);
}

// Stoppar skyddade anrop direkt om token saknas.
function requireToken(token) {
  if (typeof token !== 'string' || !token) {
    const error = new Error('Logga in för att hantera recensioner.');
    error.status = 401;
    throw error;
  }
}

function reviewList(data) {
  if (!Array.isArray(data?.reviews)) {
    throw new Error('Servern skickade en ogiltig recensionslista. Försök igen.');
  }
  return data.reviews;
}

function savedReview(data) {
  if (typeof data?.review?.id !== 'string') {
    throw new Error('Servern skickade en ogiltig recension. Försök igen.');
  }
  return data.review;
}

// Ger formuläret ett felmeddelande om betyget eller den trimmade texten är ogiltig.
export function getReviewError(rating, text) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return 'Välj ett heltalsbetyg mellan 1 och 10.';
  }
  if (typeof text !== 'string' || !text.trim()) {
    return 'Skriv en recensionstext.';
  }
  if (text.trim().length > 2000) {
    return 'Recensionstexten får vara högst 2000 tecken.';
  }
  return '';
}

export async function getMovieReviews(movieId, options) {
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    throw new Error('Film-ID måste vara ett positivt, säkert heltal.');
  }
  return reviewList(await getJson(`reviews/movie/${movieId}`, options));
}

// Servern väljer användarens recensioner utifrån JWT, inte ett ID från formuläret.
export async function getMyReviews(token, options) {
  requireToken(token);
  return reviewList(await getJson('reviews/mine', { ...options, token }));
}

export async function createReview(token, { movieId, rating, text }, options) {
  requireToken(token);
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    throw new Error('Film-ID måste vara ett positivt, säkert heltal.');
  }
  const error = getReviewError(rating, text);
  if (error) {
    throw new Error(error);
  }
  // Skickar bara film-ID, betyg och text. Servern bestämmer ägaren.
  const data = await getJson('reviews', {
    ...options,
    token,
    method: 'POST',
    body: { movieId, rating, text: text.trim() },
  });
  return savedReview(data);
}

export async function updateReview(token, id, { rating, text }, options) {
  requireToken(token);
  if (typeof id !== 'string' || !id) {
    throw new Error('Recensions-ID saknas.');
  }
  const error = getReviewError(rating, text);
  if (error) {
    throw new Error(error);
  }
  // Ändrar bara betyg och text; film och ägare ska behållas.
  const data = await getJson(`reviews/${encodeURIComponent(id)}`, {
    ...options,
    token,
    method: 'PATCH',
    body: { rating, text: text.trim() },
  });
  return savedReview(data);
}

export async function deleteReview(token, id, options) {
  requireToken(token);
  if (typeof id !== 'string' || !id) {
    throw new Error('Recensions-ID saknas.');
  }
  await getJson(`reviews/${encodeURIComponent(id)}`, { ...options, token, method: 'DELETE' });
}
