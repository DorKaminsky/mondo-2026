import { api } from './client';
import {
  User, Match, MatchPrediction, PreTournamentPrediction,
  LeaderboardEntry, Score, PredictionResult, FirstScorer, League
} from '../types';

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string; invite_code?: string }) =>
    api.post<{ token: string; user: User }>('/auth/register', data).then(r => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<{ token: string; user: User }>('/auth/login', data).then(r => r.data),

  me: () => api.get<{ user: User }>('/auth/me').then(r => r.data.user),
};

// Leagues
export const leaguesApi = {
  mine: () => api.get<{ league: League | null }>('/leagues/mine').then(r => r.data.league),
  list: () => api.get<{ leagues: League[] }>('/leagues').then(r => r.data.leagues),
  create: (name: string) =>
    api.post<{ league: League }>('/leagues', { name }).then(r => r.data.league),
  regenerateCode: (leagueId: number) =>
    api.post<{ league: League }>(`/leagues/${leagueId}/regenerate-code`).then(r => r.data.league),
  promote: (leagueId: number, userId: number) =>
    api.post(`/leagues/${leagueId}/promote/${userId}`),
  demote: (leagueId: number, userId: number) =>
    api.post(`/leagues/${leagueId}/demote/${userId}`),
};

// Matches
export const matchesApi = {
  all: () => api.get<{ matches: Match[] }>('/matches').then(r => r.data.matches),
  upcoming: () => api.get<{ matches: Match[] }>('/matches/upcoming').then(r => r.data.matches),
  live: () => api.get<{ matches: Match[] }>('/matches/live').then(r => r.data.matches),
  get: (id: number) => api.get<{ match: Match }>(`/matches/${id}`).then(r => r.data.match),
};

// Match Predictions
export const predictionsApi = {
  submit: (data: {
    match_id: number;
    prediction_result: PredictionResult;
    team_a_goals: number;
    team_b_goals: number;
    goal_difference: number;
    first_scorer: FirstScorer;
  }) => api.post<{ prediction: MatchPrediction }>('/predictions', data).then(r => r.data.prediction),

  my: () => api.get<{ predictions: MatchPrediction[] }>('/predictions/my').then(r => r.data.predictions),
  forMatch: (matchId: number) =>
    api.get<{ prediction: MatchPrediction | null }>(`/predictions/match/${matchId}`).then(r => r.data.prediction),
  allForMatch: (matchId: number) =>
    api.get<{
      predictions: Array<{
        id: number; user_id: number; name: string; role: string;
        prediction_result: PredictionResult;
        team_a_goals: number; team_b_goals: number;
        first_scorer: FirstScorer; goal_difference: number;
        is_default: boolean; points_earned: number | null;
        provisional_points?: number;
      }>;
      deadlinePassed: boolean;
      isLive?: boolean;
    }>(`/predictions/match/${matchId}/all`).then(r => r.data),
};

// Pre-tournament
export const preTournamentApi = {
  get: () =>
    api.get<{ prediction: PreTournamentPrediction | null }>('/pre-tournament').then(r => r.data.prediction),
  save: (data: Partial<PreTournamentPrediction>) =>
    api.put<{ prediction: PreTournamentPrediction }>('/pre-tournament', data).then(r => r.data.prediction),
};

// Leaderboard
export const leaderboardApi = {
  all: () =>
    api.get<{ leaderboard: LeaderboardEntry[]; currentUserId: number }>('/leaderboard').then(r => r.data),
  me: () =>
    api.get<{ score: Score | null; matchHistory: MatchPrediction[] }>('/leaderboard/me').then(r => r.data),
  stats: () =>
    api.get('/leaderboard/stats').then(r => r.data),
  player: (id: number) =>
    api.get<{
      player: { id: number; name: string; role: string };
      score: Score | null;
      preTournament: PreTournamentPrediction | null;
      matchHistory: MatchPrediction[];
    }>(`/leaderboard/player/${id}`).then(r => r.data),
  summary: () =>
    api.get<{
      pointsSinceLastVisit: number;
      lastSeenAt: string | null;
      myRank: number | null;
      myPoints: number;
      leagueSize: number;
      gaps: {
        first: { name: string; points: number; delta: number } | null;
        above: { name: string; points: number; delta: number } | null;
        below: { name: string; points: number; delta: number } | null;
      };
    }>('/leaderboard/summary').then(r => r.data),
  playerStats: () =>
    api.get<{
      stats: Array<{
        id: number; name: string;
        total_points: number; perfect_matches_count: number;
        group_stage_points: number; knockout_points: number;
        total_finished: number; real_predictions: number; defaults_count: number;
        correct_results: number; exact_scores: number;
        correct_first_scorers: number; total_with_first_scorer: number;
        correct_goal_diffs: number;
      }>;
    }>('/leaderboard/player-stats').then(r => r.data),
};

// Admin
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard').then(r => r.data),
  setMatchResult: (matchId: number, data: {
    home_score: number; away_score: number; first_scorer_team: string; status: string
  }) => api.put(`/admin/matches/${matchId}/result`, data),
  users: () => api.get<{ users: User[] }>('/admin/users').then(r => r.data.users),
  settings: () => api.get<{ settings: Record<string, string> }>('/admin/settings').then(r => r.data.settings),
  updateSettings: (settings: Record<string, string>) => api.put('/admin/settings', settings),
  preTournamentResults: () =>
    api.get<{ actuals: Record<string, string> }>('/admin/pre-tournament-results').then(r => r.data.actuals),
  setPreTournamentResults: (data: {
    winner_team: string;
    runner_up_team: string;
    top_scorer_name: string;
    top_assister_name: string;
    groups: Record<string, string>;
  }) => api.put('/admin/pre-tournament-results', data),
};
