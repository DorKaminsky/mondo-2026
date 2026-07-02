import axios from 'axios';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

interface PlayerStatRow {
  espn_athlete_id: string;
  full_name: string;
  team_name: string;
  goals: number;
  assists: number;
  matches_played: number;
}

// Per-match delta extracted from ESPN keyEvents
interface PlayerDelta {
  full_name: string;
  team_name: string;
  goals: number;
  assists: number;
  played: boolean;
}

// ESPN summary "leaders" gives per-match shot/pass leaders, not goals/assists.
// The reliable per-match goal/assist data lives in keyEvents:
//   type.type is 'goal' / 'goal---header' / 'goal---free-kick' / 'penalty---scored'
//     etc. — ANY of these count as a player goal
//   type.type is 'own-goal' — EXCLUDED (nobody gets a personal goal for scoring
//     into their own net)
//   participants[0] = scorer, participants[1] (optional) = assister
// We accumulate deltas per match then UPSERT additively. matches_played is
// incremented once per athlete per match (set membership from all key events).
function isGoalEvent(typeKey: string): boolean {
  if (typeKey === 'own-goal') return false;
  if (typeKey.startsWith('goal')) return true;         // 'goal', 'goal---header', ...
  if (typeKey === 'penalty---scored') return true;     // in-play penalties (NOT shootouts)
  return false;
}

export async function syncMatchPlayerStats(espnEventId: string): Promise<void> {
  const { data } = await axios.get(ESPN_SUMMARY, {
    params: { event: espnEventId },
    timeout: 10_000,
  });

  const keyEvents: any[] = data?.keyEvents ?? [];
  if (keyEvents.length === 0) {
    logger.info(`Player stats: ESPN event ${espnEventId} has no keyEvents`);
    return;
  }

  const deltas = new Map<string, PlayerDelta>();
  const ensure = (id: string, name: string, team: string): PlayerDelta => {
    let d = deltas.get(id);
    if (!d) {
      d = { full_name: name, team_name: team, goals: 0, assists: 0, played: false };
      deltas.set(id, d);
    }
    return d;
  };

  for (const e of keyEvents) {
    // Skip shootout events entirely — pens in shootouts don't count for
    // player goal totals (or for scoring predictions).
    if (e?.shootout) continue;

    // Also skip extra-time goals. Predictions are graded on the 90-minute
    // score, and the "top scorer" pre-tournament pick likewise should be
    // graded against regulation-time scoring only. 90 min = 5400 seconds on
    // ESPN's clock (stoppage-time goals get clock.value clamped to 5400
    // and DO count).
    const clk = e?.clock?.value;
    if (typeof clk === 'number' && clk > 5400) continue;

    const teamName: string = e.team?.displayName ?? '';
    const typeKey: string = e.type?.type ?? '';
    const isGoal = isGoalEvent(typeKey);
    const participants: any[] = e.participants ?? [];

    // Mark every athlete who appears in any key event as having played
    for (const p of participants) {
      const a = p?.athlete;
      if (a?.id) ensure(String(a.id), a.fullName ?? a.displayName ?? '', teamName).played = true;
    }

    if (!isGoal || participants.length === 0) continue;
    const scorer = participants[0]?.athlete;
    if (scorer?.id) {
      ensure(String(scorer.id), scorer.fullName ?? scorer.displayName ?? '', teamName).goals += 1;
    }
    const assister = participants[1]?.athlete;
    if (assister?.id) {
      ensure(String(assister.id), assister.fullName ?? assister.displayName ?? '', teamName).assists += 1;
    }
  }

  for (const [id, d] of deltas.entries()) {
    await query(
      `INSERT INTO player_stats
         (espn_athlete_id, full_name, team_name, goals, assists, matches_played, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (espn_athlete_id) DO UPDATE SET
         full_name      = EXCLUDED.full_name,
         team_name      = EXCLUDED.team_name,
         goals          = player_stats.goals          + EXCLUDED.goals,
         assists        = player_stats.assists        + EXCLUDED.assists,
         matches_played = player_stats.matches_played + EXCLUDED.matches_played,
         last_synced_at = NOW()`,
      [id, d.full_name, d.team_name, d.goals, d.assists, d.played ? 1 : 0]
    );
  }

  logger.info(`Player stats: synced ESPN event ${espnEventId} (${deltas.size} athletes)`);
}

// Normalize team names to match ESPN/FIFA aliases.
// Kept in sync with liveScores.ts — duplicated here to keep the module standalone.
const TEAM_ALIASES: Record<string, string> = {
  'united states': 'usa',
  'ivory coast': "côte d'ivoire",
  'south korea': 'korea republic',
  'republic of korea': 'korea republic',
  'iran': 'ir iran',
  'czech republic': 'czechia',
  'cape verde': 'cabo verde',
  'democratic republic of the congo': 'congo dr',
  'dr congo': 'congo dr',
};
function normTeam(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_ALIASES[lower] ?? lower;
}
function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Many finished matches in DB still have FIFA-seeded api_match_ids (400021xxx)
// rather than ESPN ids (760xxx). Walk ESPN's scoreboard per kickoff date, map by
// team name, and overwrite api_match_id. Then sync player stats per match.
export async function backfillAllFinishedMatches(): Promise<void> {
  const { rows: matches } = await query<{
    id: number; api_match_id: string | null;
    home_team: string; away_team: string; kickoff_time_utc: Date;
  }>(
    `SELECT id, api_match_id, home_team, away_team, kickoff_time_utc
       FROM matches
      WHERE status = 'finished'`
  );

  logger.info(`Player stats backfill: ${matches.length} finished matches`);

  // Counters are additive in syncMatchPlayerStats; reset before backfill so
  // re-running this endpoint doesn't double-count goals/assists.
  await query('DELETE FROM player_stats');

  // Group matches by kickoff date so we fetch each ESPN scoreboard only once.
  // ESPN groups events by US local date, so a 01:00 UTC kickoff on June 17
  // lives under dates=20260616. Fetch BOTH the kickoff-date and the day before,
  // then match by team-name regardless of which bucket the event landed in.
  const byDate = new Map<string, typeof matches>();
  for (const m of matches) {
    const date = yyyymmdd(new Date(m.kickoff_time_utc));
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(m);
  }

  // Fetch each date and date-1 once, cache the events
  const eventsByDate = new Map<string, any[]>();
  const datesNeeded = new Set<string>();
  for (const date of byDate.keys()) {
    datesNeeded.add(date);
    const prev = new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    datesNeeded.add(yyyymmdd(prev));
  }
  for (const date of datesNeeded) {
    try {
      const { data } = await axios.get(`${ESPN_SCOREBOARD}?dates=${date}`, { timeout: 10_000 });
      eventsByDate.set(date, data?.events ?? []);
    } catch (err) {
      logger.warn(`Player stats backfill: ESPN scoreboard fetch failed for ${date}`, { err });
      eventsByDate.set(date, []);
    }
  }

  for (const [date, dayMatches] of byDate.entries()) {
    const prev = new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const events = [...(eventsByDate.get(date) ?? []), ...(eventsByDate.get(yyyymmdd(prev)) ?? [])];

    for (const m of dayMatches) {
      const matched = events.find((e: any) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName ?? '';
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName ?? '';
        return normTeam(home) === normTeam(m.home_team) && normTeam(away) === normTeam(m.away_team);
      });
      if (!matched) {
        logger.warn(`Player stats backfill: no ESPN event for match ${m.id} (${m.home_team} vs ${m.away_team}) on ${date}`);
        continue;
      }
      const espnId = String(matched.id);
      if (m.api_match_id !== espnId) {
        await query('UPDATE matches SET api_match_id = $1 WHERE id = $2', [espnId, m.id]);
        logger.info(`Player stats backfill: mapped match ${m.id} → ESPN ${espnId}`);
      }
      try {
        await syncMatchPlayerStats(espnId);
      } catch (err) {
        logger.warn(`Player stats backfill: sync failed for match ${m.id} (ESPN ${espnId})`, { err });
      }
    }
  }

  logger.info('Player stats backfill: complete');
}

export async function getTopScorers(limit = 5): Promise<PlayerStatRow[]> {
  const { rows } = await query<PlayerStatRow>(
    `WITH ranked AS (
       SELECT *, RANK() OVER (ORDER BY goals DESC) AS rnk
       FROM player_stats
       WHERE goals > 0
     )
     SELECT espn_athlete_id, full_name, team_name, goals, assists, matches_played
     FROM ranked
     WHERE rnk <= $1
     ORDER BY goals DESC, assists DESC, full_name ASC`,
    [limit]
  );
  return rows;
}

export async function getTopAssisters(limit = 5): Promise<PlayerStatRow[]> {
  const { rows } = await query<PlayerStatRow>(
    `WITH ranked AS (
       SELECT *, RANK() OVER (ORDER BY assists DESC) AS rnk
       FROM player_stats
       WHERE assists > 0
     )
     SELECT espn_athlete_id, full_name, team_name, goals, assists, matches_played
     FROM ranked
     WHERE rnk <= $1
     ORDER BY assists DESC, goals DESC, full_name ASC`,
    [limit]
  );
  return rows;
}
