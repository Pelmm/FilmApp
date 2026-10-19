import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret, requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();

// Kontrollerar e-postens delar och avvisar bland annat mellanslag och felaktig domän.
function isValidEmail(email) {
  if (email.length > 254) {
    return false;
  }
  for (const character of email) {
    if (character.trim() === '') {
      return false;
    }
    if (character.charCodeAt(0) < 32) {
      return false;
    }
  }

  const parts = email.split('@');

  if (parts.length !== 2) {
    return false;
  }

  const [name, domain] = parts;

  if (!name) {
    return false;
  }
  if (
    name.startsWith('.') ||
    name.endsWith('.') ||
    name.includes('..')
  ) {
    return false;
  }

  const domainParts = domain.split('.');

  if (domainParts.length < 2) {
    return false;
  }
  for (const part of domainParts) {
    if (!part) {
      return false;
    }
    if (
      part.startsWith('-') ||
      part.endsWith('-')
    ) {
      return false;
    }
    for (const character of part) {
      if (!'abcdefghijklmnopqrstuvwxyz0123456789-'.includes(character)) {
        return false;
      }
    }
  }
  return true;
}

// Skapar en JWT som gäller i en timme och innehåller användarens ID.
function createAuthResponse(user, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const token = jwt.sign(
    {
      sub: String(user._id),
      iat: issuedAt
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn,
    }
  );
  // Välj uttryckligen fälten som får lämna servern.
  return {
    token,
    expiresIn,
    expiresAt: new Date((issuedAt + expiresIn) * 1000).toISOString(),
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email
    },
  };
}

// Validerar uppgifterna innan ett nytt konto får skapas.
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};

  if (
    typeof username !== 'string' ||
    !username.trim()
  ) {
    return res.status(400).json({ error: 'Ange ett användarnamn.' });
  }
  if (username.trim().length > 100) {
    return res.status(400).json({ error: 'Användarnamnet får vara högst 100 tecken.' });
  }
  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'Ange en giltig e-postadress.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Ange en giltig e-postadress.' });
  }
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'Lösenordet måste innehålla minst 8 tecken.' });
  }
  if (password.trim().length < 8) {
    return res.status(400).json({ error: 'Lösenordet måste innehålla minst 8 tecken.' });
  }
  // bcrypt använder högst 72 byte. Avvisa längre lösenord i stället för att kapa dem.
  if (bcrypt.truncates(password)) {
    return res.status(400).json({ error: 'Lösenordet får vara högst 72 byte i UTF-8.' });
  }

  try {
    const secret = getJwtSecret();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ error: 'E-postadressen används redan.' });
    }

    // Hashar lösenordet med bcrypt innan användaren sparas.
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.trim(),
      email: normalizedEmail,
      passwordHash
    });

    return res.status(201).json(createAuthResponse(user, secret));
  } catch (error) {
    // Det unika MongoDB-indexet skyddar även vid samtidiga registreringar.
    if (error.code === 11000) {
      return res.status(409).json({ error: 'E-postadressen används redan.' });
    }
    return res.status(500).json({ error: 'Kunde inte registrera användaren. Försök igen senare.' });
  }
});

// Kontrollerar inloggningsuppgifterna och ger en ny JWT om de stämmer.
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'Ange en giltig e-postadress.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Ange en giltig e-postadress.' });
  }
  if (
    typeof password !== 'string' ||
    !password
  ) {
    return res.status(400).json({ error: 'Ange ett lösenord.' });
  }
  if (bcrypt.truncates(password)) {
    return res.status(400).json({ error: 'Lösenordet får vara högst 72 byte i UTF-8.' });
  }

  try {
    const secret = getJwtSecret();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ error: 'Felaktig e-postadress eller lösenord.' });
    }

    // Samma feltext används för okänd e-post och fel lösenord.
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Felaktig e-postadress eller lösenord.' });
    }
    return res.json(createAuthResponse(user, secret));
  } catch {
    return res.status(500).json({ error: 'Kunde inte logga in. Försök igen senare.' });
  }
});

// requireAuth kontrollerar sessionen innan användaruppgifterna skickas tillbaka.
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: String(req.user._id),
    username: req.user.username,
    email: req.user.email,
  });
});

export default router;
