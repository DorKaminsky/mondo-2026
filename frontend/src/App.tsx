import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute, AdminRoute, GuestRoute, SuperAdminRoute } from './components/ProtectedRoute';
import { BottomNav } from './components/BottomNav';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { PredictPage } from './pages/PredictPage';
import { MatchPredictPage } from './pages/MatchPredictPage';
import { PreTournamentPage } from './pages/PreTournamentPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminMatches } from './pages/admin/AdminMatches';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminLeagues } from './pages/admin/AdminLeagues';
import { AdminPreTournament } from './pages/admin/AdminPreTournament';
import { RulesPage } from './pages/RulesPage';
import { StatsPage } from './pages/StatsPage';

function AppRoutes() {
  const { user } = useAuth();

  return (
    <div className="layout">
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/predict" element={<ProtectedRoute><PredictPage /></ProtectedRoute>} />
        <Route path="/predict/:matchId" element={<ProtectedRoute><MatchPredictPage /></ProtectedRoute>} />
        <Route path="/pre-tournament" element={<ProtectedRoute><PreTournamentPage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
        <Route path="/player/:id" element={<ProtectedRoute><PlayerProfilePage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/matches" element={<AdminRoute><AdminMatches /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
        <Route path="/admin/leagues" element={<SuperAdminRoute><AdminLeagues /></SuperAdminRoute>} />
        <Route path="/admin/pre-tournament" element={<AdminRoute><AdminPreTournament /></AdminRoute>} />
        <Route path="/rules" element={<RulesPage />} />
      </Routes>
      {user && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
