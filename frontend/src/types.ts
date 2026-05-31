export type Role = 'player' | 'admin' | 'super_admin';
export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type Round = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final';
export type PredictionResult = 'home' | 'draw' | 'away';
export type FirstScorer = 'home' | 'away' | 'none';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  league_id: number | null;
  created_at: string;
}

export interface League {
  id: number;
  name: string;
  invite_code?: string; // only visible to admins of that league + super_admins
  created_at: string;
  member_count?: number;
  admin_count?: number;
}

export interface Match {
  id: number;
  match_number: number;
  round: Round;
  group_name: string | null;
  home_team: string;
  away_team: string;
  stadium: string | null;
  kickoff_time_utc: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  first_scorer_team: FirstScorer | null;
}

export interface MatchPrediction {
  id: number;
  user_id: number;
  match_id: number;
  prediction_result: PredictionResult;
  team_a_goals: number;
  team_b_goals: number;
  first_scorer: FirstScorer;
  goal_difference: number;
  submitted_at: string;
  is_default: boolean;
  points_earned: number | null;
  // Joined fields
  home_team?: string;
  away_team?: string;
  kickoff_time_utc?: string;
  round?: Round;
  match_status?: MatchStatus;
  home_score?: number | null;
  away_score?: number | null;
  first_scorer_team?: FirstScorer | null;
}

export interface PreTournamentPrediction {
  winner_team: string;
  runner_up_team: string;
  top_scorer_name: string;
  top_scorer_team: string;
  top_assister_name: string;
  top_assister_team: string;
  group_a_first: string; group_a_second: string;
  group_b_first: string; group_b_second: string;
  group_c_first: string; group_c_second: string;
  group_d_first: string; group_d_second: string;
  group_e_first: string; group_e_second: string;
  group_f_first: string; group_f_second: string;
  group_g_first: string; group_g_second: string;
  group_h_first: string; group_h_second: string;
  group_i_first: string; group_i_second: string;
  group_j_first: string; group_j_second: string;
  group_k_first: string; group_k_second: string;
  group_l_first: string; group_l_second: string;
  is_final: boolean;
  submitted_at: string | null;
}

export interface Score {
  user_id: number;
  pre_tournament_points: number;
  group_stage_points: number;
  knockout_points: number;
  total_points: number;
  perfect_matches_count: number;
  last_calculated_at: string;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  total_points: number;
  pre_tournament_points: number;
  group_stage_points: number;
  knockout_points: number;
  perfect_matches_count: number;
  rank: number;
}
