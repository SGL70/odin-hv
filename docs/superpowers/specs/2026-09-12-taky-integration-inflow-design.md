# Taky-integration, fas 1: inflöde av fältskapade markörer

Status: godkänd design, redo för implementationsplan
Datum: 2026-09-12

## Bakgrund

Taky (CT 220, `taky.jv10.se`) är en CoT-server (Cursor-on-Target) som routar
positions- och markördata mellan ATAK/iTAK-klienter i fält. ODIN hv (CT 217)
saknar idag en väg för fältpersonal att skapa punkter direkt i sin
ATAK/iTAK-app och få dem att synas i ODIN hv:s delade lägesbild.

ODIN hv har redan en mobil fältrapporterings-vy (`FieldReportView.tsx`) för
sin egen PWA, men den är fristående från ATAK/iTAK-ekosystemet och löser
inte behovet för enheter som redan använder Taky.

Kodbasen har redan viss grundplåt för CoT:
- `features.cot_type` (kolumn, default `b-m-p-s-p`) finns redan och används
  delvis (t.ex. `vehicles → a-f-G-U-C-V` i `trafikverket.js`).
- En pull-baserad `/export/cot`-endpoint finns (`backend/src/routes/export.js`)
  men används inte av frontend och är inte en live-koppling mot Taky.

## Scope

**Med i fas 1:**
- Envägs inflöde: fältskapade CoT-markörer (ATAK/iTAK "b-m-p-*"-typer) från
  Taky → nya features i ODIN hv, direkt synliga på kartan (ingen
  granskningsinkorg).
- Möjlighet att bekräfta (`confirmed`) en inkommen markör.
- Möjlighet att radera en enskild markör eller hela lagret (återanvänder
  befintliga endpoints).

**Uttryckligen utanför fas 1** (egna kommande spec:ar):
- Fas 2: live-positionsspårning av enheter (CoT-typer `a-f-*`), som är en
  kontinuerligt uppdaterande "nuvarande läge"-modell snarare än diskreta
  features.
- Utflödet ODIN hv → Taky (push av `vehicles`, kritiska objekt och
  akutlägen ut till fältpersonalens ATAK/iTAK-kartor). Den befintliga
  `/export/cot`-endpointen är en möjlig utgångspunkt men behöver bli en
  riktig live-push över samma mTLS-anslutning.
- Ingen hantering av CoT-baserade delete/remove-meddelanden från ATAK
  (dvs. om en fältanvändare tar bort sin egen markör i ATAK, tas den INTE
  automatiskt bort i ODIN hv i fas 1 — operatören äger livscykeln via
  ODIN hv:s egna radera-funktioner).

## Arkitektur och dataflöde

```
Taky (CT 220, 192.168.1.140:8089, mTLS)
   │  CoT-XML-ström (alla events på nätet: markörer, positioner, chat, ...)
   ▼
backend/src/services/takyBridge.js   (ny tjänstmodul i ODIN hv:s befintliga
   │                                   Node-backend, CT 217 — samma mönster
   │                                   som alertEngine.js/harvest.js)
   │  1. Håller en TLS-socket mot 192.168.1.140:8089 med klientcert, med
   │     exponentiell backoff-reconnect vid tapp
   │  2. Parsar inkommande CoT-events löpande
   │  3. Filtrerar: fas 1 hanterar bara markör-typer ("b-m-p-*"); allt
   │     annat (t.ex. "a-f-*" positioner) ignoreras tills fas 2
   │  4. Dedup/uppdatering via attributes.cot_uid — ATAK skickar samma
   │     markör upprepat tills den blir stale; andra/tredje gången ska
   │     det bli UPDATE av samma feature, inte en ny rad
   ▼
INSERT/UPDATE features (layer='tak_reports', cot_type=<från eventet>,
                         attributes: {confirmed:false, cot_uid, cot_callsign})
   ▼
Syns direkt i ODIN hv:s karta som vilket annat lager som helst. Operatör
kan bekräfta, radera enskild post, eller tömma hela lagret via befintliga
funktioner.
```

Anslutningen sker **direkt över LAN** (192.168.1.136 → 192.168.1.140:8089),
inte via det publika `taky.jv10.se`, för att undvika beroende av
DDNS/Cloudflare och fortsätta fungera oavsett internetstatus.

## Klientcertifikat

- På CT 220: `taky-client odinhv-bridge --host 192.168.1.140` genererar ett
  cert-paket signerat av Takys befintliga CA (samma CA som redan litar på
  alla andra klienter).
- Cert + nyckel extraheras och läggs som filer i CT 217, monterade in i
  backend-containern på samma sätt som `.env`-hemligheter hanteras idag
  (inte hårdkodat i imagen, inte committat i git).
- `takyBridge.js` använder Node:s `tls.connect()` mot `192.168.1.140:8089`
  med certet.
- Certet ger bryggan läsrättighet till **hela** CoT-strömmen (Taky är en
  enkel router utan server-side per-klient-filtrering) — filtreringen på
  vad som faktiskt sparas i ODIN hv sker i `takyBridge.js`.
- Återkallning vid behov: `takyctl kickban` på CT 220, precis som för
  klientenheter.

## Datamodell

- Nytt lager `tak_reports` läggs till i `FEATURE_LAYERS`
  (`backend/src/migrations.js`) via en ny `ensureTakReportsLayer()`-
  migrering, enligt samma mönster som t.ex. `news_reports` lades till.
  Motsvarande tillägg behövs i frontendens lagerkonfiguration
  (`LayerControl.tsx` m.fl.) och i `db/init.sql` om den listan ska hållas
  komplett för nya installationer.
- Nya attribut på `tak_reports`-features:
  - `confirmed` (boolean, default `false`)
  - `cot_uid` (text) — ATAK:s egen uid, nyckel för dedup/uppdatering
  - `cot_callsign` (text) — visningsnamn från fältenheten
- Den befintliga `cot_type`-kolumnen på `features` återanvänds för att
  spara CoT-typkoden från den inkommande markören.

## UI: bekräfta och radera

- `confirmed` blir ett fält i lagrets attributkonfiguration och dyker då
  upp automatiskt i `FeaturePanel.tsx`:s generiska attributredigerare —
  ingen ny UI-komponent krävs för själva redigeringen.
- Obekräftade markörer ska se visuellt annorlunda ut på kartan (t.ex.
  streckad kant/ikon) tills de bekräftats, annars är fältet osynligt i
  praktiken. Kräver en liten regel i `MapView.tsx` specifikt för
  `tak_reports`, villkorad på `attributes.confirmed`.
- Radera enskild markör (`DELETE /features/:uid`) och radera hela lagret
  (`DELETE /features/layer/:layer`) är redan färdiga endpoints — inget
  nytt backend-arbete krävs för detta.

## Felhantering

- Tappad socket (Taky startar om, nätverksblip): exponentiell
  backoff-reconnect i `takyBridge.js`. Loggar tydligt men kraschar aldrig
  huvud-API:et — samma princip som gäller andra valfria integrationer i
  kodbasen (t.ex. att SMTP saknas inte är ett kritiskt beroende för
  dygnsrapporten).
- Trasig/oväntad CoT-XML: logga och hoppa över det enskilda eventet,
  påverkar inte resten av strömmen.
- Ogiltigt/återkallat certifikat: anslutningen nekas av Taky; loggas
  tydligt så drift märker att certet behöver förnyas.

## Testning

- Enhetstest av CoT-XML → feature-attribut-mappningen som en ren funktion
  (ingen riktig socket behövs för detta).
- Manuellt end-to-end-test: skicka en test-CoT-markör mot Taky (från en
  riktig ATAK-klient, eller ett litet testskript som kopplar upp mTLS mot
  port 8089 och skickar ett event) och verifiera att den dyker upp som
  feature i ODIN hv:s karta, med korrekt lager, `cot_type`, `cot_uid` och
  `confirmed=false`.

## Öppna frågor för uppföljande spec:ar

- Fas 2 (live-positioner): datamodell för "nuvarande läge" per enhet
  (sannolikt en egen tabell snarare än `features`, eftersom det är
  hög-frekventa uppdateringar av samma entitet, inte diskreta objekt).
- Utflödet ODIN hv → Taky: vilka lager (`vehicles`, kritiska objekt via
  `attributes.criticality`, samt definitionen av "akutlägen" — behöver
  klargöras om det avser lagret `emergency` eller den bredare gruppen
  automatiskt skördade händelselager).
