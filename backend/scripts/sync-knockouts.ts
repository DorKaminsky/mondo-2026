#!/usr/bin/env node
/**
 * sync-knockouts: Helper for populating knockout-stage matches in the DB
 * once FIFA has confirmed the teams.
 *
 * Workflow:
 *   1. Fetches ESPN scoreboard for the given date(s).
 *   2. Matches each ESPN event to a DB row by `kickoff_time_utc` (exact match).
 *   3. Reports what would change — DRY RUN BY DEFAULT.
 *   4. Pass --apply to actually run the UPDATEs.
 *
 * Safety:
 *   - Only updates rows where current home_team starts with 'TBD'.
 *   - Never touches kickoff_time, status, or score columns.
 *   - Skips ESPN events whose opponent name contains 'TBD' / '3rd' / 'RD' / 'W'+digit
 *     (i.e. placeholders, not real teams).
 *
 * Usage (from backend/ dir):
 *   npx tsx scripts/sync-knockouts.ts 20260628                  # dry run for Jun 28
 *   npx tsx scripts/sync-knockouts.ts 20260628 20260629 --apply # apply for 2 days
 *   npx tsx scripts/sync-knockouts.ts 20260628-20260702         # date range
 */
import 'dotenv/config';
import axios from 'axios';
import { Pool } from 'pg';

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

interface EspnTeam { displayName: string; homeAway?: string; }
interface EspnEvent {
  date: string;
  competitions: Array<{
    competitors: Array<{ team: EspnTeam; homeAway: string }>;
    venue: { fullName: string };
  }>;
}

interface DbMatch {
  id: number;
  match_number: number;
  round: string;
  home_team: string;
  away_team: string;
  kickoff_time_utc: Date;
}

function isPlaceholder(name: string): boolean {
  if (!name) return true;
  // Short codes: TBD, RD32, 3RD, W12, L7, 1A, 2B, 3rd-XYZ
  if (/TBD|^RD\d|^3RD|^W\d|^L\d|^1[A-L]$|^2[A-L]$|^3rd-/i.test(name)) return true;
  // ESPN sometimes uses verbose placeholders like:
  //   "Third Place Group C/E/F/H/I"
  //   "Group L Winner" / "Group J 2nd Place" / "Group K 2nd Place"
  //   "Round of 32 1 Winner" / "Round of 16 5 Winner" / "Quarter-final ..."
  if (/Third Place|Group [A-L] (Winner|2nd Place|Runner|Runners?-?up)/i.test(name)) return true;
  if (/Round of \d+|Quarter-?final|Semi-?final/i.test(name)) return true;
  return false;
}

async function fetchEspnDates(dates: string): Promise<EspnEvent[]> {
  const { data } = await axios.get(ESPN_URL, { params: { dates } });
  return data?.events ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dateArgs = args.filter(a => a !== '--apply');
  if (dateArgs.length === 0) {
    console.error('Usage: sync-knockouts <YYYYMMDD> [YYYYMMDD ...] [--apply]');
    console.error('   or: sync-knockouts <YYYYMMDD-YYYYMMDD> [--apply]');
    process.exit(1);
  }

  const datesQuery = dateArgs.length === 1 ? dateArgs[0] : dateArgs.join(',');
  console.log(`Fetching ESPN scoreboard for ${datesQuery}…`);
  const events = await fetchEspnDates(datesQuery);
  console.log(`ESPN returned ${events.length} events.\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  type Plan = { id: number; matchNumber: number; oldHome: string; oldAway: string; newHome: string; newAway: string; venue: string };
  const plan: Plan[] = [];
  const skipped: string[] = [];

  for (const e of events) {
    const comp = e.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home') ?? comp.competitors[0];
    const away = comp.competitors.find(c => c.homeAway === 'away') ?? comp.competitors[1];
    const homeName = home.team.displayName;
    const awayName = away.team.displayName;

    if (isPlaceholder(homeName) || isPlaceholder(awayName)) {
      skipped.push(`  ⏳ ${e.date}  ${homeName} vs ${awayName}  (placeholder — opponent not yet confirmed)`);
      continue;
    }

    const { rows } = await pool.query<DbMatch>(
      `SELECT id, match_number, round, home_team, away_team, kickoff_time_utc
         FROM matches
        WHERE kickoff_time_utc = $1
          AND round != 'group'`,
      [e.date]
    );

    if (rows.length === 0) {
      skipped.push(`  ⚠️ ${e.date}  ${homeName} vs ${awayName}  (no DB row at this kickoff time)`);
      continue;
    }
    if (rows.length > 1) {
      skipped.push(`  ⚠️ ${e.date}  multiple DB rows at this kickoff time — manual review needed`);
      continue;
    }

    const row = rows[0];
    if (!row.home_team.startsWith('TBD') && !row.away_team.startsWith('TBD')) {
      skipped.push(`  ✅ ${e.date}  ${row.home_team} vs ${row.away_team}  (already populated; not overwriting)`);
      continue;
    }

    plan.push({
      id: row.id,
      matchNumber: row.match_number,
      oldHome: row.home_team,
      oldAway: row.away_team,
      newHome: homeName,
      newAway: awayName,
      venue: comp.venue.fullName,
    });
  }

  if (plan.length === 0) {
    console.log('Nothing to update.');
  } else {
    console.log(apply ? '=== APPLYING UPDATES ===' : '=== DRY RUN ===');
    for (const p of plan) {
      console.log(`  id=${p.id} match#${p.matchNumber}: "${p.oldHome} vs ${p.oldAway}" → "${p.newHome} vs ${p.newAway}" @ ${p.venue}`);
    }
  }

  if (skipped.length > 0) {
    console.log('\nSkipped:');
    skipped.forEach(s => console.log(s));
  }

  if (apply && plan.length > 0) {
    let count = 0;
    for (const p of plan) {
      const r = await pool.query(
        "UPDATE matches SET home_team=$1, away_team=$2 WHERE id=$3 AND home_team LIKE 'TBD%'",
        [p.newHome, p.newAway, p.id]
      );
      if (r.rowCount === 1) count++;
      else console.error(`  ⚠️ id=${p.id} unexpected rowCount: ${r.rowCount}`);
    }
    console.log(`\n✅ Updated ${count} matches.`);
  } else if (!apply && plan.length > 0) {
    console.log('\nRe-run with --apply to commit these changes.');
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
