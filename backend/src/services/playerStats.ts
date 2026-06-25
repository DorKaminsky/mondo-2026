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

export async function backfillAllFinishedMatches(): Promise<void> {
  const { rows } = await query<{ api_match_id: string }>(
    `SELECT api_match_id FROM matches
     WHERE status = 'finished' AND api_match_id IS NOT NULL`
  );

  logger.info(`Player stats backfill: ${rows.length} finished matches`);
  for (const { api_match_id } of rows) {
    try {
      await syncMatchPlayerStats(api_match_id);
    } catch (err) {
      logger.warn(`Player stats backfill: failed for ESPN event ${api_match_id}`, { err });
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
