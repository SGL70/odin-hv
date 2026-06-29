import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { MapView } from './components/MapView';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
      Laddar...
    </div>
  );

  return user ? <MapView /> : <Login />;
}
