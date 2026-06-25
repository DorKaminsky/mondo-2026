import axios from 'axios';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

// ESPN shortDisplayValue format: "M: 2, G: 1: A: 0"
const STAT_RE = /M:\s*(\d+)[,\s]+G:\s*(\d+)[:\s]+A:\s*(\d+)/i;

interface PlayerStatRow {
  espn_athlete_id: string;
  full_name: string;
  team_name: string;
  goals: number;
  assists: number;
  matches_played: number;
}

export async function syncMatchPlayerStats(espnEventId: string): Promise<void> {
  const { data } = await axios.get(ESPN_SUMMARY, {
    params: { event: espnEventId },
    timeout: 10_000,
  });

  const leaders: any[] = data?.leaders ?? [];
  if (leaders.length === 0) return;

  for (const teamLeader of leaders) {
    const teamName: string = teamLeader?.team?.displayName ?? '';
    const athleteGroups: any[] = teamLeader?.leaders ?? [];

    // Each group (goalsLeaders, etc.) contains athletes — dedupe by athlete id
    const seen = new Set<string>();
    for (const group of athleteGroups) {
      for (const entry of group?.leaders ?? []) {
        const athlete = entry?.athlete;
        if (!athlete?.id) continue;
        if (seen.has(athlete.id)) continue;
        seen.add(athlete.id);

        const match = STAT_RE.exec(entry.shortDisplayValue ?? '');
        if (!match) continue;

        const matches_played = parseInt(match[1], 10);
        const goals          = parseInt(match[2], 10);
        const assists        = parseInt(match[3], 10);

        // ESPN returns cumulative tournament totals — overwrite, don't increment
        await query(
          `INSERT INTO player_stats
             (espn_athlete_id, full_name, team_name, goals, assists, matches_played, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (espn_athlete_id) DO UPDATE SET
             full_name      = EXCLUDED.full_name,
             team_name      = EXCLUDED.team_name,
             goals          = EXCLUDED.goals,
             assists        = EXCLUDED.assists,
             matches_played = EXCLUDED.matches_played,
             last_synced_at = NOW()`,
          [athlete.id, athlete.fullName ?? athlete.displayName ?? '', teamName, goals, assists, matches_played]
        );
      }
    }
  }

  logger.info(`Player stats: synced ESPN event ${espnEventId}`);
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

  // Group matches by kickoff date so we fetch each ESPN scoreboard only once
  const byDate = new Map<string, typeof matches>();
  for (const m of matches) {
    const date = yyyymmdd(new Date(m.kickoff_time_utc));
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(m);
  }

  for (const [date, dayMatches] of byDate.entries()) {
    let events: any[] = [];
    try {
      const { data } = await axios.get(`${ESPN_SCOREBOARD}?dates=${date}`, { timeout: 10_000 });
      events = data?.events ?? [];
    } catch (err) {
      logger.warn(`Player stats backfill: ESPN scoreboard fetch failed for ${date}`, { err });
      continue;
    }

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
