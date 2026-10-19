import { Router } from 'express';
import {
  getPopularMovies,
  searchMovies,
  getMovieDetails,
  discoverMovies,
  getMovieGenres,
} from '../services/tmdb.js';

const router = Router();

// Godtar bara vanliga siffror, inte decimaler, tecken eller andra talformat.
function hasOnlyDigits(value) {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length === 0) {
    return false;
  }

  const digits = '0123456789';

  for (const character of value) {
    if (!digits.includes(character)) {
      return false;
    }
  }
  return true;
}

function getPage(value = '1') {
  // Kontrollera texten före Number(), så att exempelvis 1e2 inte blir 100.
  if (!hasOnlyDigits(value)) {
    return null;
  }

  const page = Number(value);

  if (page < 1) {
    return null;
  }
  if (page > 500) {
    return null;
  }
  return page;
}

function getPositiveInteger(value) {
  if (!hasOnlyDigits(value)) {
    return null;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    return null;
  }
  return number;
}

// Tillåter vanliga decimaltal men inte exempelvis tom text eller exponenter.
function getMinRating(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  for (const character of value) {
    if (!'0123456789.'.includes(character)) {
      return null;
    }
  }
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    return null;
  }
  return rating;
}

// Discover saknar titelsökning. Okända parametrar får därför inte ignoreras tyst.
router.get('/discover', async (req, res) => {
  const allowedParameters = ['genre', 'year', 'minRating', 'sortBy', 'page'];
  for (const name of Object.keys(req.query)) {
    if (!allowedParameters.includes(name)) {
      return res.status(400).json({
        error: 'Discover stöder genre, year, minRating, sortBy och page. Titelsökning görs via /api/movies/search.',
      });
    }
  }

  const filters = {
    page: getPage(req.query.page),
    sortBy: req.query.sortBy ?? 'popular',
  };
  if (!filters.page) {
    return res.status(400).json({ error: 'Sidnumret måste vara ett heltal mellan 1 och 500.' });
  }
  // Tillåter bara de sorteringar som vi använder i appen.
  if (!['popular', 'rating', 'newest', 'oldest'].includes(filters.sortBy)) {
    return res.status(400).json({ error: 'Sorteringen måste vara popular, rating, newest eller oldest.' });
  }
  if (req.query.genre !== undefined) {
    filters.genre = getPositiveInteger(req.query.genre);
    if (filters.genre === null) {
      return res.status(400).json({ error: 'Genre-ID måste vara ett positivt, säkert heltal.' });
    }
  }
  if (req.query.year !== undefined) {
    filters.year = getPositiveInteger(req.query.year);
    const lastYear = new Date().getFullYear() + 5;
    if (filters.year === null || filters.year < 1888 || filters.year > lastYear) {
      return res.status(400).json({ error: `Årtalet måste vara ett heltal mellan 1888 och ${lastYear}.` });
    }
  }
  if (req.query.minRating !== undefined) {
    filters.minRating = getMinRating(req.query.minRating);
    if (filters.minRating === null) {
      return res.status(400).json({ error: 'Lägsta betyg måste vara ett tal mellan 0 och 10.' });
    }
  }

  const movies = await discoverMovies(filters);
  res.json(movies);
});

router.get('/genres', async (req, res) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({ error: 'Genrelistan tar inga query-parametrar.' });
  }
  const genres = await getMovieGenres();
  res.json(genres);
});

// Kontrollerar sidnumret innan populära filmer hämtas från TMDB.
router.get('/popular', async (req, res) => {
  const page = getPage(req.query.page);

  if (!page) {
    return res.status(400).json({ error: 'Sidnumret måste vara ett heltal mellan 1 och 500.' });
  }

  const movies = await getPopularMovies(page);

  res.json(movies);
});

// Namngivna routes måste ligga före /:id så att "search" inte tolkas som ett ID.
router.get('/search', async (req, res) => {
  const query = req.query.query;
  const page = getPage(req.query.page);

  if (typeof query !== 'string') {
    return res.status(400).json({ error: 'Ange ett sökord.' });
  }
  if (!query.trim()) {
    return res.status(400).json({ error: 'Ange ett sökord.' });
  }
  if (!page) {
    return res.status(400).json({ error: 'Sidnumret måste vara ett heltal mellan 1 och 500.' });
  }

  const movies = await searchMovies(query.trim(), page);

  res.json(movies);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (
    !hasOnlyDigits(req.params.id) ||
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    return res.status(400).json({ error: 'Film-ID måste vara ett positivt heltal.' });
  }

  const movie = await getMovieDetails(id);

  res.json(movie);
});

// Express 5 skickar fel från async-routes hit automatiskt.
router.use((error, _req, res, _next) => {
  if (error.status) {
    return res.status(error.status).json({ error: error.message });
  }
  res.status(500).json({ error: 'Ett serverfel uppstod när filmerna hämtades.' });
});

export default router;
