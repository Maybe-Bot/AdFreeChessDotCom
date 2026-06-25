import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';
import BotsPage from './pages/BotsPage';

function RequireRealUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#e2e8f0', padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!user || user.isGuest) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<LobbyPage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/bots" element={<RequireRealUser><BotsPage /></RequireRealUser>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
