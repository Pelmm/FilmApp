import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT måste vara ett heltal mellan 1 och 65535.');
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`FilmApp API körs på http://localhost:${port}/api/health`);
});

server.on('error', (error) => {
  console.error(`Kunde inte starta FilmApp API: ${error.message}`);
  process.exitCode = 1;
});
