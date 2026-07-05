// Handskriven lista över nya funktioner, visad i "Nytt i appen"-sektionen av
// catch-up-modalen vid inloggning (se AuthContext.tsx). Fylls på manuellt vid
// varje ny funktion — samma vana som redan finns för commit-meddelanden och
// roadmap-anteckningar i projektminnet, ingen koppling till git-historik.
export interface ChangelogEntry {
  date: string; // ISO-datum, t.ex. '2026-07-04'
  title: string;
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-07-04',
    title: 'Ny design',
    description: 'Nya designtokens, konsekvent ikonspråk för kartlagren och en sammanslagen höger-panel (Objekt/Skördare i flikar).',
  },
  {
    date: '2026-07-04',
    title: 'Tågstörningar',
    description: 'Nytt lager för tågförseningar och inställda tåg via Trafikverkets öppna data.',
  },
  {
    date: '2026-07-05',
    title: 'Mediabevakning',
    description: 'Ny "📰 Nyheter"-inkorg som automatiskt skördar SVT, SR, TV4 och Norrbottens-Kuriren via RSS. Tagga en rubrik med kommun/plats för att göra den till ett kartobjekt, eller ta bort den till Läst-listan (Slasken) längst ned — inget försvinner permanent. Egna källor kan läggas till i Inställningar → Nyhetskällor.',
  },
];
