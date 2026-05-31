/**
 * Frontend leaderboard tests — 5 users after 10 matches.
 * Mocks React Query and AuthContext; tests podium + full table rendering.
 *
 * Standings (from backend scoring tests):
 *   1st Alice   — 100 pts, 10 perfects
 *   2nd Bob     —  66 pts,  2 perfects
 *   3rd Eve     —  45 pts,  3 perfects
 *   4th Carlos  —  42 pts,  1 perfect
 *   5th Diana   —  16 pts,  0 perfects
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

// ─── Mock React Query ─────────────────────────────────────────────────────────

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Alice Expert', email: 'alice@test.com', role: 'player', league_id: 1, created_at: '' },
    token: 'mock-token',
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

import { useQuery } from '@tanstack/react-query';
import { LeaderboardPage } from '../pages/LeaderboardPage';

// ─── Fixture data ─────────────────────────────────────────────────────────────

const LEADERBOARD = [
  { id: 1, name: 'Alice Expert',    total_points: 100, perfect_matches_count: 10, pre_tournament_points: 0, group_stage_points: 100, knockout_points: 0, rank: 1 },
  { id: 2, name: 'Bob Striker',     total_points: 66,  perfect_matches_count: 2,  pre_tournament_points: 0, group_stage_points: 66,  knockout_points: 0, rank: 2 },
  { id: 5, name: 'Eve Casual',      total_points: 45,  perfect_matches_count: 3,  pre_tournament_points: 0, group_stage_points: 45,  knockout_points: 0, rank: 3 },
  { id: 3, name: 'Carlos Midfield', total_points: 42,  perfect_matches_count: 1,  pre_tournament_points: 0, group_stage_points: 42,  knockout_points: 0, rank: 4 },
  { id: 4, name: 'Diana Unlucky',   total_points: 16,  perfect_matches_count: 0,  pre_tournament_points: 0, group_stage_points: 16,  knockout_points: 0, rank: 5 },
];

function renderLeaderboard() {
  return render(
    <MemoryRouter>
      <LeaderboardPage />
    </MemoryRouter>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LeaderboardPage — podium', () => {
  beforeEach(() => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { leaderboard: LEADERBOARD, currentUserId: 1 },
      isLoading: false,
    });
  });

  test('shows loading spinner when data is pending', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    renderLeaderboard();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  test('renders the gold medal for 1st place', () => {
    renderLeaderboard();
    expect(screen.getByText('🥇')).toBeInTheDocument();
  });

  test('renders the silver medal for 2nd place', () => {
    renderLeaderboard();
    expect(screen.getByText('🥈')).toBeInTheDocument();
  });

  test('renders the bronze medal for 3rd place', () => {
    renderLeaderboard();
    expect(screen.getByText('🥉')).toBeInTheDocument();
  });

  test('Alice (1st) shows her first name on the podium', () => {
    renderLeaderboard();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  test('Bob (2nd) shows his first name on the podium', () => {
    renderLeaderboard();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('Eve (3rd) shows her first name on the podium', () => {
    renderLeaderboard();
    expect(screen.getByText('Eve')).toBeInTheDocument();
  });

  test('Alice podium shows 100 points', () => {
    renderLeaderboard();
    // The podium shows the number directly
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  test('Bob podium shows 66 points', () => {
    renderLeaderboard();
    expect(screen.getByText('66')).toBeInTheDocument();
  });

  test('Alice avatar initials are AE', () => {
    renderLeaderboard();
    expect(screen.getByText('AE')).toBeInTheDocument();
  });

  test('crown emoji appears above 1st place', () => {
    renderLeaderboard();
    expect(screen.getByText('👑')).toBeInTheDocument();
  });
});

describe('LeaderboardPage — full table (4th place and below)', () => {
  beforeEach(() => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { leaderboard: LEADERBOARD, currentUserId: 1 },
      isLoading: false,
    });
  });

  test('Carlos appears in the table as #4', () => {
    renderLeaderboard();
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText('Carlos Midfield')).toBeInTheDocument();
  });

  test('Diana appears in the table as #5', () => {
    renderLeaderboard();
    expect(screen.getByText('#5')).toBeInTheDocument();
    expect(screen.getByText('Diana Unlucky')).toBeInTheDocument();
  });

  test('shows correct points for Carlos (42)', () => {
    renderLeaderboard();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('shows correct points for Diana (16)', () => {
    renderLeaderboard();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  test('perfect count shown for each non-podium entry', () => {
    renderLeaderboard();
    // Carlos: "1 perfect ⭐", Diana: "0 perfect ⭐"
    expect(screen.getByText('1 perfect ⭐')).toBeInTheDocument();
    expect(screen.getByText('0 perfect ⭐')).toBeInTheDocument();
  });

  test('current user (Alice) gets the 👈 marker in table if she appeared there', () => {
    // Alice is in top 3 (podium), so no 👈 in table. Diana is not Alice.
    renderLeaderboard();
    expect(screen.queryByText(/👈/)).not.toBeInTheDocument();
  });

  test('no rank-me row when current user is on the podium', () => {
    // AuthContext user is Alice (id=1), she is on the podium — no rank-me row in the table
    renderLeaderboard();
    const rankMeRows = document.querySelectorAll('.rank-me');
    expect(rankMeRows.length).toBe(0);
  });
});

describe('LeaderboardPage — empty state', () => {
  test('shows empty message when no leaderboard data', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { leaderboard: [], currentUserId: 1 },
      isLoading: false,
    });
    renderLeaderboard();
    expect(screen.getByText(/No scores yet/i)).toBeInTheDocument();
  });
});
