import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import Review from '../models/Review.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function getMovieId(value) {
  for (const character of value) {
    if (!'0123456789'.includes(character)) {
      return null;
    }
  }

  const movieId = Number(value);
  if (!Number.isSafeInteger(movieId) || movieId < 1) {
    return null;
  }
  return movieId;
}

function validateReview(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Skicka recensionsuppgifterna som ett JSON-objekt.';
  }

  let allowedFields = ['movieId', 'rating', 'text'];
  if (partial) {
    allowedFields = ['rating', 'text'];
  }

  const fields = Object.keys(body);
  if (fields.length === 0) {
    return 'Ange recensionsuppgifter.';
  }
  for (const field of fields) {
    if (!allowedFields.includes(field)) {
      return 'Förfrågan innehåller otillåtna fält.';
    }
  }

  if (!partial && (!Number.isSafeInteger(body.movieId) || body.movieId < 1)) {
    return 'Film-ID måste vara ett positivt, säkert heltal.';
  }
  if (!partial || fields.includes('rating')) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 10) {
      return 'Betyget måste vara ett heltal mellan 1 och 10.';
    }
  }
  if (!partial || fields.includes('text')) {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return 'Ange en recensionstext.';
    }
    if (body.text.trim().length > 2000) {
      return 'Recensionstexten får vara högst 2000 tecken.';
    }
  }
  return '';
}

function reviewResponse(review) {
  let user = { id: null, username: 'Borttagen användare' };
  if (review.user) {
    user = { id: String(review.user._id), username: review.user.username };
  }

  // Skicka bara de fält som mobilappen behöver, aldrig hela användardokumentet.
  return {
    id: String(review._id),
    movieId: review.movieId,
    rating: review.rating,
    text: review.text,
    user,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

router.get('/movie/:movieId', async (req, res) => {
  const movieId = getMovieId(req.params.movieId);
  if (movieId === null) {
    return res.status(400).json({ error: 'Film-ID måste vara ett positivt, säkert heltal.' });
  }

  const reviews = await Review.find({ movieId })
    .sort({ createdAt: -1, _id: -1 })
    .populate('user', 'username');

  res.json({ reviews: reviews.map(reviewResponse) });
});

router.get('/mine', requireAuth, async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .sort({ createdAt: -1, _id: -1 })
    .populate('user', 'username');

  res.json({ reviews: reviews.map(reviewResponse) });
});

router.post('/', requireAuth, async (req, res) => {
  const error = validateReview(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const review = await Review.create({
    user: req.user._id,
    movieId: req.body.movieId,
    rating: req.body.rating,
    text: req.body.text.trim(),
  });
  await review.populate('user', 'username');

  res.status(201).json({ review: reviewResponse(review) });
});

router.patch('/:id', requireAuth, async (req, res) => {
  if (!isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ error: 'Recensions-ID är ogiltigt.' });
  }

  const error = validateReview(req.body, true);
  if (error) {
    return res.status(400).json({ error });
  }

  const review = await Review.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Recensionen hittades inte.' });
  }
  if (String(review.user) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Du får bara redigera dina egna recensioner.' });
  }

  if (req.body.rating !== undefined) {
    review.rating = req.body.rating;
  }
  if (req.body.text !== undefined) {
    review.text = req.body.text.trim();
  }
  await review.save();
  await review.populate('user', 'username');

  res.json({ review: reviewResponse(review) });
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ error: 'Recensions-ID är ogiltigt.' });
  }

  const review = await Review.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Recensionen hittades inte.' });
  }
  if (String(review.user) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Du får bara ta bort dina egna recensioner.' });
  }

  await Review.deleteOne({ _id: review._id, user: req.user._id });
  res.status(204).end();
});

// Express 5 skickar avvisade async-anrop hit. Råa databasfel lämnar inte servern.
router.use((error, _req, res, _next) => {
  if (error.code === 11000) {
    return res.status(409).json({ error: 'Du har redan recenserat den här filmen.' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Ogiltiga recensionsuppgifter.' });
  }
  return res.status(500).json({ error: 'Kunde inte hantera recensionerna. Försök igen senare.' });
});

export default router;
