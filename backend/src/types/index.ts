export type Role = 'player' | 'admin' | 'super_admin';
export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type Round = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final';
export type PredictionResult = 'home' | 'draw' | 'away';
export type FirstScorer = 'home' | 'away' | 'none';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  league_id: number | null;
  created_at: Date;
}

export interface League {
  id: number;
  name: string;
  invite_code: string;
  created_by: number | null;
  created_at: Date;
}

export interface Match {
  id: number;
  api_match_id: string | null;
  match_number: number;
  round: Round;
  group_name: string | null;
  home_team: string;
  away_team: string;
  stadium: string | null;
  kickoff_time_utc: Date;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  first_scorer_team: FirstScorer | null;
  last_updated: Date;
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
  submitted_at: Date;
  is_default: boolean;
  points_earned: number | null;
}

export interface PreTournamentPrediction {
  id: number;
  user_id: number;
  winner_team: string | null;
  runner_up_team: string | null;
  top_scorer_name: string | null;
  top_scorer_team: string | null;
  top_assister_name: string | null;
  top_assister_team: string | null;
  group_a_first: string | null;
  group_a_second: string | null;
  group_b_first: string | null;
  group_b_second: string | null;
  group_c_first: string | null;
  group_c_second: string | null;
  group_d_first: string | null;
  group_d_second: string | null;
  group_e_first: string | null;
  group_e_second: string | null;
  group_f_first: string | null;
  group_f_second: string | null;
  group_g_first: string | null;
  group_g_second: string | null;
  group_h_first: string | null;
  group_h_second: string | null;
  group_i_first: string | null;
  group_i_second: string | null;
  group_j_first: string | null;
  group_j_second: string | null;
  group_k_first: string | null;
  group_k_second: string | null;
  group_l_first: string | null;
  group_l_second: string | null;
  submitted_at: Date | null;
  is_final: boolean;
}

export interface Score {
  id: number;
  user_id: number;
  pre_tournament_points: number;
  group_stage_points: number;
  knockout_points: number;
  total_points: number;
  perfect_matches_count: number;
  last_calculated_at: Date;
}

export interface AuthRequest extends Request {
  user?: { id: number; role: Role; league_id: number | null };
}
