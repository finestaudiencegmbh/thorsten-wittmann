# Thorsten Wittmann Scaling — Lead- & Kampagnen-Dashboard

Liest das Google Tracking Sheet live aus, führt die Leads über die UTM-Werte mit
den Meta-Ads-Daten zusammen und wertet sie nach Funnel, Kampagne,
Anzeigengruppe, Creative und Placement aus. Sortier- und filterbar, mit
CSV-Export.

**Zwei Funnels:** `CCC` und `AKD` liegen in getrennten Sheet-Tabs und bekommen
je einen Unterreiter. Das Hauptdashboard („Gesamt") summiert beide.

**Webinar-Leads zählen ab 01.10.2026.** Davor lagen im Tab
`Leads CCC Webinar 10.10.26` nur Kampagnenname und Quelle vor, keine
Anzeigengruppe und kein Creative. Gesteuert über `sheet.ignoreBefore` in
`project.config.json` — die CCC/AKD-Historie seit August bleibt unberührt.

**Traffic-Quellen** werden getrennt ausgewiesen: Meta (Kosten via API, bildet
den CPL), Google (bezahlt, Kosten nicht angebunden — bewusst **nicht** im CPL)
und Organisch.

> Diese Codebasis ist wiederverwendbar. Alles Projektspezifische steht in
> **`project.config.json`**. Für ein neues Projekt: **[TEMPLATE.md](TEMPLATE.md)**
> — dort stehen auch alle Environment-Variablen.


## Was die App kann

- **KPIs auf einen Blick:** zugeordneter Adspend, Leads, CPL — getrennt nach
  Meta, Google und Organisch. Ticket- und Qualitäts-KPIs erscheinen nur, wenn
  die entsprechenden Feature-Flags aktiv sind.
- **Breakdown nach Kampagne / Anzeigengruppe / Creative / Placement** – jeweils
  als sortierbare Tabelle. Zeile anklicken = sofort danach filtern.
- **Lead-Qualität (0–100)** *(nur bei `hasQuality: true` — in diesem Projekt aus):*
  berechnet aus Einkommen, investiertem Kapital,
  Immobilienbesitz und Beschäftigung (alles anpassbar, siehe unten). Einteilung
  in Tiers A–D.
- **Filter:** Quelle (bezahlt/organisch), Kampagne, Anzeigengruppe, Creative,
  Placement, Zeitraum — sowie Einkommen/Immobilien/Beschäftigung/Tier, sofern
  das Qualitäts-Feature aktiv ist,
  Volltextsuche.
- **Lead-Detailtabelle** (aufklappbar) und **CSV-Export**.
- **Demo-Modus:** ohne jede Einrichtung sofort mit Beispieldaten ansehbar.

---

## Gehostet teilen — empfohlen (kein lokales Setup)

Damit du eine **teilbare URL mit Passwort** bekommst, ohne lokal etwas zu
installieren. Wir nutzen **Render** (kostenloser Tarif).

1. Account auf <https://render.com> anlegen und **GitHub verbinden**.
2. **New + → Blueprint** → dieses Repository (`thorsten-wittmann`) auswählen und
   den Branch wählen, auf dem `render.yaml` liegt.
   Render liest die mitgelieferte `render.yaml` automatisch.
3. Beim Anlegen die abgefragten Werte (Secrets) ausfüllen:
   - `DASHBOARD_USER` und `DASHBOARD_PASSWORD` → frei wählbar. Das ist das Login,
     das du beim Teilen weitergibst.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` → den kompletten Inhalt der Service-Account-
     JSON-Datei (siehe unten) als **eine Zeile** einfügen. *(Leer lassen = es
     startet erstmal im Demo-Modus.)*
4. **Apply / Create** → Render baut und startet. Nach 1–2 Minuten bekommst du
   eine URL wie `https://thorsten-wittmann-dashboard.onrender.com`.
5. URL + Login an dein Team weitergeben. Fertig.

> Hinweis: Im kostenlosen Render-Tarif „schläft" der Dienst nach ~15 Minuten
> ohne Zugriff ein und braucht beim nächsten Aufruf ~30 Sek. zum Aufwachen.
> Für „immer sofort da" gibt es einen günstigen Always-on-Tarif (ab ~7 $/Monat).

Andere Hoster (Railway, Fly.io, eigener Server) funktionieren genauso – die App
ist ein normaler Node-Server (`npm install && npm run build && npm start`).

---

## Lokal starten (Alternative, Demo-Modus)

```bash
npm install
npm run serve
```

Dann **http://localhost:3000** öffnen. Es werden synthetische Beispieldaten
angezeigt (oben rechts „DEMO-Daten"). So siehst du das Dashboard sofort, bevor
du die Google-Anbindung einrichtest.

---

## Echte Daten anbinden (Google Sheets)

Damit die App live aus dem Sheet liest, brauchst du einen **Service-Account**
(einmalige Einrichtung, ~10 Minuten):

### 1. Google-Cloud-Projekt & Service-Account anlegen
1. Auf <https://console.cloud.google.com> ein Projekt anlegen (oder vorhandenes nutzen).
2. Unter **APIs & Dienste → Bibliothek** die **Google Sheets API** aktivieren.
3. Unter **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
   Dienstkonto** ein Service-Account anlegen.
4. Beim Service-Account → **Schlüssel → Schlüssel hinzufügen → JSON** einen
   Schlüssel erzeugen und herunterladen.
5. Die heruntergeladene Datei ins Projekt legen, z. B. als
   `service-account.json` (diese Datei ist bereits in `.gitignore` und wird
   **nie** committet).

### 2. Sheet für den Service-Account freigeben
In der JSON-Datei steht eine `client_email` (Form `...@...gserviceaccount.com`).
Diese E-Mail im Google Sheet über **Teilen** als **Betrachter** hinzufügen.

### 3. `.env` anlegen
```bash
cp .env.example .env
```
und ausfüllen:
```env
SPREADSHEET_ID=1rxK4s-qh1Enbw5L_Ni37xikPEpFe82-5w_7GT-PX6ng
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

### 4. Starten
```bash
npm run serve
```
Oben rechts sollte jetzt **„Stand: …"** mit dem echten Ladezeitpunkt stehen
(kein „DEMO"-Badge mehr). Über **↻ Aktualisieren** holst du frische Daten.

---

## Wie das Sheet gelesen wird

Die App erkennt die Tabellen **automatisch an ihren Kopfzeilen** – Tab-Namen
oder Reihenfolge dürfen sich ändern:

| Tabelle | erkannt an | liefert |
| --- | --- | --- |
| Anzeigengruppen-Übersicht | `Anzeigengruppe` + `Adspend` | Adspend, Klicks, CPC … je Anzeigengruppe |
| Leads | `Gewonnen am` + `utm_source` | Lead + Attribution (UTM) |

**Attribution über UTM:**
`utm_campaign` = Kampagne · `utm_source` = Anzeigengruppe ·
`utm_medium` = Creative · `utm_term` = Placement.

In diesem Projekt sind Tickets über `features.hasTickets` **abgeschaltet**.
Das Fragebogen-Scoring (`features.hasQuality`) ist **aktiv** und speist den
Reiter „Leadqualität" aus dem Sheet-Tab `Umfrage CCC Webinar 10.10.26`. Die Logik bleibt im Code
und lässt sich per Config wieder einschalten (siehe TEMPLATE.md).

Historisch (bei aktiven Flags): Leads und Tickets werden über die **E-Mail** zusammengeführt (Funnelcockpit-
und Typeform-Mail werden beide berücksichtigt, falls sich Tippfehler
unterscheiden). Adspend wird je **Anzeigengruppe** zugeordnet; auf Creative-/
Placement-Ebene liefert ihn die Facebook-Anbindung (Phase 2).

---

## Lead-Qualität anpassen (nur bei `hasQuality: true`)

Das Modell ist regelbasiert (`config/scoring.json`):

| Tier | Regel |
|---|---|
| **A** | Investitionssumme **ab 2.000 €/Monat** UND Nettovermögen **ab 100.000 €** |
| **B** | eines von beiden — oder beide Geldfragen ohne Angabe |
| **C** | darunter, investiert aber grundsätzlich |
| **D** | investiert noch gar nicht |

Beruf „Schüler / Student / Azubi" zieht eine Stufe ab. **Alter fließt bewusst
nicht ein** — bei Vermögensschutz sagt das Vermögen mehr aus als das
Geburtsjahr; Rentner und Privatiers können A erreichen. „Möchte ich nicht
angeben" wirkt neutral: blockiert A, verhindert kein B und zieht nie nach D.
Der angezeigte Score (0–100) ist nur Sortier- und Mittelwert-Hilfe — maßgeblich
ist der Tier.

Das Bewertungsmodell steht in [`config/scoring.json`](config/scoring.json) –
**kein Code nötig**. Du kannst Gewichte, Einkommens-Skalierung und die
Tier-Grenzen (A–D) frei ändern. Nach dem Speichern im Dashboard **↻ Aktualisieren**.

Standardgewichtung: Einkommen 40 %, investiertes Kapital 25 %,
Immobilienbesitz 20 %, Beschäftigung 15 %. Fehlende Antworten werden fair
herausgerechnet (das Ergebnis wird auf die vorhandenen Dimensionen normiert).

---

## Entwicklung

```bash
npm run dev    # Vite (Port 5173) + API (Port 3000) mit Hot-Reload
npm test       # Parser-/Dataset-Tests gegen die echte Sheet-Struktur
```
Im Dev-Modus **http://localhost:5173** öffnen (Anfragen an `/api` werden
automatisch an den Server weitergeleitet).

### Optionaler Passwortschutz
Für `DASHBOARD_USER` / `DASHBOARD_PASSWORD` in der `.env` setzen → Basic-Auth.

---

## Facebook-Ads-Daten via Supermetrics

Implementiert in [`server/supermetrics.js`](server/supermetrics.js). Wenn
konfiguriert, holt das Dashboard **Spend, Impressionen, Klicks und Placement**
live aus der Supermetrics-API und führt sie über die Namen
(Kampagne/Anzeigengruppe/Creative/Placement) mit den Leads zusammen. Damit gibt
es CPM, CTR und CPL **bis auf Creative- und Placement-Ebene** –
ohne manuelles Pflegen des Adspends im Sheet. Kein Meta-Token nötig,
Supermetrics übernimmt die Facebook-Authentifizierung.

**Einrichtung:**
1. In Render (oder `.env`) setzen:
   - `SUPERMETRICS_API_KEY` – dein Supermetrics-API-Key
   - `SUPERMETRICS_DS_ACCOUNTS` – Ad-Account(s), z. B. `act_1234567890`
   - `SUPERMETRICS_DS_USER` – der verbundene Supermetrics-User
2. **Zuverlässigste Variante:** im Supermetrics-Query-Builder eine Facebook-Ads-
   Abfrage bauen (Felder: Campaign name, Ad set name, Ad name, Publisher
   platform, Placement, Cost, Impressions, Clicks, Date), als JSON exportieren
   und in `SUPERMETRICS_QUERY_JSON` einfügen. Das hat Vorrang vor den Defaults.
3. Alternativ die Default-Felder in [`config/supermetrics.json`](config/supermetrics.json)
   anpassen. Die Spaltenzuordnung (`columnRoles`) matcht die zurückgegebenen
   **Anzeigenamen** – robust gegenüber abweichenden Feld-IDs.

Solange nichts gesetzt ist, läuft alles wie gehabt (Adspend je Anzeigengruppe
aus dem Sheet). Schlägt die Supermetrics-Abfrage fehl, bleibt das Dashboard
voll funktionsfähig und zeigt oben einen Hinweis.

> Hinweis (v1): Der FB-Spend wird über das eingestellte Zeitfenster
> (`lookbackDays`) je Dimension summiert und folgt noch nicht dem Datumsfilter
> im Dashboard. Die Namens-Zuordnung von Placement (Plattform + Position) ist
> „best effort"; passt sie bei euch nicht exakt, lässt sie sich in
> `config/supermetrics.json` justieren.

---

## Projektstruktur

```
project.config.json     Zentrale Projekt-Config: Name, Branding, Feature-Flags,
                        Sheet-Spalten, Funnels, Traffic-Quellen (siehe TEMPLATE.md)
config/scoring.json     Bewertungsmodell für die Lead-Qualität (nur bei hasQuality)
config/supermetrics.json  Facebook-Ads-Abfrage (Felder, Spaltenzuordnung)
server/                 Node-Backend
  sheets.js             Google-Sheets-Anbindung (Service-Account)
  parser.js             erkennt & parst die Tabellen
  project-config.js     Lädt project.config.json (mit Defaults)
  build.js              Join Leads ↔ Adspend, Traffic-Bucket, Funnel, Qualität
  scoring.js            Berechnung der Lead-Qualität
  supermetrics.js       Facebook-Ads-Daten via Supermetrics-API
  sample-data.js        synthetische Demo-Daten
  index.js              Express-Server (API + Auslieferung)
  parser.test.mjs       Tests
web/                    React-Frontend (Vite)
```
