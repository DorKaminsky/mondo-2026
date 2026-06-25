import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { matchesRouter } from './routes/matches';
import { predictionsRouter } from './routes/predictions';
import { preTournamentRouter } from './routes/preTournament';
import { leaderboardRouter } from './routes/leaderboard';
import { adminRouter } from './routes/admin';
import { leaguesRouter } from './routes/leagues';
import { pushRouter } from './routes/push';

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.nodeEnv === 'production' ? process.env.FRONTEND_URL : true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limits keyed by IP. Defaults are calibrated for a friend group:
//  - Global 1000/15min: covers a 20-user league refreshing leaderboards on game day,
//    plus a few people on a shared WiFi/CGNAT.
//  - Auth 60/15min: enough for a household of friends signing up together,
//    still tight enough to slow down credential-stuffing.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

app.use('/api', limiter);
app.use('/api/auth', authLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/pre-tournament', preTournamentRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api/push', pushRouter);

app.use(notFound);
app.use(errorHandler);
