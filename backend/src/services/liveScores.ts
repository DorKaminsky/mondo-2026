import axios from 'axios';
import { query } from '../db/pool';
import { calculateMatchScores } from './scoring';
import { logger } from '../utils/logger';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

function mapEspnStatus(name: string): 'scheduled' | 'live' | 'finished' {
  if (name === 'STATUS_FINAL' || name === 'STATUS_FULL_TIME') return 'finished';
  if (
    name === 'STATUS_IN_PROGRESS' ||
    name === 'STATUS_HALFTIME' ||
    name === 'STATUS_END_PERIOD'
  ) return 'live';
  return 'scheduled';
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function syncLiveScores(): Promise<void> {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const allEvents: any[] = [];
  for (const date of [yyyymmdd(yesterday), yyyymmdd(today)]) {
    try {
      const { data } = await axios.get(`${ESPN_BASE}?dates=${date}`, { timeout: 10_000 });
      allEvents.push(...(data?.events ?? []));
    } catch (err) {
      logger.warn(`ESPN scoreboard fetch failed for ${date}`, { err });
    }
  }

  for (const event of allEvents) {
    const espnId = String(event.id);
    const statusName: string = event.status?.type?.name ?? 'STATUS_SCHEDULED';
    const newStatus = mapEspnStatus(statusName);

    if (newStatus === 'scheduled') continue;

    const competition = event.competitions?.[0];
    if (!competition) continue;

    const homeComp = competition.competitors?.find((c: any) => c.homeAway === 'home');
    const awayComp = competition.competitors?.find((c: any) => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeScore = homeComp.score != null ? parseInt(homeComp.score, 10) : 0;
    const awayScore = awayComp.score != null ? parseInt(awayComp.score, 10) : 0;

    let firstScorerTeam: 'home' | 'away' | 'none' = 'none';
    const details: any[] = competition.details ?? [];
    const firstGoal = details.find((d: any) => d.type?.text === 'Goal' && d.scoringPlay === true);
    if (firstGoal) {
      firstScorerTeam = firstGoal.team?.id === homeComp.team?.id ? 'home' : 'away';
    }

    let { rows } = await query<{
      id: number; status: string; home_score: number | null;
      away_score: number | null; first_scorer_team: string | null;
    }>(
      'SELECT id, status, home_score, away_score, first_scorer_team FROM matches WHERE api_match_id = $1',
      [espnId]
    );

    // Fallback: match by team name + kickoff date when api_match_id isn't seeded yet.
    // Self-heals by writing the ESPN ID so future syncs skip this path.
    if (rows.length === 0) {
      const homeName: string = homeComp.team?.displayName ?? '';
      const awayName: string = awayComp.team?.displayName ?? '';
      const eventDate: string = (event.date ?? '').slice(0, 10); // YYYY-MM-DD
      if (homeName && awayName && eventDate) {
        const fallback = await query<{
          id: number; status: string; home_score: number | null;
          away_score: number | null; first_scorer_team: string | null;
        }>(
          `SELECT id, status, home_score, away_score, first_scorer_team
           FROM matches
           WHERE api_match_id IS NULL
             AND home_team ILIKE $1 AND away_team ILIKE $2
             AND DATE(kickoff_time_utc) BETWEEN ($3::date - interval '1 day') AND ($3::date + interval '1 day')
           LIMIT 1`,
          [homeName, awayName, eventDate]
        );
        if (fallback.rows.length > 0) {
          await query('UPDATE matches SET api_match_id = $1 WHERE id = $2', [espnId, fallback.rows[0].id]);
          rows = fallback.rows;
          logger.info(`Live sync: mapped ESPN ${espnId} (${homeName} vs ${awayName}) → match ${fallback.rows[0].id} by name`);
        }
      }
    }

    if (rows.length === 0) continue;
    const match = rows[0];

    // Don't overwrite admin-entered final results — but if ESPN still says
    // the match is live, the admin marked it finished too early, so keep syncing.
    if (match.status === 'finished' && newStatus === 'finished') continue;

    const unchanged =
      match.status === newStatus &&
      match.home_score === homeScore &&
      match.away_score === awayScore &&
      match.first_scorer_team === firstScorerTeam;
    if (unchanged) continue;

    await query(
      `UPDATE matches SET home_score=$1, away_score=$2, first_scorer_team=$3,
       status=$4, last_updated=NOW() WHERE id=$5`,
      [homeScore, awayScore, firstScorerTeam, newStatus, match.id]
    );

    logger.info(`Live sync: match ${match.id} → ${newStatus} (${homeScore}–${awayScore})`);

    if (newStatus === 'finished') {
      await calculateMatchScores(match.id);
      logger.info(`Live sync: scored match ${match.id}`);
    }
  }
}
