import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { query } from '../db/pool';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { User } from '../types';

export const authRouter = Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(50).required(),
  invite_code: Joi.string().alphanum().length(6).uppercase().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

function signToken(user: { id: number; role: User['role']; league_id: number | null }) {
  return jwt.sign(
    { id: user.id, role: user.role, league_id: user.league_id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const { email, password, name, invite_code } = value;
  const normalizedEmail = email.toLowerCase();

  // Reject duplicate email
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  // Bootstrap rule: if there are zero users in the system, the first one to register
  // becomes super_admin and does NOT need an invite code.
  const { rows: countRows } = await query<{ count: string }>('SELECT COUNT(*) AS count FROM users');
  const isFirstUser = parseInt(countRows[0].count, 10) === 0;

  let role: User['role'] = 'player';
  let leagueId: number | null = null;

  if (isFirstUser) {
    role = 'super_admin';
    // First user has no league yet — they'll create one from the admin UI.
  } else {
    if (!invite_code) {
      res.status(400).json({ error: 'A league invite code is required to register' });
      return;
    }
    const { rows: leagueRows } = await query<{ id: number }>(
      'SELECT id FROM leagues WHERE invite_code = $1',
      [invite_code.toUpperCase()]
    );
    if (leagueRows.length === 0) {
      res.status(400).json({ error: 'Invalid league invite code' });
      return;
    }
    leagueId = leagueRows[0].id;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await query<User>(
    `INSERT INTO users (email, password_hash, name, role, league_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, league_id, created_at`,
    [normalizedEmail, password_hash, name, role, leagueId]
  );
  const user = rows[0];

  // Empty scores row so leaderboard joins work
  await query('INSERT INTO scores (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

  const token = signToken(user);
  res.status(201).json({ token, user });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const { email, password } = value;
  const { rows } = await query<User>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (rows.length === 0) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      league_id: user.league_id,
    },
  });
});

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<User>(
    'SELECT id, email, name, role, league_id, created_at FROM users WHERE id = $1',
    [req.user!.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ user: rows[0] });
});
