import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ leaderboard: [], currentUserId: req.user!.id });
    return;
  }
  // Anyone in the league competes (players AND super_admins who set league_id),
  // except admins (league moderators) — they oversee but don't compete.
  const { rows } = await query(
    `SELECT
       u.id, u.name,
       s.total_points, s.pre_tournament_points, s.group_stage_points,
       s.knockout_points, s.perfect_matches_count,
       RANK() OVER (ORDER BY s.total_points DESC, s.perfect_matches_count DESC) AS rank
     FROM scores s
     JOIN users u ON s.user_id = u.id
     WHERE u.league_id = $1 AND u.role != 'admin'
     ORDER BY s.total_points DESC, s.perfect_matches_count DESC`,
    [leagueId]
  );
  res.json({ leaderboard: rows, currentUserId: req.user!.id });
});

leaderboardRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { rows: scoreRows } = await query(
    `SELECT s.*,
       RANK() OVER (ORDER BY s.total_points DESC) AS rank
     FROM scores s
     WHERE s.user_id = $1`,
    [userId]
  );

  const { rows: matchHistory } = await query(
    `SELECT
       mp.*,
       m.home_team, m.away_team, m.kickoff_time_utc, m.round, m.group_name,
       m.home_score, m.away_score, m.status as match_status, m.first_scorer_team
     FROM match_predictions mp
     JOIN matches m ON mp.match_id = m.id
     WHERE mp.user_id = $1
     ORDER BY m.kickoff_time_utc DESC`,
    [userId]
  );

  res.json({
    score: scoreRows[0] ?? null,
    matchHistory,
  });
});

// ── Login summary ─────────────────────────────────────────────────────────
// Returns: points earned since last visit, gap to 1st/above/below in league.
// Also updates last_seen_at and last_seen_total_points so the next call
// is relative to NOW. Call once per session (on Home page mount).

leaderboardRouter.get('/summary', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const leagueId = req.user!.league_id;

  if (!leagueId) {
    res.json({ pointsSinceLastVisit: 0, lastSeenAt: null, gaps: { first: null, above: null, below: null } });
    return;
  }

  // 1. Get the user's current state + previous baseline + last_seen_at
  const { rows: meRows } = await query<{
    total_points: number;
    last_seen_total_points: number;
    last_seen_at: Date | null;
    rank: number;
    name: string;
  }>(
    `SELECT
       COALESCE(s.total_points, 0) AS total_points,
       COALESCE(u.last_seen_total_points, 0) AS last_seen_total_points,
       u.last_seen_at,
       u.name,
       (SELECT COUNT(*) + 1 FROM scores s2 JOIN users u2 ON u2.id = s2.user_id
          WHERE u2.league_id = $2 AND u2.role != 'admin'
            AND (s2.total_points > COALESCE(s.total_points, 0)
                 OR (s2.total_points = COALESCE(s.total_points, 0)
                     AND COALESCE(s2.perfect_matches_count, 0) > COALESCE(s.perfect_matches_count, 0)))
       ) AS rank
     FROM users u
     LEFT JOIN scores s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId, leagueId]
  );

  const me = meRows[0];
  if (!me) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const pointsSinceLastVisit = Math.max(0, Number(me.total_points) - Number(me.last_seen_total_points));

  // 2. Get the league leaderboard slice we need for gap calculation
  const { rows: board } = await query<{
    id: number;
    name: string;
    total_points: number;
    rnk: number;
  }>(
    `SELECT u.id, u.name,
            COALESCE(s.total_points, 0) AS total_points,
            RANK() OVER (ORDER BY COALESCE(s.total_points, 0) DESC,
                                  COALESCE(s.perfect_matches_count, 0) DESC) AS rnk
       FROM users u
       LEFT JOIN scores s ON s.user_id = u.id
      WHERE u.league_id = $1 AND u.role != 'admin'
      ORDER BY rnk ASC`,
    [leagueId]
  );

  const myIdx = board.findIndex(b => b.id === userId);
  const myEntry = myIdx >= 0 ? board[myIdx] : null;

  function gap(other: typeof board[number] | null) {
    if (!other || !myEntry) return null;
    return {
      name: other.name,
      points: Number(other.total_points),
      delta: Number(other.total_points) - Number(myEntry.total_points),
    };
  }

  const firstPlace = board[0] && myEntry && board[0].id !== userId ? gap(board[0]) : null;
  const above = myIdx > 0 ? gap(board[myIdx - 1]) : null;
  const below = myIdx >= 0 && myIdx < board.length - 1 ? gap(board[myIdx + 1]) : null;

  // 3. Update last_seen so subsequent call is relative to now
  await query(
    `UPDATE users SET last_seen_at = NOW(), last_seen_total_points = $2 WHERE id = $1`,
    [userId, Number(me.total_points)]
  );

  res.json({
    pointsSinceLastVisit,
    lastSeenAt: me.last_seen_at,
    myRank: myEntry ? Number(myEntry.rnk) : null,
    myPoints: myEntry ? Number(myEntry.total_points) : 0,
    leagueSize: board.length,
    gaps: { first: firstPlace, above, below },
  });
});

leaderboardRouter.get('/stats', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ popularPredictions: [] });
    return;
  }
  // PRIVACY: only return aggregate vote stats for matches whose deadline has
  // passed (kickoff − 1h <= NOW). Otherwise we'd leak how players are betting
  // before they're locked in. This filter MUST be server-side because any
  // client could query /stats directly. Don't trust the frontend to redact.
  // Returns full per-dimension distributions (winner / home goals / away goals
  // / goal diff / first scorer) so the UI can render rich charts.
  const { rows: popularPredictions } = await query(
    `WITH lp AS (
       SELECT mp.match_id, mp.prediction_result, mp.team_a_goals, mp.team_b_goals,
              mp.first_scorer, mp.goal_difference
         FROM match_predictions mp
         JOIN users u ON u.id = mp.user_id
         JOIN matches m ON m.id = mp.match_id
        WHERE u.league_id = $1
          AND m.kickoff_time_utc - INTERVAL '1 hour' <= NOW()
     ),
     home_dist AS (
       SELECT match_id, json_object_agg(team_a_goals::text, n) AS d
         FROM (SELECT match_id, team_a_goals, COUNT(*) AS n FROM lp GROUP BY match_id, team_a_goals) s
        GROUP BY match_id
     ),
     away_dist AS (
       SELECT match_id, json_object_agg(team_b_goals::text, n) AS d
         FROM (SELECT match_id, team_b_goals, COUNT(*) AS n FROM lp GROUP BY match_id, team_b_goals) s
        GROUP BY match_id
     ),
     diff_dist AS (
       SELECT match_id, json_object_agg(goal_difference::text, n) AS d
         FROM (SELECT match_id, goal_difference, COUNT(*) AS n FROM lp GROUP BY match_id, goal_difference) s
        GROUP BY match_id
     ),
     core AS (
       SELECT
         match_id,
         COUNT(*) AS total_predictions,
         COUNT(*) FILTER (WHERE prediction_result = 'home') AS home_votes,
         COUNT(*) FILTER (WHERE prediction_result = 'draw') AS draw_votes,
         COUNT(*) FILTER (WHERE prediction_result = 'away') AS away_votes,
         COUNT(*) FILTER (WHERE first_scorer = 'home') AS fs_home,
         COUNT(*) FILTER (WHERE first_scorer = 'away') AS fs_away,
         COUNT(*) FILTER (WHERE first_scorer = 'none') AS fs_none
       FROM lp
       GROUP BY match_id
     )
     SELECT
       m.id AS match_id, m.home_team, m.away_team, m.kickoff_time_utc,
       m.status, m.home_score, m.away_score, m.first_scorer_team,
       core.total_predictions, core.home_votes, core.draw_votes, core.away_votes,
       core.fs_home, core.fs_away, core.fs_none,
       home_dist.d AS home_goal_dist,
       away_dist.d AS away_goal_dist,
       diff_dist.d AS diff_dist
       FROM core
       JOIN matches m ON m.id = core.match_id
       LEFT JOIN home_dist ON home_dist.match_id = core.match_id
       LEFT JOIN away_dist ON away_dist.match_id = core.match_id
       LEFT JOIN diff_dist ON diff_dist.match_id = core.match_id
     ORDER BY m.kickoff_time_utc DESC
     LIMIT 30`,
    [leagueId]
  );

  res.json({ popularPredictions });
});
