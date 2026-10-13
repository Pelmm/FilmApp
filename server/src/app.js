import express from 'express';
import cors from 'cors';

const app = express();

// Öppen CORS för lokal utveckling; begränsa ursprung före publicering.
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
