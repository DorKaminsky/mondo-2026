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

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.nodeEnv === 'production' ? process.env.FRONTEND_URL : true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

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

app.use(notFound);
app.use(errorHandler);
