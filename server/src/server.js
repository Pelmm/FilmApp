import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './database.js';
import User from './models/User.js';
import { getJwtSecret } from './routes/auth.js';

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT måste vara ett heltal mellan 1 och 65535.');
}

async function startServer() {
  try {
    // Kontrollera konfigurationen före anslutning och innan några anrop tas emot.
    if (!process.env.MONGODB_URI?.trim()) {
      console.error('MONGODB_URI saknas. Ange anslutningen i server/.env.');
      process.exitCode = 1;
      return;
    }
    try {
      getJwtSecret();
    } catch {
      console.error(
        'JWT_SECRET måste vara en slumpmässig hemlighet med minst 32 tecken.'
      );
      process.exitCode = 1;
      return;
    }
    await connectDatabase();
    // Vänta på User-modellens unika e-postindex innan registrering tillåts.
    await User.init();

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`FilmApp API körs på http://localhost:${port}/api/health`);
    });

    server.on('error', (error) => {
      console.error(`Kunde inte starta FilmApp API: ${error.message}`);
      process.exitCode = 1;
    });
  } catch {
    console.error(
      'Kunde inte starta FilmApp API. Kontrollera MongoDB-anslutningen och databasens index.'
    );
    process.exitCode = 1;
  }
}

startServer();
