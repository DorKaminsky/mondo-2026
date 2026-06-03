import { query, getClient } from '../db/pool';
import { logger } from '../utils/logger';
import { Match, MatchPrediction } from '../types';

const GROUP_POINTS_PER_CORRECT = 2;
const KNOCKOUT_POINTS_PER_CORRECT = 3;
const DEFAULT_POINTS_PER_CORRECT = 1;
const MAX_PREDICTIONS = 5;

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

  // Perfect match: all 5 correct AND not a 0-0 default
  const isPerfect =
    correct === MAX_PREDICTIONS &&
    !(pred.is_default && match.home_score === 0 && match.away_score === 0);

  return { points: Math.min(points, maxPoints), isPerfect };
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
      WHERE u.role = 'player' AND mp.id IS NULL
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
      for (const p of prior) {
        const wasPerfect = p.points_earned === (p.is_default ? 5 : (isKnockout(match.round) ? 15 : 10))
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
      // Player picks now compare on name only (case-insensitive, trimmed) — team field has been dropped
      const topScorerName = typeof pred.top_scorer_name === 'string' ? pred.top_scorer_name : '';
      const topAssisterName = typeof pred.top_assister_name === 'string' ? pred.top_assister_name : '';
      if (topScorerName.trim().toLowerCase() === actualTopScorerName.trim().toLowerCase() && topScorerName) {
        points += 12;
      }
      if (topAssisterName.trim().toLowerCase() === actualTopAssisterName.trim().toLowerCase() && topAssisterName) {
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
  // Find matches whose deadline just passed (within last 5 minutes) and users with no prediction
  const { rows: matches } = await query<Match>(
    `SELECT * FROM matches
     WHERE status = 'scheduled'
       AND kickoff_time_utc - INTERVAL '1 hour' <= NOW()
       AND kickoff_time_utc - INTERVAL '65 minutes' >= NOW()`
  );

  for (const match of matches) {
    // Find users without a prediction for this match
    const { rows: usersWithout } = await query(
      `SELECT u.id FROM users u
       LEFT JOIN match_predictions mp ON mp.user_id = u.id AND mp.match_id = $1
       WHERE u.role = 'player' AND mp.id IS NULL`,
      [match.id]
    );

    for (const user of usersWithout) {
      await query(
        `INSERT INTO match_predictions
           (user_id, match_id, prediction_result, team_a_goals, team_b_goals, first_scorer, goal_difference, is_default)
         VALUES ($1, $2, 'draw', 0, 0, 'none', 0, true)
         ON CONFLICT DO NOTHING`,
        [user.id, match.id]
      );
    }

    if (usersWithout.length > 0) {
      logger.info(`Applied ${usersWithout.length} default predictions for match ${match.id}`);
    }
  }
}
