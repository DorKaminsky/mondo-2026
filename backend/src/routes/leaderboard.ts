import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { scorePrediction } from '../services/scoring';
import { getTopScorers, getTopAssisters } from '../services/playerStats';
import { Match, MatchPrediction } from '../types';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ leaderboard: [], currentUserId: req.user!.id });
    return;
  }
  // Anyone in the league competes (players AND super_admins who set league_id),
  // EXCEPT:
  //   - admins (league moderators) — they oversee but don't compete
  //   - mock accounts (is_mock = true, e.g. ISRAEL) — used as reference
  //     "average bettor" but not a real friend, so excluded from ranking.
  //     Their predictions still show on match pages and in stats.
  interface BoardRow {
    id: number; name: string; total_points: number; pre_tournament_points: number;
    group_stage_points: number; knockout_points: number; perfect_matches_count: number;
    rank: number; is_mock?: boolean;
  }
  const { rows } = await query<BoardRow>(
    `SELECT
       u.id, u.name,
       s.total_points, s.pre_tournament_points, s.group_stage_points,
       s.knockout_points, s.perfect_matches_count,
       RANK() OVER (ORDER BY s.total_points DESC, s.perfect_matches_count DESC) AS rank
     FROM scores s
     JOIN users u ON s.user_id = u.id
     WHERE u.league_id = $1 AND u.role != 'admin' AND u.is_mock = false
     ORDER BY s.total_points DESC, s.perfect_matches_count DESC`,
    [leagueId]
  );

  // Mock account(s) in this league, returned separately so the standings UI
  // can pin them above the real ranking as a non-competing reference card.
  const { rows: mocks } = await query<BoardRow>(
    `SELECT
       u.id, u.name,
       s.total_points, s.pre_tournament_points, s.group_stage_points,
       s.knockout_points, s.perfect_matches_count
     FROM scores s
     JOIN users u ON s.user_id = u.id
     WHERE u.league_id = $1 AND u.is_mock = true
     ORDER BY s.total_points DESC`,
    [leagueId]
  );

  // Check for live matches and layer provisional points on top of the base standings
  const { rows: liveMatches } = await query<Match>(
    `SELECT * FROM matches WHERE status = 'live' AND home_score IS NOT NULL`
  );

  if (liveMatches.length === 0) {
    res.json({ leaderboard: rows, mocks, currentUserId: req.user!.id, isLive: false });
    return;
  }

  const liveMatchIds = liveMatches.map((m: Match) => m.id);
  const { rows: livePredictions } = await query<MatchPrediction>(
    `SELECT mp.*
     FROM match_predictions mp
     JOIN users u ON u.id = mp.user_id
     WHERE u.league_id = $1 AND mp.match_id = ANY($2::int[])`,
    [leagueId, liveMatchIds]
  );

  // Compute provisional delta (what each player would earn if the match ended now)
  const provisionalDelta = new Map<number, number>();
  for (const pred of livePredictions) {
    const liveMatch = liveMatches.find((m: Match) => m.id === pred.match_id);
    if (!liveMatch) continue;
    const { points } = scorePrediction(pred, liveMatch);
    provisionalDelta.set(pred.user_id, (provisionalDelta.get(pred.user_id) ?? 0) + points);
  }

  // Re-rank by provisional total
  const leaderboard = rows
    .map(entry => ({
      ...entry,
      provisional_total: Number(entry.total_points) + (provisionalDelta.get(entry.id) ?? 0),
      provisional_delta: provisionalDelta.get(entry.id) ?? 0,
    }))
    .sort((a, b) =>
      b.provisional_total - a.provisional_total ||
      b.perfect_matches_count - a.perfect_matches_count
    )
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  // Mocks get a provisional total too (shown on the floating card) but no rank.
  const mocksWithLive = mocks.map(entry => ({
    ...entry,
    provisional_total: Number(entry.total_points) + (provisionalDelta.get(entry.id) ?? 0),
    provisional_delta: provisionalDelta.get(entry.id) ?? 0,
  }));

  res.json({ leaderboard, mocks: mocksWithLive, currentUserId: req.user!.id, isLive: true });
});

// Public-within-league player profile.
// Privacy contract:
//  - Pre-tournament picks: returned in full. Deadline (June 11) has long passed,
//    nothing to leak — visible to every league member by design.
//  - Per-match predictions: ONLY for finished matches. We do NOT leak picks for
//    upcoming/live matches (would let players copy each other's bets).
//  - Scoped to the requester's league: a player in league A cannot view a player
//    in league B even by guessing user_id.
leaderboardRouter.get('/player/:id', authenticate, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id, 10);
  if (Number.isNaN(targetId)) { res.status(400).json({ error: 'Invalid user id' }); return; }

  const leagueId = req.user!.league_id;
  if (!leagueId) { res.status(403).json({ error: 'Not in a league' }); return; }

  const { rows: userRows } = await query<{
    id: number; name: string; role: string; league_id: number | null;
  }>(
    `SELECT id, name, role, league_id FROM users WHERE id = $1`,
    [targetId]
  );
  if (userRows.length === 0 || userRows[0].league_id !== leagueId) {
    res.status(404).json({ error: 'Player not found in your league' });
    return;
  }
  const player = userRows[0];

  const { rows: scoreRows } = await query(
    `SELECT pre_tournament_points, group_stage_points, knockout_points,
            total_points, perfect_matches_count
       FROM scores WHERE user_id = $1`,
    [targetId]
  );

  const { rows: preTournament } = await query(
    `SELECT * FROM pre_tournament_predictions WHERE user_id = $1`,
    [targetId]
  );

  // Pull saved actuals so frontend can render ✓/✗ next to each pick.
  // Empty strings = not yet determined (winner/scorer/etc before tournament end).
  const { rows: actualRows } = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings WHERE key LIKE 'pt_actual_%'`
  );
  const actuals: Record<string, string> = {};
  for (const r of actualRows) actuals[r.key.replace('pt_actual_', '')] = r.value;

  const { rows: matchHistory } = await query(
    `SELECT mp.id, mp.match_id, mp.prediction_result, mp.team_a_goals, mp.team_b_goals,
            mp.first_scorer, mp.goal_difference, mp.is_default, mp.points_earned,
            m.home_team, m.away_team, m.kickoff_time_utc, m.round, m.group_name,
            m.home_score, m.away_score, m.status as match_status, m.first_scorer_team
       FROM match_predictions mp
       JOIN matches m ON mp.match_id = m.id
      WHERE mp.user_id = $1 AND m.status = 'finished'
      ORDER BY m.kickoff_time_utc DESC`,
    [targetId]
  );

  res.json({
    player: { id: player.id, name: player.name, role: player.role },
    score: scoreRows[0] ?? null,
    preTournament: preTournament[0] ?? null,
    preTournamentActuals: actuals,
    matchHistory,
  });
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
          WHERE u2.league_id = $2 AND u2.role != 'admin' AND u2.is_mock = false
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
      WHERE u.league_id = $1 AND u.role != 'admin' AND u.is_mock = false
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

leaderboardRouter.get('/player-stats', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ stats: [] });
    return;
  }
  const { rows } = await query(
    `SELECT
       u.id,
       u.name,
       COALESCE(s.total_points, 0)          AS total_points,
       COALESCE(s.perfect_matches_count, 0) AS perfect_matches_count,
       COALESCE(s.group_stage_points, 0)    AS group_stage_points,
       COALESCE(s.knockout_points, 0)       AS knockout_points,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished')                                     AS total_finished,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND mp.is_default = false)           AS real_predictions,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND mp.is_default = true)            AS defaults_count,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND
         mp.prediction_result = CASE
           WHEN m.home_score > m.away_score THEN 'home'
           WHEN m.home_score < m.away_score THEN 'away'
           ELSE 'draw' END)                                                                   AS correct_results,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND
         mp.team_a_goals = m.home_score AND mp.team_b_goals = m.away_score)                  AS exact_scores,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND
         m.first_scorer_team IS NOT NULL AND
         mp.first_scorer = m.first_scorer_team)                                               AS correct_first_scorers,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND
         m.first_scorer_team IS NOT NULL)                                                     AS total_with_first_scorer,
       COUNT(mp.id) FILTER (WHERE m.status = 'finished' AND
         mp.goal_difference = ABS(m.home_score - m.away_score))                              AS correct_goal_diffs
     FROM users u
     LEFT JOIN scores s ON s.user_id = u.id
     LEFT JOIN match_predictions mp ON mp.user_id = u.id
     LEFT JOIN matches m ON m.id = mp.match_id
     WHERE u.league_id = $1 AND u.role != 'admin' AND u.is_mock = false
     GROUP BY u.id, u.name, s.total_points, s.perfect_matches_count,
              s.group_stage_points, s.knockout_points
     ORDER BY s.total_points DESC NULLS LAST`,
    [leagueId]
  );
  res.json({ stats: rows });
});

leaderboardRouter.get('/rank-history', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) { res.json({ matches: [], players: [] }); return; }

  const { rows } = await query<{
    user_id: number; name: string;
    match_id: number; kickoff_time_utc: string;
    home_team: string; away_team: string;
    cum_points: number;
  }>(
    `WITH mp AS (
       SELECT mp.user_id, m.id AS match_id, m.kickoff_time_utc,
              m.home_team, m.away_team,
              COALESCE(mp.points_earned, 0) AS pts
         FROM match_predictions mp
         JOIN matches m ON m.id = mp.match_id
         JOIN users u ON u.id = mp.user_id
        WHERE u.league_id = $1 AND u.role != 'admin' AND u.is_mock = false
          AND m.status = 'finished' AND mp.points_earned IS NOT NULL
     ),
     cum AS (
       SELECT user_id, match_id, kickoff_time_utc, home_team, away_team,
              SUM(pts) OVER (PARTITION BY user_id ORDER BY kickoff_time_utc, match_id) AS cum_points
         FROM mp
     )
     SELECT cum.user_id, u.name, cum.match_id, cum.kickoff_time_utc,
            cum.home_team, cum.away_team, cum.cum_points
       FROM cum JOIN users u ON u.id = cum.user_id
      ORDER BY cum.kickoff_time_utc, cum.match_id, cum.user_id`,
    [leagueId]
  );

  if (rows.length === 0) { res.json({ matches: [], players: [] }); return; }

  const matchMap = new Map<number, { id: number; label: string; kickoff: string }>();
  for (const row of rows) {
    if (!matchMap.has(row.match_id)) {
      const h = row.home_team.substring(0, 3).toUpperCase();
      const a = row.away_team.substring(0, 3).toUpperCase();
      matchMap.set(row.match_id, { id: row.match_id, label: `${h}-${a}`, kickoff: row.kickoff_time_utc });
    }
  }
  const matches = [...matchMap.values()];

  const playerNames = new Map<number, string>();
  const cumMap = new Map<string, number>();
  for (const row of rows) {
    playerNames.set(row.user_id, row.name);
    cumMap.set(`${row.match_id}:${row.user_id}`, Number(row.cum_points));
  }

  const playerIds = [...playerNames.keys()];
  const players = playerIds.map(uid => ({
    id: uid,
    name: playerNames.get(uid)!,
    ranks: matches.map(m => {
      const pts = cumMap.get(`${m.id}:${uid}`) ?? 0;
      return playerIds.filter(oid => (cumMap.get(`${m.id}:${oid}`) ?? 0) > pts).length + 1;
    }),
  }));

  res.json({ matches, players });
});

leaderboardRouter.get('/tournament-stats', async (_req: Request, res: Response) => {
  const [topScorers, topAssisters] = await Promise.all([
    getTopScorers(5),
    getTopAssisters(5),
  ]);
  res.json({ topScorers, topAssisters });
});

// Returns which league members picked a given player as their pre-tournament
// top scorer or top assister. Gated by the pre-tournament deadline so we don't
// leak picks during the open window. Same-league scoping so users can only
// see their own league's picks.
leaderboardRouter.get('/player-picks', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) { res.json({ picks: [] }); return; }

  const name = String(req.query.name ?? '').trim();
  const kind = String(req.query.kind ?? '');
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  if (kind !== 'scorer' && kind !== 'assister') {
    res.status(400).json({ error: 'kind must be "scorer" or "assister"' });
    return;
  }

  const { rows: deadlineRows } = await query(
    "SELECT value FROM system_settings WHERE key = 'pre_tournament_deadline'"
  );
  const deadline = new Date(String(deadlineRows[0]?.value ?? '2026-06-11T13:00:00Z'));
  if (new Date() < deadline) {
    res.status(403).json({ error: 'Pre-tournament deadline has not passed' });
    return;
  }

  const column = kind === 'scorer' ? 'top_scorer_name' : 'top_assister_name';

  // Fetch all predictions for the league and match in JS.
  // SQL LOWER(TRIM(...)) = LOWER($2) breaks when users spell differently:
  // "Mbappe" vs "Kylian Mbappé", "Ronaldo" vs "Cristiano Ronaldo", etc.
  // normName strips diacritics + lowercases; then we check if every word
  // in the shorter name appears in the longer one (handles partial names).
  const { rows: allRows } = await query<{ id: number; name: string; player: string | null }>(
    `SELECT u.id, u.name, p.${column} AS player
       FROM pre_tournament_predictions p
       JOIN users u ON u.id = p.user_id
      WHERE u.league_id = $1
        AND u.role != 'admin'
      ORDER BY u.name`,
    [leagueId]
  );

  function normName(s: string): string {
    return s.trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics
      .replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  function namesMatch(stored: string, target: string): boolean {
    const a = normName(stored);
    const b = normName(target);
    if (a === b) return true;
    // "mbappe" in "kylian mbappe" or vice-versa: every word of the shorter
    // must appear in the longer (filters out single-letter noise with > 2 chars)
    const partsA = a.split(' ').filter(p => p.length > 2);
    const partsB = b.split(' ').filter(p => p.length > 2);
    const [shorter, longer] = partsA.length <= partsB.length ? [partsA, partsB] : [partsB, partsA];
    return shorter.length > 0 && shorter.every(p => longer.includes(p));
  }
  // Non-Latin script (Hebrew, Arabic, etc.) can't be auto-matched.
  // Return them separately so the admin can see them and decide manually.
  function isNonLatin(s: string): boolean {
    return /[^ -ɏ\s]/.test(s);
  }

  const picks = allRows
    .filter(r => r.player && namesMatch(r.player, name))
    .map(r => ({ id: r.id, name: r.name }));

  const unknownPicks = allRows
    .filter(r => r.player && isNonLatin(r.player) && !namesMatch(r.player, name))
    .map(r => ({ id: r.id, name: r.name, rawPick: r.player }));

  res.json({ picks, unknownPicks });
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
