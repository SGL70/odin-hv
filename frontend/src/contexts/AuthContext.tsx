import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api';
import type { User, CatchupData } from '../types';
import { CHANGELOG } from '../changelog';

// Under den här tröskeln (ungefär "samma dag") visas ingen catch-up-modal —
// annars skulle den dyka upp vid varje ren token-utgång/omloggning.
const CATCHUP_THRESHOLD_MS = 8 * 60 * 60 * 1000;

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  catchupData: CatchupData | null;
  catchupOpen: boolean;
  openCatchup: () => void;
  closeCatchup: () => void;
}

const AuthContext = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [catchupData, setCatchupData] = useState<CatchupData | null>(null);
  const [catchupOpen, setCatchupOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(u => setUser(u as User))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const { token, user, previousLoginAt } = await api.login(username, password);
    localStorage.setItem('token', token);
    setUser(user as User);

    if (previousLoginAt && Date.now() - new Date(previousLoginAt).getTime() > CATCHUP_THRESHOLD_MS) {
      try {
        const alerts = await api.alerts.listEvents('open', previousLoginAt);
        const changelogEntries = CHANGELOG.filter(e => e.date > previousLoginAt);
        if (alerts.length > 0 || changelogEntries.length > 0) {
          setCatchupData({ alerts, changelogEntries });
          setCatchupOpen(true);
        }
      } catch {
        // Catch-up är informativt, inte kritiskt — ett misslyckat hämtningsförsök ska inte blockera inloggningen.
      }
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCatchupData(null);
    setCatchupOpen(false);
  };

  const openCatchup = () => setCatchupOpen(true);
  const closeCatchup = () => setCatchupOpen(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, catchupData, catchupOpen, openCatchup, closeCatchup }}>
      {children}
    </AuthContext.Provider>
  );
}
