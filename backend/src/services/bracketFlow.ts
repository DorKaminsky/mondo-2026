import { query } from '../db/pool';
import { logger } from '../utils/logger';

// FIFA WC2026 knockout bracket flow. When a match finishes we know its
// winner (and, for SFs, its loser for the 3rd-place playoff). Map the
// source match_number → destination slot.
//
// Source of truth: FIFA's official bracket. Note this DIFFERS from the
// naive seed-file convention where W91+W92 → 98; the real bracket pairs
// them differently on the tree. Confirmed against the reference bracket
// (see BracketPage.tsx BRACKET constant).
type SlotSide = 'home' | 'away';
interface Flow { toMatch: number; slot: SlotSide }
// key = source match_number, value = where the WINNER goes
const WINNER_FLOWS: Record<number, Flow> = {
  // R16 → QF
  89: { toMatch: 97, slot: 'home' },
  90: { toMatch: 97, slot: 'away' },
  93: { toMatch: 98, slot: 'home' },
  94: { toMatch: 98, slot: 'away' },
  91: { toMatch: 99, slot: 'home' },
  92: { toMatch: 99, slot: 'away' },
  95: { toMatch: 100, slot: 'home' },
  96: { toMatch: 100, slot: 'away' },
  // QF → SF
  97: { toMatch: 101, slot: 'home' },
  98: { toMatch: 101, slot: 'away' },
  99: { toMatch: 102, slot: 'home' },
  100: { toMatch: 102, slot: 'away' },
  // SF → Final
  101: { toMatch: 104, slot: 'home' },
  102: { toMatch: 104, slot: 'away' },
};
// SF losers → 3rd-place match
const LOSER_FLOWS: Record<number, Flow> = {
  101: { toMatch: 103, slot: 'home' },
  102: { toMatch: 103, slot: 'away' },
};

// Determine the winning + losing team of a finished match using the 90-min
// score (regulation) first, then falling back to shootout, then to full-time
// (post-ET). Predictions grade on regulation but bracket advancement uses
// the actual competition winner — so this function uses the FIFA rule:
// shootout wins if pens happened; else full-time; else regulation.
async function getMatchOutcome(matchId: number): Promise<{ winner: string; loser: string } | null> {
  const { rows } = await query<{
    home_team: string; away_team: string;
    home_score: number | null; away_score: number | null;
    home_score_full_time: number | null; away_score_full_time: number | null;
    home_shootout_score: number | null; away_shootout_score: number | null;
    status: string;
  }>(
    `SELECT home_team, away_team, home_score, away_score,
            home_score_full_time, away_score_full_time,
            home_shootout_score, away_shootout_score, status
       FROM matches WHERE id = $1`,
    [matchId]
  );
  if (rows.length === 0) return null;
  const m = rows[0];
  if (m.status !== 'finished') return null;
  if (m.home_team.startsWith('TBD') || m.away_team.startsWith('TBD')) return null;

  // Priority: shootout > full-time > regulation
  let homeWon: boolean | null = null;
  if (m.home_shootout_score != null && m.away_shootout_score != null) {
    homeWon = m.home_shootout_score > m.away_shootout_score;
  } else if (m.home_score_full_time != null && m.away_score_full_time != null && m.home_score_full_time !== m.away_score_full_time) {
    homeWon = m.home_score_full_time > m.away_score_full_time;
  } else if (m.home_score != null && m.away_score != null && m.home_score !== m.away_score) {
    homeWon = m.home_score > m.away_score;
  }
  if (homeWon === null) {
    // Draw with no shootout data — shouldn't happen in knockouts. Skip.
    logger.warn(`Bracket flow: cannot determine winner of match ${matchId} (draw with no shootout)`);
    return null;
  }
  return {
    winner: homeWon ? m.home_team : m.away_team,
    loser:  homeWon ? m.away_team : m.home_team,
  };
}

// Called after a knockout match's status transitions to 'finished'.
// Populates the winner (and 3rd-place slot for SFs) into the next-round
// match, but ONLY overwrites TBD slots — never clobbers a manually-set
// team name.
export async function flowKnockoutOutcome(sourceMatchNumber: number): Promise<void> {
  const wFlow = WINNER_FLOWS[sourceMatchNumber];
  const lFlow = LOSER_FLOWS[sourceMatchNumber];
  if (!wFlow && !lFlow) return;

  // Look up source match by match_number to keep IDs decoupled from the
  // knockout tree (defensive against future re-seeding).
  const { rows: src } = await query<{ id: number; round: string }>(
    `SELECT id, round FROM matches WHERE match_number = $1`,
    [sourceMatchNumber]
  );
  if (src.length === 0) return;

  const outcome = await getMatchOutcome(src[0].id);
  if (!outcome) return;

  const writeSlot = async (mnum: number, slot: SlotSide, team: string) => {
    const col = slot === 'home' ? 'home_team' : 'away_team';
    const r = await query(
      `UPDATE matches SET ${col} = $1
         WHERE match_number = $2 AND ${col} LIKE 'TBD%'`,
      [team, mnum]
    );
    if (r.rowCount === 1) {
      logger.info(`Bracket flow: match#${sourceMatchNumber} → match#${mnum}.${slot} = ${team}`);
    }
  };

  if (wFlow) await writeSlot(wFlow.toMatch, wFlow.slot, outcome.winner);
  if (lFlow) await writeSlot(lFlow.toMatch, lFlow.slot, outcome.loser);
}

// Backfill all finished knockout matches — safe to run any time. Only
// updates TBD slots so re-running is a no-op.
export async function backfillBracketFlow(): Promise<void> {
  const { rows } = await query<{ match_number: number }>(
    `SELECT match_number FROM matches
      WHERE status = 'finished' AND round != 'group'
      ORDER BY match_number`
  );
  for (const r of rows) {
    await flowKnockoutOutcome(r.match_number);
  }
}
