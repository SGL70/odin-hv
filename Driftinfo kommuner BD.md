# Driftinformation – Kommuner i Norrbottens län (BD)

Sammanställning av hur driftinformation (störningar, avbrott, varningar) kan konsumeras
från Norrbottens 14 kommuner. Syfte: integration i ledningssystemet (resurslage.jv10.se).

**Senast uppdaterad:** 2026-06-30

---

## Tabell: Källor per kommun

| Kommun | Driftsida | SMS-tjänst | Scrape-svårighet | Extern leverantör | Rekommenderad metod |
|--------|-----------|------------|------------------|-------------------|---------------------|
| **Luleå** | [Lumire VA](https://lumire.se/driftinformation/) · [Luleå Energi el](https://www.luleaenergi.se/driftinformation) · [Lunet fiber](https://status.lunet.se/) | ✅ Lumire SMS | Enkel HTML-lista | Lumire, Luleå Energi, Lunet, LLT | Scrape Lumire + Lunet status-sida |
| **Piteå** | [Pireva VA](https://www.pireva.se/driftinfo/) · [PiteEnergi el](https://www.piteenergi.se/driftinformation/) | – | Enkel HTML-lista | Pireva, PiteEnergi | Scrape Pireva |
| **Boden** | [Bodens Energi el](https://bodensenergi.se/driftinformation/) · [Bodens Stadsnät fiber](https://www.bodensstadsnat.se/driftinformation/) | – | Enkel + avbrottskarta (ny mars 2026) | Bodens Energi, Bodens Stadsnät | Scrape Bodens Energi |
| **Kiruna** | [TVAB VA+värme+avfall](https://www.tekniskaverkenikiruna.se/om-oss/kundservice/driftinformation) · [Kiruna kommun](https://kiruna.se/gironet/startsida/driftinformation.html) | ✅ TVAB SMS | Enkel HTML | Tekniska Verken i Kiruna (TVAB) | Scrape TVAB |
| **Gällivare** | [dunderNET + kommunal](https://gallivare.se/dundernet/privat/driftinformation) | ✅ Kommunal SMS | Enkel HTML | dunderNET (kommunalt) | Scrape + SMS-prenumeration |
| **Kalix** | [Kalix driftsstörningar](https://www.kalix.se/Aktuellt/Driftstorningar/) (karta) · [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | – | Karta (ev. JS) | IT Norrbotten (fiber) | Scrape + IT Norrbotten-portal |
| **Älvsbyn** | [Älvsbyns Energi](https://www.alvsbynsenergi.se/) (VA + el) · [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | – | Okänd | Älvsbyns Energi, IT Norrbotten | Scrape Älvsbyns Energi |
| **Haparanda** | [haparanda.se/driftmeddelanden](https://www.haparanda.se/driftmeddelanden) (trafik, VA, bygg) | – | Enkel HTML | Vattenfall Eldistribution (el) | Scrape |
| **Övertorneå** | Ingen dedikerad sida hittad | – | – | Vattenfall Eldistribution (el) | Vattenfall API/karta |
| **Pajala** | [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | – | Enkel HTML | IT Norrbotten (fiber) | Scrape IT Norrbotten |
| **Jokkmokk** | [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | – | Enkel HTML | IT Norrbotten (fiber) | Scrape IT Norrbotten |
| **Arjeplog** | [arjeplog.se/nyheter](https://arjeplog.se/nyheter/) (generella nyheter) | – | Fri text | Vattenfall Eldistribution (el) | Vattenfall API/karta |
| **Arvidsjaur** | [Kommunal driftstörning](https://arvidsjaur.se/byggabomiljo/aktuelladriftstorningar.773.html) · [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | – | Enkel HTML | IT Norrbotten (fiber), Vattenfall (el) | Scrape båda |
| **Överkalix** | [IT Norrbotten fiber](https://itn.stadsnatsportalen.se/atlas/status/?id=4177) | ✅ Kommunal SMS (VA) | Enkel HTML | IT Norrbotten (fiber) | Scrape IT Norrbotten + SMS-prenumeration |

---

## Analys

### IT Norrbotten Stadsnät – det dolda gemensamma systemet

Nytt fynd: **IT Norrbotten** (`itn.stadsnatsportalen.se`) är ett gemensamt fiber/bredband-
statussystem som täcker **6 av de 7 vita fläckarna** med ett enda anrop:

- **Täcker:** Arvidsjaur, Kalix, Älvsbyn, Jokkmokk, Pajala, Överkalix
- **Central statussida:** https://itn.stadsnatsportalen.se/atlas/status/?id=4177
- **Individuella portaler per kommunalt nät:**

| Nät | URL |
|-----|-----|
| Arvidsjaur Stadsnät | https://arvidsjaurstadsnat.stadsnatsportalen.se |
| Kalix (KalixNet) | http://www.kalixnet.se |
| Älvsbyn (ÄlvsbyNet) | http://www.alvsbynet.se |
| Jokkmokk (JokkNet) | http://www.jokknet.se |
| Pajala Stadsnät | http://www.pajalastadsnat.se |
| Överkalix | https://overkalix.stadsnatsportalen.se |

Sidorna är enkel server-renderad HTML — scrapebara. Plattformen erbjuder SMS/e-post-
prenumeration men har inget öppet API för driftstörningsdata.

> **Obs:** Stadsnätsportalen har ett API, men det täcker adresser/beställningar — inte störningar.

### Överkalix SMS-tjänst (VA)

Överkalix erbjuder automatiska SMS vid vattenläckor och planerade VA-arbeten:
- Folkbokförda får SMS automatiskt
- Övriga (fritidshus, omregistrerade nr) kan anmäla via kommunens webb eller 0926-740 00
- Källa: https://www.overkalix.se/nyheter/2025/05/sms-tjanst-vid-driftstorningar/
- Ingen API/programmatisk åtkomst dokumenterad — sannolikt samma SMS-plattform som
  Gällivare och TVAB Kiruna

### avbrott.se – samlad el-täckning för hela Norrbotten ✅ LÖST

**Öppet JSON-API, ingen autentisering:** `https://avbrott.se/api/outages`

- Täcker **27 svenska elnätsleverantörer** inkl. Vattenfall + PiteEnergi
- Returnerar lat/lng + **polygon** per avbrott (exakt påverkat område)
- Fält: `provider`, `county`, `municipality`, `placenames`, `affected_customers`, `status_label`, `free_text`, `start_time`, `completion_time`, `is_planned`, `is_ended`
- Uppdateras var 60:e sekund
- **Implementerat** i ledningssystemet som `power_outages`-layer med bbox-filter för Norrbotten (65–68.5°N, 17–24.5°E)
- ~85 aktiva BD-avbrott vid test 2026-07-01

Vattenfall Eldistributions egna API: inget offentligt dokumenterat.

---

## Tre nivåer av genomförbarhet

### Nivå 1 – Skrapbara driftsidor (realistiskt nu)

| Källa | Täcker | URL | Typ |
|-------|--------|-----|-----|
| Lumire | Luleå VA | https://lumire.se/driftinformation/ | HTML-lista |
| Pireva | Piteå VA+avfall | https://www.pireva.se/driftinfo/ | HTML-lista |
| Bodens Energi | Boden el+fjärrvärme | https://bodensenergi.se/driftinformation/ | HTML + avbrottskarta |
| TVAB | Kiruna VA+värme+avfall | https://www.tekniskaverkenikiruna.se/om-oss/kundservice/driftinformation | HTML |
| dunderNET | Gällivare kommunal+fiber | https://gallivare.se/dundernet/privat/driftinformation | HTML |
| Kalix kommun | Kalix kommunal | https://www.kalix.se/Aktuellt/Driftstorningar/ | HTML+karta |
| Lunet | Luleå fiber | https://status.lunet.se/ | Statussida (Statuspage/Freshstatus — trolig JSON-endpoint) |
| **IT Norrbotten** | **Arvidsjaur, Kalix, Älvsbyn, Jokkmokk, Pajala, Överkalix fiber** | https://itn.stadsnatsportalen.se/atlas/status/?id=4177 | **HTML, ett anrop täcker 6 kommuner** |

### Nivå 2 – SMS/e-postavisering (manuell prenumeration)

Kan inte konsumeras programmatiskt utan mailparser eller SMS-gateway:

| Aktör | Täcker | Info |
|-------|--------|------|
| Lumire | Luleå VA | https://lumire.se/sms-utskick-drifstorning-lulea/ |
| TVAB | Kiruna VA+värme | https://www.tekniskaverkenikiruna.se/om-oss/kundservice/information-via-sms |
| Gällivare kommun | Gällivare kommunal | https://gallivare.se/omsorg-och-stod/akut-hjalp-och-krisstod/kristeam-och-krishantering/sms-tjanst-vid-samhallsstorningar |
| Överkalix kommun | Överkalix VA | https://www.overkalix.se/nyheter/2025/05/sms-tjanst-vid-driftstorningar/ |

### Nivå 3 – Vita fläckar (el i glesbygd)

Haparanda, Övertorneå, Arjeplog saknar dedikerade kommunala driftsidor.
Enda rimliga alternativen för el-avbrott:
- Vattenfall Eldistribution karta (kräver webbläsarinspek­tion för att hitta JSON-endpoint)
- Lokal nyhetssajt **HBwebben.se** täcker Haparanda/Övertorneå/Pajala/Kalix/Överkalix:
  https://hbwebben.se/tag/stromavbrott/

---

## Prioriterad implementationsordning

```
Fas 1 – Scrape (enkel HTML, hög täckning):
  lumire.se                   → Luleå VA
  pireva.se                   → Piteå VA+avfall
  bodensenergi.se             → Boden el+fjärrvärme
  tekniskaverkenikiruna.se    → Kiruna VA+värme+avfall
  gallivare.se/dundernet      → Gällivare kommunal+fiber
  kalix.se                    → Kalix kommunal
  itn.stadsnatsportalen.se    → Arvidsjaur/Kalix/Älvsbyn/Jokkmokk/Pajala/Överkalix FIBER

Fas 2 – Vattenfall (täcker 6–8 kommuner för el med ett anrop):
  Inspektera nätverkstrafik på vattenfalleldistribution.se för JSON-endpoint
  alt. kontakta Vattenfall om partner-API

Fas 3 – Vita fläckar (VA i glesbygd):
  Kontakta Arjeplog, Haparanda, Övertorneå direkt
  Övriga (Pajala, Arvidsjaur, Jokkmokk, Överkalix) har fiber via IT Norrbotten
  men VA saknar öppen kanal — direktkontakt med respektive VA-enhet
```

---

## SMS-webhook via 46elks

46elks (https://46elks.se) används som SMS-gateway för att ta emot aviseringar programmatiskt.

**Arkitektur:**
```
Kommunens SMS-system → 46elks inkommande nummer → webhook POST → /api/sms/incoming → DB (sms_alerts-layer)
```

**Webhook-endpoint:** `https://resurslage.jv10.se/api/sms/incoming`  
**OBS:** Kräver bypass-regel i Cloudflare Access (Zero Trust) för att tillåta externa POST-anrop.  
→ CF Zero Trust: Access → Applications → resurslage.jv10.se → lägg till Bypass-policy för `/api/sms/incoming`

**Implementerat (2026-06-30):**
- `backend/src/routes/sms.js` — tar emot 46elks form-urlencoded payload, svarar `{action:noresponse}`
- Sparar till DB-layer `sms_alerts` med koordinat per känd avsändare (konfigurerbar i `KNOWN_SENDERS`)
- Okänd avsändare → Norrbotten-centrum (66.83°N, 20.40°E) som fallback
- WebSocket-notis vid mottagning (kartan uppdateras i realtid)

**Nästa steg:**
1. Aktivera CF Access bypass
2. Testa live-SMS
3. Registrera 46elks-numret som mottagare hos: Överkalix VA, TVAB Kiruna, Lumire Luleå, Gällivare kommun
4. Notera avsändarnummer och fyll in `KNOWN_SENDERS` i `sms.js`

**Tipslinje:** Samma webhook kan ta emot tips från allmänheten (okänd avsändare → sms_alerts, koordinat Norrbotten-centrum).

---

## Källor

- [Lumire driftsinformation](https://lumire.se/driftinformation/)
- [Pireva driftsinformation](https://www.pireva.se/driftinfo/)
- [Bodens Energi driftsinformation](https://bodensenergi.se/driftinformation/)
- [Bodens Stadsnät driftsinformation](https://www.bodensstadsnat.se/driftinformation/)
- [Tekniska Verken Kiruna driftsinformation](https://www.tekniskaverkenikiruna.se/om-oss/kundservice/driftinformation)
- [Kiruna kommun driftsinformation](https://kiruna.se/gironet/startsida/driftinformation.html)
- [Gällivare dunderNET driftsinformation](https://gallivare.se/dundernet/privat/driftinformation)
- [Kalix driftsstörningar](https://www.kalix.se/Aktuellt/Driftstorningar/)
- [Älvsbyns Energi](https://www.alvsbynsenergi.se/)
- [IT Norrbotten Stadsnät – central statussida](https://itn.stadsnatsportalen.se/atlas/status/?id=4177)
- [Arvidsjaur Stadsnät](https://arvidsjaurstadsnat.stadsnatsportalen.se)
- [Överkalix SMS-tjänst vid driftstörningar](https://www.overkalix.se/nyheter/2025/05/sms-tjanst-vid-driftstorningar/)
- [Vattenfall Eldistribution pågående strömavbrott](https://www.vattenfalleldistribution.se/stromavbrott/pagaende-stromavbrott/)
- [avbrott.se – Vattenfall](https://avbrott.se/stromavbrott/vattenfall)
- [Lunet statusida](https://status.lunet.se/)
- [PiteEnergi driftsinformation](https://www.piteenergi.se/driftinformation/)
- [HBwebben.se – störningar](https://hbwebben.se/tag/stromavbrott/)
- [Stadsnätsportalen API-dokumentation](https://www.stadsnatsportalen.se/pages/api)
