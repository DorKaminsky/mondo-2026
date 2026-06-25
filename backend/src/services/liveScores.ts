import axios from 'axios';
import { query } from '../db/pool';
import { calculateMatchScores } from './scoring';
import { syncMatchPlayerStats } from './playerStats';
import { logger } from '../utils/logger';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

function mapEspnStatus(name: string): 'scheduled' | 'live' | 'finished' {
  if ([
    'STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN',
  ].includes(name)) return 'finished';
  if ([
    'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD',
    'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_EXTRA_TIME',
    'STATUS_OVERTIME', 'STATUS_PENALTY',
  ].includes(name)) return 'live';
  return 'scheduled';
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Normalize team names to handle ESPN/FIFA aliases
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
  'bosnia-herzegovina': 'bosnia and herzegovina',
  'bosnia & herzegovina': 'bosnia and herzegovina',
};
function normTeam(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_ALIASES[lower] ?? lower;
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

  const liveOrFinished = allEvents.filter(e => mapEspnStatus(e.status?.type?.name ?? '') !== 'scheduled');
  logger.info(`Live sync: ESPN returned ${allEvents.length} events, ${liveOrFinished.length} live/finished`);

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

    // Fallback: match by team name + kickoff date.
    // The DB was seeded with FIFA API IDs (400021xxx) but ESPN uses different IDs (760xxx),
    // so the primary lookup always misses. We fetch all matches for the date and do
    // name normalization in JS to handle aliases ("United States"→"USA", etc.).
    // Self-heals by overwriting the old FIFA ID with the correct ESPN ID.
    if (rows.length === 0) {
      const homeName: string = homeComp.team?.displayName ?? '';
      const awayName: string = awayComp.team?.displayName ?? '';
      const eventDate: string = (event.date ?? '').slice(0, 10); // YYYY-MM-DD
      if (homeName && awayName && eventDate) {
        const dateMatches = await query<{
          id: number; status: string; home_score: number | null;
          away_score: number | null; first_scorer_team: string | null;
          home_team: string; away_team: string;
        }>(
          `SELECT id, status, home_score, away_score, first_scorer_team, home_team, away_team
           FROM matches
           WHERE DATE(kickoff_time_utc) BETWEEN ($1::date - interval '1 day') AND ($1::date + interval '1 day')`,
          [eventDate]
        );
        const matched = dateMatches.rows.find(m =>
          normTeam(m.home_team) === normTeam(homeName) &&
          normTeam(m.away_team) === normTeam(awayName)
        );
        if (matched) {
          await query('UPDATE matches SET api_match_id = $1 WHERE id = $2', [espnId, matched.id]);
          rows = [matched];
          logger.info(`Live sync: mapped ESPN ${espnId} (${homeName} vs ${awayName}) → match ${matched.id} by name`);
        }
      }
    }

    if (rows.length === 0) {
      const hName = homeComp.team?.displayName ?? '?';
      const aName = awayComp.team?.displayName ?? '?';
      logger.warn(`Live sync: no DB match for ESPN ${espnId} "${hName} vs ${aName}" (${newStatus})`);
      continue;
    }
    const match = rows[0];

    // Once a match is finished in the DB, don't let the cron overwrite it.
    // This protects manual admin corrections to score/first_scorer_team after the whistle.
    // The live→finished transition is handled on the first finished cron run below.
    if (match.status === 'finished' && newStatus === 'finished') continue;

    // Determine first_scorer_team using "set once, never change" logic:
    // Once we know who scored first, lock it in for the rest of the game.
    // Primary: use ESPN play-by-play when available (most accurate).
    // Fallback: infer from score — if someone is leading it means they scored first
    //   (only works when score isn't tied; 1-1 at first poll = can't tell).
    // If already set in DB, never overwrite it.
    const espnHasGoals = details.some((d: any) => d.scoringPlay === true);
    let effectiveFirstScorer: string = match.first_scorer_team ?? 'none';
    if (effectiveFirstScorer === 'none') {
      if (espnHasGoals) {
        effectiveFirstScorer = firstScorerTeam;
      } else if (homeScore > awayScore) {
        effectiveFirstScorer = 'home';
      } else if (awayScore > homeScore) {
        effectiveFirstScorer = 'away';
      }
      // If 0-0 or tied (1-1 etc.) and no ESPN goal data: leave as 'none'
    }

    const unchanged =
      match.status === newStatus &&
      match.home_score === homeScore &&
      match.away_score === awayScore &&
      (match.first_scorer_team ?? 'none') === effectiveFirstScorer;
    if (unchanged) continue;

    await query(
      `UPDATE matches SET home_score=$1, away_score=$2, first_scorer_team=$3,
       status=$4, last_updated=NOW() WHERE id=$5`,
      [homeScore, awayScore, effectiveFirstScorer, newStatus, match.id]
    );

    logger.info(`Live sync: match ${match.id} → ${newStatus} (${homeScore}–${awayScore}, first=${effectiveFirstScorer})`);

    if (newStatus === 'finished') {
      await calculateMatchScores(match.id);
      logger.info(`Live sync: scored match ${match.id}`);
      if (espnId) {
        try {
          await syncMatchPlayerStats(espnId);
        } catch (err) {
          logger.warn(`Live sync: player stats failed for match ${match.id}`, { err });
        }
      }
    }
  }
}
