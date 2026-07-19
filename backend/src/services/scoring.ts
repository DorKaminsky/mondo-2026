import { query, getClient } from '../db/pool';
import { logger } from '../utils/logger';
import { Match, MatchPrediction } from '../types';
import { sendPredictionReceipt } from './push';

const GROUP_POINTS_PER_CORRECT = 2;
const KNOCKOUT_POINTS_PER_CORRECT = 3;
const DEFAULT_POINTS_PER_CORRECT = 1;
const MAX_PREDICTIONS = 5;

// Perfect-prediction bonus, introduced for round-2 of group stage (Czechia vs
// South Africa, match_number 25). Applies to non-default predictions only.
// Group +2, Knockout +3. Stacks with the existing ⭐ counter.
// Earlier matches keep historical scoring even if re-scored.
const PERFECT_BONUS_FROM_MATCH_NUMBER = 25;
const PERFECT_BONUS_GROUP = 2;
const PERFECT_BONUS_KNOCKOUT = 3;

function perfectBonusFor(match: Match, isDefault: boolean): number {
  if (isDefault) return 0;
  if (match.match_number < PERFECT_BONUS_FROM_MATCH_NUMBER) return 0;
  return isKnockout(match.round) ? PERFECT_BONUS_KNOCKOUT : PERFECT_BONUS_GROUP;
}

export function isKnockout(round: string): boolean {
  return ['r32', 'r16', 'qf', 'sf', 'final'].includes(round);
}

function calcActualResult(homeScore: number, awayScore: number): 'home' | 'draw' | 'away' {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

interface PredictionScore {
  points: number;
  isPerfect: boolean;
}

export function scorePrediction(pred: MatchPrediction, match: Match): PredictionScore {
  if (match.home_score === null || match.away_score === null) return { points: 0, isPerfect: false };

  const pointsPerCorrect = pred.is_default
    ? DEFAULT_POINTS_PER_CORRECT
    : isKnockout(match.round) ? KNOCKOUT_POINTS_PER_CORRECT : GROUP_POINTS_PER_CORRECT;

  const actualResult = calcActualResult(match.home_score, match.away_score);
  const actualDiff = Math.abs(match.home_score - match.away_score);

  let correct = 0;

  // 1. Match result
  if (pred.prediction_result === actualResult) correct++;

  // 2. Home goals
  if (pred.team_a_goals === match.home_score) correct++;

  // 3. Away goals
  if (pred.team_b_goals === match.away_score) correct++;

  // 4. First scorer team (only meaningful if there are goals)
  const actualFirstScorer = match.first_scorer_team ?? 'none';
  if (pred.first_scorer === actualFirstScorer) correct++;

  // 5. Goal difference
  if (pred.goal_difference === actualDiff) correct++;

  const points = correct * pointsPerCorrect;
  const maxPoints = MAX_PREDICTIONS * pointsPerCorrect;
  const cappedPoints = Math.min(points, maxPoints);

  // Perfect match: all 5 correct AND not a 0-0 default
  const isPerfect =
    correct === MAX_PREDICTIONS &&
    !(pred.is_default && match.home_score === 0 && match.away_score === 0);

  // Bonus only applies to *real* perfect predictions on matches at/after the
  // round-2-of-group cutoff. Defaults never get it (perfectBonusFor enforces this).
  const bonus = isPerfect ? perfectBonusFor(match, pred.is_default) : 0;

  return { points: cappedPoints + bonus, isPerfect };
}

export async function calculateMatchScores(matchId: number): Promise<void> {
  const { rows: matchRows } = await query<Match>(
    'SELECT * FROM matches WHERE id = $1', [matchId]
  );
  if (matchRows.length === 0) return;
  const match = matchRows[0];

  if (match.home_score === null || match.away_score === null || match.status !== 'finished') return;

  // Auto-fill default predictions for any players who didn't predict.
  // Safety net in case the 5-min cron didn't fire (e.g. backend was down,
  // or admin entered the result long after kickoff). Default = 0-0 draw,
  // is_default=true, scored at 1pt/correct.
  await query(
    `INSERT INTO match_predictions
       (user_id, match_id, prediction_result, team_a_goals, team_b_goals, first_scorer, goal_difference, is_default)
     SELECT u.id, $1, 'draw', 0, 0, 'none', 0, true
       FROM users u
       LEFT JOIN match_predictions mp ON mp.user_id = u.id AND mp.match_id = $1
      WHERE u.role != 'admin' AND u.league_id IS NOT NULL AND mp.id IS NULL
     ON CONFLICT DO NOTHING`,
    [matchId]
  );

  const { rows: predictions } = await query<MatchPrediction>(
    'SELECT * FROM match_predictions WHERE match_id = $1', [matchId]
  );

  // Idempotency: if this match was scored before, undo prior points first
  // so re-scoring (e.g. admin corrected the score) doesn't double-count.
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Reverse previously-applied points for this match (if any)
    const { rows: prior } = await client.query<MatchPrediction>(
      'SELECT * FROM match_predictions WHERE match_id = $1 AND points_earned IS NOT NULL',
      [matchId]
    );
    if (prior.length > 0) {
      const priorPointsColumn = isKnockout(match.round) ? 'knockout_points' : 'group_stage_points';
      // To recognise a previously-stored perfect prediction we recompute what
      // the engine *would have stored* for it. That number depends on:
      //   - default vs real (defaults: 5 max, never bonus)
      //   - group vs knockout
      //   - whether the match qualifies for the perfect bonus (match_number >= 25)
      // and matches the formula in scorePrediction.
      const perfectStoredValue = (isDefault: boolean): number => {
        if (isDefault) return 5; // 5 × 1pt, no bonus
        const base = isKnockout(match.round) ? 15 : 10;
        return base + perfectBonusFor(match, false);
      };
      for (const p of prior) {
        const wasPerfect = p.points_earned === perfectStoredValue(p.is_default)
                          && !(p.is_default && match.home_score === 0 && match.away_score === 0);
        await client.query(
          `UPDATE scores SET
             ${priorPointsColumn} = GREATEST(0, ${priorPointsColumn} - $1),
             total_points = GREATEST(0, total_points - $1),
             perfect_matches_count = GREATEST(0, perfect_matches_count - $2)
           WHERE user_id = $3`,
          [p.points_earned ?? 0, wasPerfect ? 1 : 0, p.user_id]
        );
      }
    }

    for (const pred of predictions) {
      const { points, isPerfect } = scorePrediction(pred, match);

      await client.query(
        'UPDATE match_predictions SET points_earned = $1 WHERE id = $2',
        [points, pred.id]
      );

      const pointsColumn = isKnockout(match.round) ? 'knockout_points' : 'group_stage_points';
      await client.query(
        `UPDATE scores SET
           ${pointsColumn} = ${pointsColumn} + $1,
           total_points = total_points + $1,
           perfect_matches_count = perfect_matches_count + $2,
           last_calculated_at = NOW()
         WHERE user_id = $3`,
        [points, isPerfect ? 1 : 0, pred.user_id]
      );
    }

    await client.query('COMMIT');
    logger.info(`Scored match ${matchId}`, { predictions: predictions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function calculatePreTournamentScores(
  actualWinner: string,
  actualRunnerUp: string,
  actualTopScorerName: string,
  actualTopAssisterName: string,
  groupResults: Record<string, { first: string; second: string }>
): Promise<void> {
  // Player names are free-text, so users type "Mbappe" for "Mbappé", add
  // trailing spaces, vary case. Normalize accent + case + whitespace so a
  // correct pick isn't rejected on a diacritic. Team/group picks come from a
  // fixed dropdown and stay exact-match.
  const normName = (s: string): string =>
    (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const { rows: predictions } = await query<Record<string, unknown>>(
    'SELECT * FROM pre_tournament_predictions WHERE is_final = true'
  );

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const pred of predictions) {
      let points = 0;

      if (pred.winner_team === actualWinner) points += 16;
      if (pred.runner_up_team === actualRunnerUp) points += 8;
      // Player picks compare accent/case/space-insensitive (free-text field).
      const topScorerName = typeof pred.top_scorer_name === 'string' ? pred.top_scorer_name : '';
      const topAssisterName = typeof pred.top_assister_name === 'string' ? pred.top_assister_name : '';
      if (topScorerName && normName(topScorerName) === normName(actualTopScorerName)) {
        points += 12;
      }
      if (topAssisterName && normName(topAssisterName) === normName(actualTopAssisterName)) {
        points += 12;
      }

      const groups = ['a','b','c','d','e','f','g','h','i','j','k','l'];
      for (const g of groups) {
        const actual = groupResults[g];
        if (!actual) continue;
        if (pred[`group_${g}_first`] === actual.first) points += 4;
        if (pred[`group_${g}_second`] === actual.second) points += 4;
      }

      await client.query(
        `UPDATE scores SET
           pre_tournament_points = $1,
           total_points = total_points - pre_tournament_points + $1,
           last_calculated_at = NOW()
         WHERE user_id = $2`,
        [points, pred.user_id]
      );
    }

    await client.query('COMMIT');
    logger.info('Pre-tournament scores calculated', { users: predictions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function applyDefaultPredictions(): Promise<void> {
  // Find matches whose deadline passed within the last 15 minutes and have
  // users without a prediction. Window must match the cron interval (15min)
  // — see backend/src/jobs/index.ts. Plus a small idempotency margin: ON
  // CONFLICT DO NOTHING below means re-processing is safe.
  const { rows: matches } = await query<Match>(
    `SELECT * FROM matches
     WHERE status = 'scheduled'
       AND kickoff_time_utc - INTERVAL '1 hour' <= NOW()
       AND kickoff_time_utc - INTERVAL '75 minutes' >= NOW()`
  );

  for (const match of matches) {
    // Find competing users (any role except 'admin', must be in a league) without a prediction
    const { rows: usersWithout } = await query<{ id: number }>(
      `SELECT u.id FROM users u
       LEFT JOIN match_predictions mp ON mp.user_id = u.id AND mp.match_id = $1
       WHERE u.role != 'admin' AND u.league_id IS NOT NULL AND mp.id IS NULL`,
      [match.id]
    );

    for (const user of usersWithout) {
      const inserted = await query<{ id: number }>(
        `INSERT INTO match_predictions
           (user_id, match_id, prediction_result, team_a_goals, team_b_goals, first_scorer, goal_difference, is_default)
         VALUES ($1, $2, 'draw', 0, 0, 'none', 0, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [user.id, match.id]
      );
      // Only send the receipt push when we actually inserted a default —
      // ON CONFLICT DO NOTHING means a real prediction already existed.
      if (inserted.rows.length > 0) {
        sendPredictionReceipt({
          userId: user.id,
          matchId: match.id,
          homeTeam: match.home_team,
          awayTeam: match.away_team,
          predictionResult: 'draw',
          teamAGoals: 0,
          teamBGoals: 0,
          firstScorer: 'none',
          goalDifference: 0,
          isDefault: true,
          isUpdate: false,
        }).catch(err => logger.warn('Default-receipt push failed', { userId: user.id, matchId: match.id, err }));
      }
    }

    if (usersWithout.length > 0) {
      logger.info(`Applied ${usersWithout.length} default predictions for match ${match.id}`);
    }
  }
}
