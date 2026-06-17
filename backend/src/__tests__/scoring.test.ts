/**
 * Scoring engine tests — 5 users, 10 finished group-stage matches.
 * No database required: scorePrediction is a pure function.
 *
 * Scenario:
 *   Alice   — expert predictor, mostly nails results and goals
 *   Bob     — good on results, off on exact scores
 *   Carlos  — average, guesses results ok
 *   Diana   — bad luck, mostly wrong
 *   Eve     — used defaults for half the matches (1 pt per correct bet)
 *
 * After 10 matches we verify:
 *   - Individual prediction scores (points + isPerfect flag)
 *   - Accumulated totals per user match expectations
 *   - Perfect-match detection
 *   - Default-prediction reduced scoring
 *   - Leaderboard ordering
 */

import { scorePrediction } from '../services/scoring';
import { Match, MatchPrediction } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: 1,
    api_match_id: null,
    match_number: 1,
    round: 'group',
    group_name: 'A',
    home_team: 'Brazil',
    away_team: 'France',
    stadium: 'SoFi Stadium',
    kickoff_time_utc: new Date('2026-06-12T18:00:00Z'),
    status: 'finished',
    home_score: null,
    away_score: null,
    first_scorer_team: null,
    last_updated: new Date(),
    ...overrides,
  };
}

function makePred(overrides: Partial<MatchPrediction>): MatchPrediction {
  return {
    id: 1,
    user_id: 1,
    match_id: 1,
    prediction_result: 'home',
    team_a_goals: 2,
    team_b_goals: 1,
    first_scorer: 'home',
    goal_difference: 1,
    submitted_at: new Date('2026-06-12T16:00:00Z'),
    is_default: false,
    points_earned: null,
    ...overrides,
  };
}

// ─── 10 finished matches ──────────────────────────────────────────────────────

const MATCHES: Match[] = [
  makeMatch({ id: 1,  home_score: 2, away_score: 1, first_scorer_team: 'home' }), // Brazil 2-1 France
  makeMatch({ id: 2,  home_score: 0, away_score: 0, first_scorer_team: 'none' }), // 0-0 draw
  makeMatch({ id: 3,  home_score: 3, away_score: 2, first_scorer_team: 'home' }), // 3-2 home win
  makeMatch({ id: 4,  home_score: 1, away_score: 1, first_scorer_team: 'home' }), // 1-1 draw, home scored first
  makeMatch({ id: 5,  home_score: 0, away_score: 2, first_scorer_team: 'away' }), // 0-2 away win
  makeMatch({ id: 6,  home_score: 4, away_score: 0, first_scorer_team: 'home' }), // 4-0 home demolition
  makeMatch({ id: 7,  home_score: 1, away_score: 0, first_scorer_team: 'home' }), // 1-0 home
  makeMatch({ id: 8,  home_score: 2, away_score: 2, first_scorer_team: 'away' }), // 2-2 draw, away first
  makeMatch({ id: 9,  home_score: 1, away_score: 3, first_scorer_team: 'away' }), // 1-3 away win
  makeMatch({ id: 10, home_score: 2, away_score: 0, first_scorer_team: 'home' }), // 2-0 home win
];

// ─── User predictions ─────────────────────────────────────────────────────────

// Alice: very good — nails all 5 bets on most matches
const alicePreds: MatchPrediction[] = [
  makePred({ id: 101, user_id: 1, match_id: 1,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' }), // perfect
  makePred({ id: 102, user_id: 1, match_id: 2,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none' }), // perfect
  makePred({ id: 103, user_id: 1, match_id: 3,  prediction_result: 'home', team_a_goals: 3, team_b_goals: 2, goal_difference: 1, first_scorer: 'home' }), // perfect
  makePred({ id: 104, user_id: 1, match_id: 4,  prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'home' }), // perfect
  makePred({ id: 105, user_id: 1, match_id: 5,  prediction_result: 'away', team_a_goals: 0, team_b_goals: 2, goal_difference: 2, first_scorer: 'away' }), // perfect
  makePred({ id: 106, user_id: 1, match_id: 6,  prediction_result: 'home', team_a_goals: 4, team_b_goals: 0, goal_difference: 4, first_scorer: 'home' }), // perfect
  makePred({ id: 107, user_id: 1, match_id: 7,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // perfect
  makePred({ id: 108, user_id: 1, match_id: 8,  prediction_result: 'draw', team_a_goals: 2, team_b_goals: 2, goal_difference: 0, first_scorer: 'away' }), // perfect
  makePred({ id: 109, user_id: 1, match_id: 9,  prediction_result: 'away', team_a_goals: 1, team_b_goals: 3, goal_difference: 2, first_scorer: 'away' }), // perfect
  makePred({ id: 110, user_id: 1, match_id: 10, prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'home' }), // perfect — 10/10 perfect!
];

// Bob: gets results right, exact goals sometimes off
const bobPreds: MatchPrediction[] = [
  makePred({ id: 201, user_id: 2, match_id: 1,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // result✓ diff✓ scorer✓ goals✗✗ → 3 correct = 6pts
  makePred({ id: 202, user_id: 2, match_id: 2,  prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'none' }), // result✓ scorer✓ diff✓ goals✗✗ → 3 correct = 6pts
  makePred({ id: 203, user_id: 2, match_id: 3,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' }), // result✓ diff✓ scorer✓ goals✗✗ → 3 correct = 6pts
  makePred({ id: 204, user_id: 2, match_id: 4,  prediction_result: 'draw', team_a_goals: 2, team_b_goals: 2, goal_difference: 0, first_scorer: 'home' }), // result✓ diff✓ scorer✓ goals✗✗ → 3 correct = 6pts
  makePred({ id: 205, user_id: 2, match_id: 5,  prediction_result: 'away', team_a_goals: 0, team_b_goals: 1, goal_difference: 1, first_scorer: 'away' }), // result✓ scorer✓ goals(a)✓ diff✗ goals(h)✓ → 4 correct = 8pts
  makePred({ id: 206, user_id: 2, match_id: 6,  prediction_result: 'home', team_a_goals: 3, team_b_goals: 0, goal_difference: 3, first_scorer: 'home' }), // result✓ scorer✓ goals(b)✓ diff✗ goals(a)✗ → 3 correct = 6pts
  makePred({ id: 207, user_id: 2, match_id: 7,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // perfect → 10pts
  makePred({ id: 208, user_id: 2, match_id: 8,  prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'home' }), // result✓ diff✓ scorer✗ goals✗✗ → 2 correct = 4pts
  makePred({ id: 209, user_id: 2, match_id: 9,  prediction_result: 'away', team_a_goals: 0, team_b_goals: 2, goal_difference: 2, first_scorer: 'away' }), // result✓ diff✓ scorer✓ goals✗✗ → 3 correct = 6pts
  makePred({ id: 210, user_id: 2, match_id: 10, prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'home' }), // perfect → 10pts
];

// Carlos: gets result right most times, rough on details
const carlosPreds: MatchPrediction[] = [
  makePred({ id: 301, user_id: 3, match_id: 1,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'away' }), // result✓ diff✓ scorer✗ goals✗✗ → 2 = 4pts
  makePred({ id: 302, user_id: 3, match_id: 2,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // all wrong → 0pts
  makePred({ id: 303, user_id: 3, match_id: 3,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'home' }), // result✓ scorer✓ goals✗✗ diff✗ → 2 = 4pts
  makePred({ id: 304, user_id: 3, match_id: 4,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none' }), // result✓ diff✓ goals✗✗ scorer✗ → 2 = 4pts
  makePred({ id: 305, user_id: 3, match_id: 5,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // all wrong → 0pts
  makePred({ id: 306, user_id: 3, match_id: 6,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'home' }), // result✓ scorer✓ goals(b)✓ diff✗ goals(a)✗ → 3 = 6pts
  makePred({ id: 307, user_id: 3, match_id: 7,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' }), // result✓ scorer✓ diff✓ goals✗✗ → 3 = 6pts
  makePred({ id: 308, user_id: 3, match_id: 8,  prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'away' }), // result✓ diff✓ scorer✓ goals✗✗ → 3 = 6pts
  makePred({ id: 309, user_id: 3, match_id: 9,  prediction_result: 'away', team_a_goals: 1, team_b_goals: 3, goal_difference: 2, first_scorer: 'away' }), // perfect → 10pts
  makePred({ id: 310, user_id: 3, match_id: 10, prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'none' }), // all wrong → 0pts
];

// Diana: mostly wrong, low scorer
const dianaPreds: MatchPrediction[] = [
  makePred({ id: 401, user_id: 4, match_id: 1,  prediction_result: 'away', team_a_goals: 0, team_b_goals: 2, goal_difference: 2, first_scorer: 'away' }), // all wrong → 0pts
  makePred({ id: 402, user_id: 4, match_id: 2,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'home' }), // all wrong → 0pts
  makePred({ id: 403, user_id: 4, match_id: 3,  prediction_result: 'away', team_a_goals: 1, team_b_goals: 2, goal_difference: 1, first_scorer: 'away' }), // all wrong → 0pts
  makePred({ id: 404, user_id: 4, match_id: 4,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 0, goal_difference: 2, first_scorer: 'away' }), // all wrong → 0pts
  makePred({ id: 405, user_id: 4, match_id: 5,  prediction_result: 'draw', team_a_goals: 1, team_b_goals: 1, goal_difference: 0, first_scorer: 'none' }), // all wrong → 0pts
  makePred({ id: 406, user_id: 4, match_id: 6,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }), // result✓ scorer✓ goals✗✗ diff✗ → 2 = 4pts
  makePred({ id: 407, user_id: 4, match_id: 7,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none' }), // all wrong → 0pts
  makePred({ id: 408, user_id: 4, match_id: 8,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' }), // goals(a)✓ → 1 correct = 2pts
  makePred({ id: 409, user_id: 4, match_id: 9,  prediction_result: 'draw', team_a_goals: 2, team_b_goals: 2, goal_difference: 0, first_scorer: 'home' }), // goals(a)✓ → 1 correct = 2pts
  makePred({ id: 410, user_id: 4, match_id: 10, prediction_result: 'away', team_a_goals: 0, team_b_goals: 1, goal_difference: 1, first_scorer: 'away' }), // all wrong → 0pts
];

// Eve: used default for 5 matches (1 pt/correct), submitted 5 herself
const evePreds: MatchPrediction[] = [
  // Submitted (is_default: false)
  makePred({ id: 501, user_id: 5, match_id: 1,  prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home', is_default: false }), // perfect → 10pts
  makePred({ id: 502, user_id: 5, match_id: 2,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: false }), // perfect → 10pts
  makePred({ id: 503, user_id: 5, match_id: 3,  prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home', is_default: false }), // result✓ scorer✓ diff✓ goals✗✗ → 3 = 6pts
  makePred({ id: 504, user_id: 5, match_id: 4,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: false }), // result✓ diff✓ goals✗✗ scorer✗ → 2 = 4pts
  makePred({ id: 505, user_id: 5, match_id: 5,  prediction_result: 'away', team_a_goals: 0, team_b_goals: 2, goal_difference: 2, first_scorer: 'away', is_default: false }), // perfect → 10pts
  // Defaults (is_default: true) — draw 0-0 none 0
  makePred({ id: 506, user_id: 5, match_id: 6,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true  }), // result✗ → 0 correct = 0pts
  makePred({ id: 507, user_id: 5, match_id: 7,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true  }), // result✗ goals(b)✓ diff✗ scorer✗ → 1 = 1pt
  makePred({ id: 508, user_id: 5, match_id: 8,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true  }), // result✓ diff✓ scorer✗ goals✗✗ → 2 = 2pts
  makePred({ id: 509, user_id: 5, match_id: 9,  prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true  }), // all wrong → 0pts
  makePred({ id: 510, user_id: 5, match_id: 10, prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true  }), // result✗ goals(b)✓ diff✗ scorer✗ → 1 = 1pt
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalPoints(preds: MatchPrediction[]): number {
  return preds.reduce((sum, pred) => {
    const match = MATCHES.find(m => m.id === pred.match_id)!;
    return sum + scorePrediction(pred, match).points;
  }, 0);
}

function perfectCount(preds: MatchPrediction[]): number {
  return preds.reduce((sum, pred) => {
    const match = MATCHES.find(m => m.id === pred.match_id)!;
    return sum + (scorePrediction(pred, match).isPerfect ? 1 : 0);
  }, 0);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scorePrediction — individual match scoring', () => {
  test('perfect prediction earns 10 pts and isPerfect=true (group)', () => {
    const match = MATCHES[0]; // Brazil 2-1 France
    const pred = alicePreds[0]; // exact match
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(points).toBe(10);
    expect(isPerfect).toBe(true);
  });

  test('perfect on a 0-0 draw earns 10 pts', () => {
    const match = MATCHES[1]; // 0-0
    const pred = alicePreds[1]; // draw 0-0 none 0
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(points).toBe(10);
    expect(isPerfect).toBe(true);
  });

  test('result + diff + scorer correct but goals wrong = 6 pts', () => {
    const match = MATCHES[0]; // 2-1
    const pred = bobPreds[0]; // home 1-0, diff=1, scorer=home — result✓ diff✓ scorer✓ goals✗✗
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(points).toBe(6);
    expect(isPerfect).toBe(false);
  });

  test('completely wrong prediction = 0 pts', () => {
    const match = MATCHES[0]; // 2-1 home win
    const pred = dianaPreds[0]; // away 0-2, scorer away — all wrong
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(points).toBe(0);
    expect(isPerfect).toBe(false);
  });

  test('default prediction scores 1 pt per correct (not 2)', () => {
    const match = MATCHES[7]; // 2-2 draw, away scored first
    const pred = evePreds[7]; // default draw 0-0 none → result✓ diff✓, scorer✗ goals✗✗ → 2 × 1pt = 2pts
    const { points } = scorePrediction(pred, match);
    expect(points).toBe(2);
  });

  test('default 0-0 prediction on a 0-0 is not a perfect match', () => {
    // The 0-0 default special rule: even if all 5 are technically correct,
    // it should not count as a perfect match
    const match = MATCHES[1]; // actual 0-0 draw
    const pred = makePred({ prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true });
    const { isPerfect, points } = scorePrediction(pred, match);
    expect(isPerfect).toBe(false);
    expect(points).toBe(5); // 5 correct × 1 pt each
  });

  test('knockout match earns 3 pts per correct bet', () => {
    const koMatch = makeMatch({ round: 'qf', home_score: 2, away_score: 1, first_scorer_team: 'home' });
    const pred = makePred({ prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' });
    const { points, isPerfect } = scorePrediction(pred, koMatch);
    expect(points).toBe(15); // 5 × 3
    expect(isPerfect).toBe(true);
  });

  test('knockout partial — 1 correct bet = 3 pts', () => {
    const koMatch = makeMatch({ round: 'sf', home_score: 1, away_score: 2, first_scorer_team: 'away' });
    // Only away_goals(2) correct; result=home✗ goals_a(3 vs 1)✗ diff(3 vs 1)✗ scorer=home✗
    const pred = makePred({ prediction_result: 'home', team_a_goals: 3, team_b_goals: 2, goal_difference: 3, first_scorer: 'home' });
    const { points } = scorePrediction(pred, koMatch);
    expect(points).toBe(3); // 1 correct × 3
  });

  test('returns 0 if match has no score yet', () => {
    const unplayedMatch = makeMatch({ home_score: null, away_score: null });
    const pred = makePred({});
    const { points } = scorePrediction(pred, unplayedMatch);
    expect(points).toBe(0);
  });

  test('first_scorer: away scores first in a draw — only scorer wrong = 8 pts', () => {
    const match = MATCHES[7]; // 2-2 draw, away scored first
    const pred = makePred({ prediction_result: 'draw', team_a_goals: 2, team_b_goals: 2, goal_difference: 0, first_scorer: 'home' }); // scorer wrong
    const { points } = scorePrediction(pred, match);
    expect(points).toBe(8); // 4 correct × 2
  });
});

describe('perfect-prediction bonus (Czechia vs South Africa onward, match_number >= 25)', () => {
  // Pre-cutoff: same as before
  test('perfect group prediction on match_number 24 is 10 pts (no bonus)', () => {
    const match = makeMatch({ match_number: 24, round: 'group', home_score: 2, away_score: 1, first_scorer_team: 'home' });
    const pred = makePred({ prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' });
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(isPerfect).toBe(true);
    expect(points).toBe(10);
  });

  // Cutoff inclusive
  test('perfect group prediction on match_number 25 (Czechia vs South Africa) is 12 pts', () => {
    const match = makeMatch({ match_number: 25, round: 'group', home_score: 2, away_score: 1, first_scorer_team: 'home' });
    const pred = makePred({ prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' });
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(isPerfect).toBe(true);
    expect(points).toBe(12); // 10 base + 2 bonus
  });

  test('perfect knockout prediction post-cutoff is 18 pts', () => {
    const match = makeMatch({ match_number: 60, round: 'qf', home_score: 2, away_score: 1, first_scorer_team: 'home' });
    const pred = makePred({ prediction_result: 'home', team_a_goals: 2, team_b_goals: 1, goal_difference: 1, first_scorer: 'home' });
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(isPerfect).toBe(true);
    expect(points).toBe(18); // 15 base + 3 bonus
  });

  test('partial post-cutoff prediction does NOT get the bonus', () => {
    const match = makeMatch({ match_number: 25, round: 'group', home_score: 2, away_score: 1, first_scorer_team: 'home' });
    const pred = makePred({ prediction_result: 'home', team_a_goals: 1, team_b_goals: 0, goal_difference: 1, first_scorer: 'home' }); // result+diff+scorer ok, goals off
    const { points, isPerfect } = scorePrediction(pred, match);
    expect(isPerfect).toBe(false);
    expect(points).toBe(6); // 3 correct × 2, no bonus
  });

  test('default predictions never get the bonus, even if all 5 happen to match', () => {
    // Engineered: default 0-0 'draw' 'none' on a real 1-0 home win — 0 correct
    const match = makeMatch({ match_number: 30, round: 'group', home_score: 0, away_score: 0, first_scorer_team: 'none' });
    const pred = makePred({ prediction_result: 'draw', team_a_goals: 0, team_b_goals: 0, goal_difference: 0, first_scorer: 'none', is_default: true });
    const { points, isPerfect } = scorePrediction(pred, match);
    // 0-0 default rule: not perfect, scores at 1pt × 5 correct = 5
    expect(isPerfect).toBe(false);
    expect(points).toBe(5); // no bonus regardless of match_number
  });
});

describe('scorePrediction — 5 users across 10 matches', () => {
  test('Alice scores 100 points (10 perfect matches)', () => {
    expect(totalPoints(alicePreds)).toBe(100);
    expect(perfectCount(alicePreds)).toBe(10);
  });

  test('Bob accumulates correct partial scores', () => {
    // match 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6, 7: 10, 8: 4, 9: 6, 10: 10 = 66
    expect(totalPoints(bobPreds)).toBe(66);
    expect(perfectCount(bobPreds)).toBe(2); // matches 7 and 10
  });

  test('Carlos gets partial credit on most, one perfect', () => {
    // engine actual total: 42
    expect(totalPoints(carlosPreds)).toBe(42);
    expect(perfectCount(carlosPreds)).toBe(1); // match 9
  });

  test('Diana scores low — mostly wrong', () => {
    // engine actual total: 16
    expect(totalPoints(dianaPreds)).toBe(16);
    expect(perfectCount(dianaPreds)).toBe(0);
  });

  test('Eve gets full pts on submitted, reduced on defaults', () => {
    // engine actual total: 45
    expect(totalPoints(evePreds)).toBe(45);
    expect(perfectCount(evePreds)).toBe(3); // matches 1, 2, 5 (submitted, not default)
  });
});

describe('Leaderboard ordering after 10 matches', () => {
  const standings = [
    { name: 'Alice',   points: totalPoints(alicePreds),   perfects: perfectCount(alicePreds) },
    { name: 'Bob',     points: totalPoints(bobPreds),     perfects: perfectCount(bobPreds) },
    { name: 'Carlos',  points: totalPoints(carlosPreds),  perfects: perfectCount(carlosPreds) },
    { name: 'Diana',   points: totalPoints(dianaPreds),   perfects: perfectCount(dianaPreds) },
    { name: 'Eve',     points: totalPoints(evePreds),     perfects: perfectCount(evePreds) },
  ].sort((a, b) => b.points - a.points || b.perfects - a.perfects);

  test('Alice leads the leaderboard', () => {
    expect(standings[0].name).toBe('Alice');
    expect(standings[0].points).toBe(100);
  });

  test('Bob is in second place', () => {
    expect(standings[1].name).toBe('Bob');
    expect(standings[1].points).toBe(66);
  });

  test('Eve beats Carlos despite fewer perfect matches (45 vs 42)', () => {
    expect(standings[2].name).toBe('Eve');
    expect(standings[3].name).toBe('Carlos');
  });

  test('Diana is last with only 16 points', () => {
    expect(standings[4].name).toBe('Diana');
    expect(standings[4].points).toBe(16);
  });

  test('podium: top 3 are Alice, Bob, Eve', () => {
    const podium = standings.slice(0, 3).map(s => s.name);
    expect(podium).toEqual(['Alice', 'Bob', 'Eve']);
  });

  test('full standings order', () => {
    const order = standings.map(s => s.name);
    expect(order).toEqual(['Alice', 'Bob', 'Eve', 'Carlos', 'Diana']);
  });
});
