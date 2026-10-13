import { Router } from 'express';
import { getPopularMovies, searchMovies, getMovieDetails } from '../services/tmdb.js';

const router = Router();

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
