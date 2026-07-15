# Notifieringssystem — förslag (utredning)

*Skapad: 2026-07-15 — svar på roadmap-punkt 12 ("Aviseringar via SMS/e-post för varningar")*

Detta är en designutredning, inte implementerad funktionalitet. Syftet är att bryta ner "aviseringar" i oberoende delar innan något byggs, så att steg 1 kan levereras snabbt utan att stänga dörren för steg 4.

## Nuläge

Notissystemet finns i grunden men är enkelriktat och oriktat:

- **`alert_rules`/`alert_events`** (`backend/src/services/alertEngine.js`) — tre regeltyper (threshold/proximity/cluster), skapar events med `status: open/acknowledged`.
- **Leverans:** enbart `io.emit()` i `alertEngine.js`/`routes/alerts.js` — en blind broadcast till *alla* inloggade klienter, oavsett roll eller vilket område de bryr sig om. Ingen SMS/push/e-post ut.
- **Nivåer:** finns informellt via `CRITICALITY_ORDER` (normal/gul/röd) i proximity-regler, men är inte ett generellt fält på alla larm.
- **Mål/mottagare:** finns inte som koncept — allt går till alla. Roller (reader/editor/admin) och OpOmr-kommuner (`settings.op_municipalities`) finns redan i systemet men styr idag bara kartfilter/analys, inte vem som ser ett larm.
- Återanvändbara byggstenar som redan finns: `users.preferences` (JSONB, oanvänd för detta ändamål), 46elks-SMS (idag bara inkommande, se `routes/sms.js`), Mailbox.org SMTP (i infrastrukturen, oanvänd av appen).

## Förslag — fyra oberoende axlar

### 1. Nivåer (severity)

Gör detta till ett riktigt fält på varje event, inte bara implicit i proximity-config:

- `info` — syns bara i händelselistan, ingen banner
- `varning` (gul) — banner i UI, kvar tills kvitterad
- `kritisk` (röd) — banner + ljud + (senare) push/SMS, kräver kvittens

### 2. Scope (vad avgränsar relevansen)

Vad en regel/event *handlar om* geografiskt/tematiskt:

- Globalt (hela systemet)
- OpOmr (nuvarande kommunval — redan implementerat för feature-filtrering, bara att koppla på)
- Enskilt lager (t.ex. bara `power_outages`)
- Radie/polygon kring en punkt (redan finns som mönster i proximity-regler)

### 3. Mål/mottagare (vem ska nås)

Helt saknas idag, störst nytta av att bygga:

- Roll (t.ex. bara editor+admin, eller bara admin för kritiska larm)
- Alla inloggade (dagens beteende, blir default/fallback)
- *(senare, kräver nytt koncept)* Grupp/enhet — det finns inget "vilken patrull/enhet tillhör användaren" idag; skulle kräva en ny tabell om det ska bli mer granulärt än roll

### 4. Leveranskanaler

Kan byggas stegvis ovanpå samma händelsedata:

- In-app (finns) — bara riktad rätt istället för broadcast
- Web Push (PWA:n finns redan för mobil — service worker + VAPID-nycklar, notis även med appen i bakgrunden)
- SMS ut via 46elks (infrastrukturen finns redan, bara inkommande idag) — reserveras för kritisk nivå, opt-in, rate-limitad
- E-post via Mailbox.org SMTP (redan i infran) — passar bättre för sammanfattningar/lägre brådska än akutlarm

## Arkitekturskiss

- Lägg till `severity` och `target` (JSONB: `{roles: [...], scope: {municipalities: [...], layer: ...}}`) på `alert_rules`.
- Byt `io.emit()` mot rum: vid socket-connect gör klienten `socket.join('role:'+user.role)` (+ ev. `socket.join('muni:'+kod)` per vald OpOmr-kommun). Events skickas med `io.to(room).emit(...)` i stället för broadcast — litet ingrepp, stor vinst (folk slipper larm som inte berör dem).
- Notisinställningar per användare i redan existerande `users.preferences` (kanal + min-nivå man vill störas av) — inget nytt schema krävs för detta steg.
- SMS/push/e-post blir separata "leverantörer" som prenumererar på samma `alert:triggered`-event och filtrerar på användarens `preferences`, i stället för ett parallellt notissystem.

## Föreslagen ordning

1. **Rikta befintliga in-app-larm** (rum per roll + OpOmr) — låg risk, direkt nytta, inga nya tabeller.
2. **Severity som riktigt fält** + enkel filtrering i UI (dölj info-nivå som standard).
3. **Per-användare notisinställningar** (kanal + min-nivå) i `users.preferences`.
4. **Web Push** för mobil-PWA:n.
5. **SMS/e-post för kritisk nivå**, opt-in.

## Öppna frågor (kräver beslut innan implementation)

- Ska grupp/enhet (punkt 3, axel "mål/mottagare") byggas nu eller är roll+OpOmr tillräckligt granulärt för Hemvärnets behov i nuläget?
- Vilken nivå (info/varning/kritisk) ska trigga SMS respektive e-post — och vem betalar/ansvarar för SMS-kostnaden vid skarpt läge (46elks är per-SMS)?
- Ska admin kunna sätta obligatoriska notiser (t.ex. kritisk nivå kan inte stängas av) eller är allt opt-in per användare?
