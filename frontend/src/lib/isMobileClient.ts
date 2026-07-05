// Delad mellan App.tsx (vilken vy renderas) och main.tsx (PWA-registrering) — en
// mobilanvändare som surfar in på rotadressen ska få samma mobila upplevelse som /report,
// utan att behöva känna till den adressen specifikt.
export function isMobileClientPath(): boolean {
  const isMobileDevice = /Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
  return window.location.pathname.startsWith('/report')
    || (window.location.pathname === '/' && isMobileDevice);
}
