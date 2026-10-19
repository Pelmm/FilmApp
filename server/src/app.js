import express from 'express';
import cors from 'cors';
import moviesRouter from './routes/movies.js';
import authRouter from './routes/auth.js';
import reviewsRouter from './routes/reviews.js';

const app = express();

// Öppen CORS för lokal utveckling; begränsa ursprung före publicering.
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/movies', moviesRouter);
app.use('/api/auth', authRouter);
app.use('/api/reviews', reviewsRouter);

// Felaktig JSON ska inte skicka Express interna fel eller delar av requesten.
app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Skicka giltig JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Förfrågan är för stor.' });
  }
  return res.status(500).json({ error: 'Ett serverfel uppstod. Försök igen senare.' });
});

export default app;
