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
];
