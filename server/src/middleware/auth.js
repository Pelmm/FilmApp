import jwt from 'jsonwebtoken';
import { isObjectIdOrHexString } from 'mongoose';
import User from '../models/User.js';

// Hämtar serverns JWT-hemlighet och stoppar användning om den saknas eller är för kort.
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== 'string') {
    throw new Error(
      'JWT_SECRET måste vara en slumpmässig hemlighet med minst 32 tecken.'
    );
  }
  if (secret.trim().length < 32) {
    throw new Error(
      'JWT_SECRET måste vara en slumpmässig hemlighet med minst 32 tecken.'
    );
  }
  return secret;
}

export async function requireAuth(req, res, next) {
  // Svaret ska inte sparas i cache eftersom det gäller en inloggad användare.
  res.set('Cache-Control', 'no-store');
  const authorization = req.get('Authorization') || '';
  const parts = authorization.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut. Logga in igen.' });
  }

  try {
    const secret = getJwtSecret();
    let payload;

    try {
      // Kontrollerar signatur och utgångstid och tillåter bara algoritmen HS256.
      payload = jwt.verify(parts[1], secret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut. Logga in igen.' });
    }

    if (!isObjectIdOrHexString(payload.sub) || !Number.isInteger(payload.exp)) {
      return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut. Logga in igen.' });
    }

    // Användaren måste fortfarande finnas även om token är giltig.
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut. Logga in igen.' });
    }
    // Nästa route får den verifierade användaren via req.user.
    req.user = user;
    return next();
  } catch {
    return res.status(500).json({ error: 'Kunde inte kontrollera sessionen. Försök igen senare.' });
  }
}
