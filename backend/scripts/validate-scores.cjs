#!/usr/bin/env node
// Validate per-user points: recompute from match_predictions × finished matches
// using the same scoring rules as backend/src/services/scoring.ts, then compare
// to the values stored in `scores`. Reports any drift.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GROUP_PTS = 2;
const KNOCKOUT_PTS = 3;
const DEFAULT_PTS = 1;
const MAX_PRED = 5;
const KNOCKOUT_ROUNDS = new Set(['r32','r16','qf','sf','final']);

function isKnockout(round) { return KNOCKOUT_ROUNDS.has(round); }

function scorePred(pred, match) {
  if (match.home_score === null || match.away_score === null) return { pts: 0, perfect: false };
  const ppc = pred.is_default ? DEFAULT_PTS : (isKnockout(match.round) ? KNOCKOUT_PTS : GROUP_PTS);
  const actualResult = match.home_score > match.away_score ? 'home'
                    : match.home_score < match.away_score ? 'away' : 'draw';
  const actualDiff = Math.abs(match.home_score - match.away_score);
  let correct = 0;
  if (pred.prediction_result === actualResult) correct++;
  if (pred.team_a_goals === match.home_score) correct++;
  if (pred.team_b_goals === match.away_score) correct++;
  const actualFS = match.first_scorer_team ?? 'none';
  if (pred.first_scorer === actualFS) correct++;
  if (pred.goal_difference === actualDiff) correct++;
  const pts = Math.min(correct * ppc, MAX_PRED * ppc);
  const perfect = correct === MAX_PRED && !(pred.is_default && match.home_score === 0 && match.away_score === 0);
  return { pts, perfect };
}

(async () => {
  // Pre-tournament actuals (if set)
  const settings = await pool.query("SELECT key, value FROM system_settings WHERE key LIKE 'pt_actual_%'");
  const ptActuals = Object.fromEntries(settings.rows.map(r => [r.key, r.value]));

  // Users in any league, excluding moderators
  const users = await pool.query(`
    SELECT u.id, u.name, u.role, u.league_id, l.name AS league_name
      FROM users u
      JOIN leagues l ON l.id = u.league_id
     WHERE u.role != 'admin'
     ORDER BY u.league_id, u.id
  `);

  const matches = await pool.query(`SELECT * FROM matches WHERE status = 'finished'`);
  const matchById = new Map(matches.rows.map(m => [m.id, m]));

  const predsAll = await pool.query(`
    SELECT mp.*, m.status AS m_status FROM match_predictions mp
      JOIN matches m ON m.id = mp.match_id
     WHERE m.status = 'finished'
  `);
  const predsByUser = new Map();
  for (const p of predsAll.rows) {
    if (!predsByUser.has(p.user_id)) predsByUser.set(p.user_id, []);
    predsByUser.get(p.user_id).push(p);
  }

  const scoresQ = await pool.query(`SELECT * FROM scores`);
  const scoreByUser = new Map(scoresQ.rows.map(s => [s.user_id, s]));

  const ptPreds = await pool.query(`SELECT * FROM pre_tournament_predictions`);
  const ptByUser = new Map(ptPreds.rows.map(p => [p.user_id, p]));

  const issues = [];
  const summary = [];

  for (const u of users.rows) {
    const ups = predsByUser.get(u.id) ?? [];
    let computedGroup = 0, computedKO = 0, computedPerfect = 0;
    const perMatch = [];
    for (const p of ups) {
      const m = matchById.get(p.match_id);
      if (!m) continue;
      const { pts, perfect } = scorePred(p, m);
      if (isKnockout(m.round)) computedKO += pts; else computedGroup += pts;
      if (perfect) computedPerfect++;
      perMatch.push({ matchId: m.id, stored: p.points_earned, computed: pts, perfect, round: m.round, isDefault: p.is_default });
    }

    // Compute pre-tournament from actuals (if set, else 0 — pre-tournament not yet scored)
    let computedPT = 0;
    const pt = ptByUser.get(u.id);
    if (pt && Object.keys(ptActuals).length > 0) {
      if (pt.winner_team && pt.winner_team === ptActuals['pt_actual_winner']) computedPT += 16;
      if (pt.runner_up_team && pt.runner_up_team === ptActuals['pt_actual_runner_up']) computedPT += 8;
      const tsActual = (ptActuals['pt_actual_top_scorer'] ?? '').trim().toLowerCase();
      if (tsActual && (pt.top_scorer_name ?? '').trim().toLowerCase() === tsActual) computedPT += 12;
      // top_assister column doesn't exist in DB schema; skipping (the engine compares pred.top_assister_name on the row, which is undefined here)
      const groups = ['a','b','c','d','e','f','g','h','i','j','k','l'];
      for (const g of groups) {
        const af = ptActuals[`pt_actual_group_${g}_first`];
        const as = ptActuals[`pt_actual_group_${g}_second`];
        if (af && pt[`group_${g}_first`] === af) computedPT += 4;
        if (as && pt[`group_${g}_second`] === as) computedPT += 4;
      }
    }

    const computedTotal = computedGroup + computedKO + computedPT;
    const stored = scoreByUser.get(u.id);
    const sg = stored?.group_stage_points ?? 0;
    const sk = stored?.knockout_points ?? 0;
    const spt = stored?.pre_tournament_points ?? 0;
    const st = stored?.total_points ?? 0;
    const sp = stored?.perfect_matches_count ?? 0;

    const drifts = [];
    if (sg !== computedGroup) drifts.push(`group_stage_points stored=${sg} computed=${computedGroup}`);
    if (sk !== computedKO) drifts.push(`knockout_points stored=${sk} computed=${computedKO}`);
    if (spt !== computedPT) drifts.push(`pre_tournament_points stored=${spt} computed=${computedPT}`);
    if (st !== computedTotal) drifts.push(`total_points stored=${st} computed=${computedTotal}`);
    if (sp !== computedPerfect) drifts.push(`perfect_matches_count stored=${sp} computed=${computedPerfect}`);

    summary.push({
      userId: u.id, name: u.name, league: u.league_name, role: u.role,
      stored: { group: sg, ko: sk, pt: spt, total: st, perfect: sp },
      computed: { group: computedGroup, ko: computedKO, pt: computedPT, total: computedTotal, perfect: computedPerfect },
      drifts,
      finishedPredCount: ups.length,
    });
    if (drifts.length > 0) issues.push({ user: u, drifts, perMatch });
  }

  console.log('=== Per-user score validation ===');
  console.log(`Users checked: ${summary.length}`);
  console.log(`Finished matches: ${matches.rowCount}`);
  console.log(`PT actuals set: ${Object.keys(ptActuals).length > 0 ? 'yes' : 'no (pre-tournament not scored yet — expected 0)'}\n`);

  console.log('Per-user breakdown:');
  for (const s of summary) {
    const flag = s.drifts.length === 0 ? '✓' : '✗';
    console.log(`${flag} #${s.userId} ${s.name} (${s.league}, ${s.role}, ${s.finishedPredCount} finished preds)`);
    console.log(`    stored:   total=${s.stored.total} group=${s.stored.group} ko=${s.stored.ko} pt=${s.stored.pt} perfect=${s.stored.perfect}`);
    console.log(`    computed: total=${s.computed.total} group=${s.computed.group} ko=${s.computed.ko} pt=${s.computed.pt} perfect=${s.computed.perfect}`);
    if (s.drifts.length > 0) for (const d of s.drifts) console.log(`    ⚠ ${d}`);
  }

  console.log(`\n=== ${issues.length === 0 ? 'ALL CLEAN ✓' : `${issues.length} USERS WITH DRIFT ✗`} ===`);

  await pool.end();
  process.exit(issues.length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
