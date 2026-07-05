import { useState } from 'react';
import { MobileMapView } from './MobileMapView';
import { FieldReportView } from './FieldReportView';

// Toppnivå-skal för /report-PWA:n (Mobilversion.odp) — en installerad app, två vyer som växlas
// internt utan sidladdning, i stället för två separata sidor/PWA:er. /report förblir
// PWA-identiteten (start_url/scope i manifest.json) så befintliga hemskärmsinstallationer
// inte går sönder, men rymmer nu både kartläsning och fältrapportering.
export function MobileApp() {
  const [view, setView] = useState<'karta' | 'rapport'>('karta');

  return view === 'karta'
    ? <MobileMapView onAddNew={() => setView('rapport')} />
    : <FieldReportView onBack={() => setView('karta')} />;
}
