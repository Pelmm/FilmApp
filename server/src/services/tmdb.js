const TMDB_URL = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 8000;

function tmdbError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fetchTmdb(path, params = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token?.trim()) {
    throw tmdbError('Filmtjänsten är inte konfigurerad på servern.', 500);
  }

  const url = new URL(`${TMDB_URL}/${path}`);
  url.searchParams.set('language', 'sv-SE');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw tmdbError('Filmtjänsten svarade inte i tid. Försök igen.', 504);
      }
      throw tmdbError('Kunde inte nå filmtjänsten. Försök igen senare.', 502);
    }

    if (response.status === 404) {
      throw tmdbError('Filmen hittades inte.', 404);
    }
    if (response.status === 429) {
      throw tmdbError('Filmtjänsten är upptagen. Försök igen senare.', 503);
    }
    if (!response.ok) {
      throw tmdbError('Filmtjänsten kunde inte hämta filmerna. Försök igen senare.', 502);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw tmdbError('Filmtjänsten svarade inte i tid. Försök igen.', 504);
      }
      throw tmdbError('Filmtjänsten skickade ogiltig JSON.', 502);
    }
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      throw tmdbError('Filmtjänsten skickade ett ogiltigt svar.', 502);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function getPosterPath(value) {
  if (typeof value !== 'string') {
    return null;
  }
  if (value.trim() !== value) {
    return null;
  }
  if (!value.startsWith('/')) {
    return null;
  }
  const filename = value.slice(1);
  if (!filename) {
    return null;
  }
  if (
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    return null;
  }
  if (filename === '.' || filename === '..') {
    return null;
  }
  // Koda filnamnet så att exempelvis ? aldrig blir en query i bildadressen.
  return '/' + encodeURIComponent(filename);
}

function isValidReleaseDate(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === value;
}

function movieSummary(movie) {
  if (
    !movie ||
    !Number.isSafeInteger(movie.id) ||
    movie.id < 1
  ) {
    throw tmdbError('Filmtjänsten skickade ogiltig filmdata.', 502);
  }
  const summary = {
    id: movie.id,
    title: '',
    poster_path: getPosterPath(movie.poster_path),
    release_date: '',
    vote_average: null,
  };
  if (typeof movie.title === 'string') {
    summary.title = movie.title.trim();
  }
  if (isValidReleaseDate(movie.release_date)) {
    summary.release_date = movie.release_date;
  }
  if (
    Number.isFinite(movie.vote_average) &&
    movie.vote_average >= 0 &&
    movie.vote_average <= 10
  ) {
    summary.vote_average = movie.vote_average;
  }
  return summary;
}

function movieList(data) {
  if (
    !Array.isArray(data.results) ||
    !Number.isInteger(data.page) ||
    data.page < 1 ||
    !Number.isInteger(data.total_pages) ||
    data.total_pages < 0
  ) {
    throw tmdbError('Filmtjänsten skickade en ogiltig filmlista.', 502);
  }
  return {
    page: data.page,
    total_pages: data.total_pages,
    results: data.results.map(movieSummary),
  };
}

export async function getPopularMovies(page) {
  const data = await fetchTmdb('movie/popular', { page });
  return movieList(data);
}

export async function searchMovies(query, page) {
  const data = await fetchTmdb('search/movie', { query, page, include_adult: false });
  return movieList(data);
}

export async function getMovieDetails(id) {
  const data = await fetchTmdb(`movie/${id}`);
  if (data.id !== id) {
    throw tmdbError('Filmtjänsten skickade ogiltig filmdata.', 502);
  }
  const details = movieSummary(data);
  details.overview = '';
  details.genres = [];
  details.runtime = null;
  if (typeof data.overview === 'string') {
    details.overview = data.overview;
  }
  if (Array.isArray(data.genres)) {
    for (const genre of data.genres) {
      if (!genre) {
        continue;
      }
      if (!Number.isInteger(genre.id)) {
        continue;
      }
      if (typeof genre.name !== 'string') {
        continue;
      }
      details.genres.push({ id: genre.id, name: genre.name });
    }
  }
  if (
    Number.isInteger(data.runtime) &&
    data.runtime >= 0
  ) {
    details.runtime = data.runtime;
  }
  return details;
}
