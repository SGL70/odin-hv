import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';

// Ingen routingbibliotek i appen — den mobila PWA:n (kartläsning + fältrapportering, se
// MobileApp.tsx) avgörs enklast med en path-koll i stället för att införa react-router.
const isMobilePath = window.location.pathname.startsWith('/report');

// lazy() ger separata bundlar per väg — annars skulle mobil-PWA:n dra in skrivbordets
// MapView-kod (klustring, rit-lägen, alla skrivbordspaneler) i onödan.
const MapView = lazy(() => import('./components/MapView').then(m => ({ default: m.MapView })));
const MobileApp = lazy(() => import('./components/MobileApp').then(m => ({ default: m.MobileApp })));

const LOADING = (
  <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
    Laddar...
  </div>
);

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return LOADING;
  if (!user) return <Login />;

  return (
    <Suspense fallback={LOADING}>
      {isMobilePath ? <MobileApp /> : <MapView />}
    </Suspense>
  );
}
