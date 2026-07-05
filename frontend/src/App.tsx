import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';

// Ingen routingbibliotek i appen — en enda extra väg (fältrapportering, avskalad PWA-vy)
// avgörs enklast med en path-koll i stället för att införa react-router för det.
const isFieldReportPath = window.location.pathname.startsWith('/report');

// lazy() ger separata bundlar per väg — annars skulle /report dra in hela kart-/MapLibre-bunten
// (~2 MB) trots att fältvyn inte visar någon karta, illa på dålig mobiltäckning i fält.
const MapView = lazy(() => import('./components/MapView').then(m => ({ default: m.MapView })));
const FieldReportView = lazy(() => import('./components/FieldReportView').then(m => ({ default: m.FieldReportView })));

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
      {isFieldReportPath ? <FieldReportView /> : <MapView />}
    </Suspense>
  );
}
