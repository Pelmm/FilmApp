import express from 'express';
import cors from 'cors';
import moviesRouter from './routes/movies.js';

const app = express();

// Öppen CORS för lokal utveckling; begränsa ursprung före publicering.
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/movies', moviesRouter);

export default app;
