# Varningsregler

[← Tillbaka till ODINhv-index](00-index)

*Senast uppdaterad: 2026-07-04*

---

## Vem gör vad

- **Admin** — skapar, redigerar och tar bort varningsregler via **⚠ Varningsregler** (nås från vänster sidebar, längst ner).
- **Alla roller** (reader/editor/admin) — ser aktiva varningar i sidebaren och kan kvittera dem.

Varningar utvärderas automatiskt efter varje dataskördning (`afterHarvest()` körs efter alla skördekällor) — man behöver alltså inte manuellt trigga en kontroll.

## De tre regeltyperna

### Tröskel (threshold)

Fält: **Störningspoäng ≥ X**

Kontrollerar varje kommuns störningspoäng (samma `score` som choropleth-kartan visar, se [Analys & störningsscore](01-analys-och-storningsscore.md)) mot ett tröskelvärde. Om en kommun ligger på eller över tröskeln skapas en varning: *"Störningspoäng X i [kommun] överstiger tröskeln Y"*.

**Exempel:** en regel med tröskel `3` triggar så fort en kommuns störningspoäng passerar 3 — oavsett om det beror på elavbrott, trafik eller en kombination.

### Proximity (närhet)

Fält: **Lager**, **Lägsta kritikalitet på kritiskt objekt** (gul/röd), **Avstånd (m)**

Letar efter kartobjekt i det valda lagret som ligger inom angivet avstånd från en feature märkt med minst den valda kritikaliteten. Ger en varning per drabbat objekt: *"[objekt] ([lager]) är inom X m från kritiskt objekt [namn] ([kritikalitet])"*.

**Exempel:** lager `road_situations`, kritikalitet `röd`, avstånd `500` — varnar så fort en trafikhändelse dyker upp inom 500 m från en röd-märkt bro.

### Kluster (cluster)

Fält: **Lager**, **Antal händelser (min)**, **Radie (m)**

Använder spatial klustring (`ST_ClusterDBSCAN`, meterkorrekt via SWEREF99 TM) för att hitta grupper av minst angivet antal händelser inom given radie i samma lager — bra för att upptäcka "något större pågår här" som en enskild händelse inte visar.

**Exempel:** lager `police_events`, antal `3`, radie `2000` — varnar om minst 3 polishändelser dyker upp inom 2 km från varandra.

## Hur en varning visas

- **Transient notis** — en tillfällig banderoll (`AlertBanner`) dyker upp när en ny varning skapas, kan avfärdas eller kvitteras direkt.
- **Persistent lista** — under "⚠ Varningar" i vänster sidebar, kvarstår tills den kvitteras.

## Kvittering och dedup

Samma regel+objekt-kombination skapar bara **en** öppen varning i taget (deduplicering på databasnivå). Om villkoret fortfarande gäller nästa gång reglerna körs skapas ingen ny varning — men om varningen kvitteras och villkoret sedan uppstår igen (t.ex. en ny händelse dyker upp), triggas en ny varning.

> **Testa en regel direkt:** Admin kan trigga en manuell utvärdering av alla regler utan att vänta på nästa skördning — användbart när man just skapat eller ändrat en regel och vill se att den fungerar som tänkt.
