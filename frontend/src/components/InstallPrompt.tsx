import { useEffect, useState, type CSSProperties } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_STANDALONE = (navigator as Navigator & { standalone?: boolean }).standalone === true
  || window.matchMedia('(display-mode: standalone)').matches;

const bannerStyle: CSSProperties = {
  position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1000,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-panel)', padding: '10px 12px',
  display: 'flex', alignItems: 'center', gap: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,.4)',
};

// Chrome visar sin egen "installera app"-prompt bara efter ett engagemangs-tröskelvärde
// (flera besök över tid) — utan den här fångar vi beforeinstallprompt-eventet själva och
// frågar direkt. Avvisning kommer ihåg per flik-session, inte permanent, så användaren
// slipper nekas frågan för alltid om de trycker "Nej tack" av misstag.
//
// iOS Safari saknar helt beforeinstallprompt/prompt() — Apple exponerar ingen
// programmatisk installationsdialog. Enda vägen är Dela-ikonen → "Lägg till på
// hemskärmen", så där visar vi en instruktionsbanner i stället för en Installera-knapp.
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('odin-install-dismissed') === '1');

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferredEvent(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem('odin-install-dismissed', '1');
    setDismissed(true);
  };

  if (dismissed || IS_STANDALONE) return null;

  if (deferredEvent) {
    const install = async () => {
      await deferredEvent.prompt();
      await deferredEvent.userChoice;
      setDeferredEvent(null);
    };
    return (
      <div style={bannerStyle}>
        <span style={{ flex: 1, fontSize: 13 }}>Installera ODIN Fält som app på hemskärmen?</span>
        <button className="btn-ghost btn-sm" onClick={dismiss}>Nej tack</button>
        <button className="btn-primary btn-sm" onClick={install}>Installera</button>
      </div>
    );
  }

  if (IS_IOS) {
    return (
      <div style={bannerStyle}>
        <span style={{ flex: 1, fontSize: 13 }}>
          Installera ODIN Fält: tryck på <strong>Dela</strong>-ikonen (⬆︎ i rutan) och välj <strong>"Lägg till på hemskärmen"</strong>.
        </span>
        <button className="btn-ghost btn-sm" onClick={dismiss}>Stäng</button>
      </div>
    );
  }

  return null;
}
