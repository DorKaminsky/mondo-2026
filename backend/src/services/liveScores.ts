import axios from 'axios';
import { query } from '../db/pool';
import { calculateMatchScores } from './scoring';
import { syncMatchPlayerStats } from './playerStats';
import { flowKnockoutOutcome } from './bracketFlow';
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
  'cabo verde': 'cape verde',          // ESPN uses "Cabo Verde", DB has "Cape Verde"
  'democratic republic of the congo': 'congo dr',
  'dr congo': 'congo dr',
  'congo, dr': 'congo dr',
  'bosnia-herzegovina': 'bosnia and herzegovina',
  'bosnia & herzegovina': 'bosnia and herzegovina',
};
function normTeam(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_ALIASES[lower] ?? lower;
}

// 90 minutes in seconds, per ESPN's play-by-play clock. Goals with
// clock.value > 5400 are extra-time / shootout events that should not
// count toward the regulation score we use for grading predictions.
const REGULATION_END_SECONDS = 5400;

// Reconstruct the 90-minute score from the play-by-play. Only used when the
// match went to ET or pens — for normal full-time finishes the top-level
// `score` field already IS the regulation score, no reconstruction needed.
// Returns null when we can't reliably reconstruct (e.g. play-by-play missing
// or incomplete); caller should fall back to the top-level score in that case.
function reconstructRegulationScore(
  details: any[],
  homeTeamId: string,
  awayTeamId: string,
): { home: number; away: number } | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  let home = 0;
  let away = 0;
  for (const ev of details) {
    if (!ev?.scoringPlay) continue;
    if (ev.shootout) continue; // pens never count
    const clk = ev?.clock?.value;
    if (typeof clk !== 'number') continue;
    if (clk > REGULATION_END_SECONDS) continue; // ET goals don't count
    const teamId = String(ev?.team?.id ?? '');
    if (teamId === String(homeTeamId)) home++;
    else if (teamId === String(awayTeamId)) away++;
  }
  return { home, away };
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

    // ESPN's top-level `score` is the regulation score for normal finishes,
    // but the END-OF-EXTRA-TIME score for matches that go to ET/pens.
    // Predictions are graded against the 90-min score, so we reconstruct it
    // from the play-by-play for STATUS_FINAL_AET / STATUS_FINAL_PEN.
    const espnHomeScore = homeComp.score != null ? parseInt(homeComp.score, 10) : 0;
    const espnAwayScore = awayComp.score != null ? parseInt(awayComp.score, 10) : 0;
    const details: any[] = competition.details ?? [];

    const wentToET = statusName === 'STATUS_FINAL_AET' || statusName === 'STATUS_FINAL_PEN';
    let homeScore = espnHomeScore;
    let awayScore = espnAwayScore;
    let homeScoreFullTime: number | null = null;
    let awayScoreFullTime: number | null = null;
    let homeShootoutScore: number | null = null;
    let awayShootoutScore: number | null = null;

    if (wentToET) {
      // espnHomeScore/espnAwayScore here are the post-ET score.
      homeScoreFullTime = espnHomeScore;
      awayScoreFullTime = espnAwayScore;
      const reg = reconstructRegulationScore(
        details, homeComp.team?.id ?? '', awayComp.team?.id ?? ''
      );
      if (reg) {
        homeScore = reg.home;
        awayScore = reg.away;
      } else {
        logger.warn(
          `Live sync: ${statusName} but could not reconstruct 90-min score from play-by-play for ESPN ${espnId}; falling back to post-ET score`
        );
      }
      if (statusName === 'STATUS_FINAL_PEN') {
        const hShoot = homeComp.shootoutScore;
        const aShoot = awayComp.shootoutScore;
        if (typeof hShoot === 'number') homeShootoutScore = hShoot;
        if (typeof aShoot === 'number') awayShootoutScore = aShoot;
      }
    }

    // First-scorer: only count goals scored in regulation (≤ 90'). If 0-0
    // at the whistle and someone scored only in ET, first_scorer stays
    // 'none' per the rule that predictions are for the 90-min outcome.
    let firstScorerTeam: 'home' | 'away' | 'none' = 'none';
    const firstRegulationGoal = details.find((d: any) =>
      d?.scoringPlay === true &&
      !d?.shootout &&
      typeof d?.clock?.value === 'number' &&
      d.clock.value <= REGULATION_END_SECONDS
    );
    if (firstRegulationGoal) {
      firstScorerTeam = firstRegulationGoal.team?.id === homeComp.team?.id ? 'home' : 'away';
    }

    let { rows } = await query<{
      id: number; status: string; home_score: number | null;
      away_score: number | null; first_scorer_team: string | null;
      home_score_full_time: number | null; away_score_full_time: number | null;
      home_shootout_score: number | null; away_shootout_score: number | null;
    }>(
      'SELECT id, status, home_score, away_score, first_scorer_team, home_score_full_time, away_score_full_time, home_shootout_score, away_shootout_score FROM matches WHERE api_match_id = $1',
      [espnId]
    );

    // Fallback: match by team name + kickoff date.
    // The DB was seeded with FIFA API IDs (400021xxx) but ESPN uses different IDs (760xxx),
    // so the primary lookup always misses. We fetch all matches for the date and do
    // name normalization in JS to handle aliases ("United States"→"USA", etc.).
    // Self-heals by overwriting the old FIFA ID with the correct ESPN ID.
    // ESPN also sometimes lists home/away in the opposite order from our DB seeding
    // (e.g. ESPN "France vs Sweden" but DB "Sweden vs France"). We try both orderings
    // and set teamsSwapped=true so scores/first_scorer get flipped before writing.
    let teamsSwapped = false;
    if (rows.length === 0) {
      const homeName: string = homeComp.team?.displayName ?? '';
      const awayName: string = awayComp.team?.displayName ?? '';
      const eventDate: string = (event.date ?? '').slice(0, 10); // YYYY-MM-DD
      if (homeName && awayName && eventDate) {
        const dateMatches = await query<{
          id: number; status: string; home_score: number | null;
          away_score: number | null; first_scorer_team: string | null;
          home_score_full_time: number | null; away_score_full_time: number | null;
          home_shootout_score: number | null; away_shootout_score: number | null;
          home_team: string; away_team: string;
        }>(
          `SELECT id, status, home_score, away_score, first_scorer_team,
                  home_score_full_time, away_score_full_time,
                  home_shootout_score, away_shootout_score,
                  home_team, away_team
           FROM matches
           WHERE DATE(kickoff_time_utc) BETWEEN ($1::date - interval '1 day') AND ($1::date + interval '1 day')`,
          [eventDate]
        );
        let matched = dateMatches.rows.find(m =>
          normTeam(m.home_team) === normTeam(homeName) &&
          normTeam(m.away_team) === normTeam(awayName)
        );
        if (!matched) {
          const swappedMatch = dateMatches.rows.find(m =>
            normTeam(m.home_team) === normTeam(awayName) &&
            normTeam(m.away_team) === normTeam(homeName)
          );
          if (swappedMatch) { matched = swappedMatch; teamsSwapped = true; }
        }
        if (matched) {
          await query('UPDATE matches SET api_match_id = $1 WHERE id = $2', [espnId, matched.id]);
          rows = [matched];
          logger.info(`Live sync: mapped ESPN ${espnId} (${homeName} vs ${awayName}) → match ${matched.id} by name${teamsSwapped ? ' [home/away swapped]' : ''}`);
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

    // When ESPN lists teams in the opposite home/away order from our DB, flip all
    // the score values so they align with how the DB stores this match.
    if (teamsSwapped) {
      [homeScore, awayScore] = [awayScore, homeScore];
      [homeScoreFullTime, awayScoreFullTime] = [awayScoreFullTime, homeScoreFullTime];
      [homeShootoutScore, awayShootoutScore] = [awayShootoutScore, homeShootoutScore];
      firstScorerTeam = firstScorerTeam === 'home' ? 'away' : firstScorerTeam === 'away' ? 'home' : 'none';
    }

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
      match.home_score_full_time === homeScoreFullTime &&
      match.away_score_full_time === awayScoreFullTime &&
      match.home_shootout_score === homeShootoutScore &&
      match.away_shootout_score === awayShootoutScore &&
      (match.first_scorer_team ?? 'none') === effectiveFirstScorer;
    if (unchanged) continue;

    await query(
      `UPDATE matches SET
         home_score=$1, away_score=$2, first_scorer_team=$3, status=$4,
         home_score_full_time=$5, away_score_full_time=$6,
         home_shootout_score=$7, away_shootout_score=$8,
         last_updated=NOW()
       WHERE id=$9`,
      [homeScore, awayScore, effectiveFirstScorer, newStatus,
       homeScoreFullTime, awayScoreFullTime,
       homeShootoutScore, awayShootoutScore, match.id]
    );

    const etSuffix = wentToET
      ? ` (FT: ${homeScoreFullTime}–${awayScoreFullTime}${homeShootoutScore !== null ? `, pens ${homeShootoutScore}–${awayShootoutScore}` : ''})`
      : '';
    logger.info(`Live sync: match ${match.id} → ${newStatus} (${homeScore}–${awayScore}, first=${effectiveFirstScorer})${etSuffix}`);

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
      // Flow the knockout outcome into the next round (winner → QF/SF/Final,
      // SF losers → 3rd-place). Safe on group matches: bracketFlow only
      // knows about knockout match_numbers and no-ops on unknowns.
      try {
        const { rows: mrow } = await query<{ match_number: number }>(
          'SELECT match_number FROM matches WHERE id = $1',
          [match.id]
        );
        if (mrow[0]) await flowKnockoutOutcome(mrow[0].match_number);
      } catch (err) {
        logger.warn(`Live sync: bracket flow failed for match ${match.id}`, { err });
      }
    }
  }
}
