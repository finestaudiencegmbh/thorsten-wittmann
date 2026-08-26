# Template-Anleitung: neues Dashboard aus dieser Codebasis

Diese Codebasis ist ein wiederverwendbares Lead- & Kampagnen-Dashboard.
Alles Projektspezifische steckt in **einer** Datei: `project.config.json`.
Der Rest — Meta-API-Anbindung, UTM-Attribution, Charts, KI-Chatbot — bleibt
unverändert.

Für ein neues Projekt: Repo kopieren, die sechs Schritte unten abarbeiten,
deployen. Kein Code-Fork nötig.

---

## 1. `project.config.json` ausfüllen

```jsonc
{
  "name": "Projektname",                    // Kopfzeile, Browser-Tab, Basic-Auth-Realm
  "subtitle": "Lead-Dashboard",             // Zeile darunter

  "branding": {
    "accent": "#f79800",                    // EINE Farbe – alle Abstufungen werden daraus berechnet
    "surface": "#163358",                   // optionaler zweiter Ton für Panels/Hintergrund ("" = Standard-Dunkel)
    "logo": "/logo.svg"
  },

  "features": {
    "hasTickets": false,                    // Ticket-/Upsell-Stufe im Funnel?
    "hasQuality": false                     // Fragebogen + Lead-Scoring?
  },

  "funnels": [ /* siehe Abschnitt 3 – leere Liste = ein einzelner Funnel */ ],

  "sheet": { /* siehe Abschnitt 2 */ },
  "trafficSources": [ /* siehe Abschnitt 4 */ ]
}
```

### Die zwei Feature-Flags

| Flag | `false` blendet aus |
|---|---|
| `hasTickets` | Ticket-KPIs, €/Ticket, Kosten/Ticket, CVR Ticket, Ticket-Spalten in allen Tabellen, Ticket-Serien in den Charts, Ticket-Zahlen im KI-Kontext |
| `hasQuality` | Quali-Rate, Ø Quali, Tier-Badges, Qualitäts-Verteilung, Fragebogen-Filter, Antwort-Spalten im CSV-Export |

Die Felder verschwinden **komplett** aus Datensatz und API-Payload — sie laufen
nicht als `0`/`null` mit. Wer `hasTickets: false` setzt, sieht nirgends eine
leere Ticket-Spalte.

> **Achtung:** Das Scoring hängt am Ticket-/Fragebogen-Datensatz. `hasQuality: true`
> zusammen mit `hasTickets: false` ist derzeit **nicht** unterstützt — dafür müsste
> die Fragebogen-Tabelle erst von der Ticket-Tabelle entkoppelt werden.

---

## 2. Sheet-Spalten mappen

Der Parser erkennt Tabellen an ihrer **Kopfzeile**, nicht am Tab-Namen. Jedes
Feld akzeptiert mehrere Schreibweisen — der erste Treffer gewinnt:

```jsonc
"sheet": {
  "leadColumns": {
    "wonAt":       ["gewonnen am", "datum"],   // Pflicht: ohne Datum wird die Tabelle nicht erkannt
    "firstName":   ["vorname"],
    "lastName":    ["nachname"],
    "email":       ["e-mail", "email"],
    "utmSource":   ["utm_source"],
    "utmMedium":   ["utm_medium"],
    "utmCampaign": ["utm_campaign"],
    "utmTerm":     ["utm_term"],
    "utmContent":  ["utm_content"]
  },
  "decodePlusAsSpace": true
}
```

Vergleich ist case-insensitiv, Doppelleerzeichen und `?:.` werden ignoriert.

### `decodePlusAsSpace` — vorher prüfen!

Manche Sheets speichern UTM-Werte URL-kodiert:

```
CCC+EWeb+|+CBO+|+LeadCon      statt      CCC EWeb | CBO | LeadCon
```

Die Meta-API liefert **echte Leerzeichen**. Ohne Rückwandlung matchen solche
Leads nicht gegen ihre Kampagne — die Attribution bricht still zusammen, das
Dashboard zeigt einfach zu wenig zugeordnete Leads. Beide Schreibweisen können
im selben Sheet vorkommen.

**Prüfen:** eine Handvoll `utm_campaign`-Werte ansehen. Enthalten sie `+`
zwischen Wörtern → `true`.

### Bei `hasQuality: true` zusätzlich

```jsonc
"ticketColumns":        { "at": ["teilgenommen am"], "email": ["e-mail (funnelcockpit)"], … },
"questionnaireColumns": { "income": ["monatliches einkommen"], … },   // Sheet-Spalte je Antwortfeld
"questionnaireLabels":  { "income": "Monatliches Einkommen", … }      // Beschriftung in UI + CSV
```

Die Schlüssel in `questionnaireColumns` müssen zu den Feldnamen in
`config/scoring.json` passen. Ohne passenden Eintrag in `questionnaireLabels`
zeigt die Oberfläche den rohen Feldnamen.

---

## 3. Funnels (optional)

Mehrere parallele Funnels im selben Sheet? Dann bekommt jeder einen
Unterreiter; das Hauptdashboard („Gesamt") summiert alle.

```jsonc
"funnels": [
  { "id": "CCC", "label": "CCC", "sheetTab": "ccc", "match": ["ccc"] },
  { "id": "AKD", "label": "AKD", "sheetTab": "akd", "match": ["akd"] }
]
```

Zwei verschiedene Zuordnungswege — das ist Absicht:

| Was | Zuordnung über | Warum |
|---|---|---|
| **Leads** | `sheetTab` (Teilstring des Tab-Titels) | Leads aus Reoptin-Mails, Newslettern oder Google Ads tragen oft **kein** Funnel-Kürzel in den UTMs. Über den Kampagnennamen würden sie aus allen Funnels herausfallen. |
| **Meta-Spend** | `match` (Teilstrings im Kampagnennamen) | Meta kennt eure Sheet-Tabs nicht. Der Kampagnenname ist die einzige Brücke. |

Voraussetzung: pro Funnel ein eigener Sheet-Tab, und die Meta-Kampagnennamen
enthalten das Kürzel. `"funnels": []` schaltet die Unterreiter ab.

---

## 4. Traffic-Quellen

Ohne Eintrag gilt: alles mit Pipe-Schema im UTM = bezahlt, Rest = organisch.
Mit Einträgen wird nach Quelle unterschieden:

```jsonc
"trafficSources": [
  { "id": "meta",   "label": "Meta",   "paid": true, "hasSpend": true,
    "match": ["meta", "facebook", "instagram"], "mediums": ["ppc", "cpc", "paid"] },
  { "id": "google", "label": "Google", "paid": true, "hasSpend": false,
    "match": ["google", "youtube"],             "mediums": ["cpc", "ppc", "paid"] }
]
```

`hasSpend` ist der wichtige Schalter:

- `true` → Kosten sind angebunden (Meta-API). Diese Leads bilden den **CPL**.
- `false` → bezahlt, aber Kosten unbekannt (z. B. Google Ads ohne API).
  Eigener Bucket `other-paid`: sichtbar als eigene KPI-Sektion, **nicht** im CPL.

Ohne diese Trennung würden Google-Leads entweder den CPL verfälschen (als
„paid" gezählt, ohne dass ihre Kosten im Spend stecken) oder als kostenlos
erscheinen (als „organisch" gezählt).

### `mediums` — nicht weglassen

`match` läuft gegen `utm_source`, wobei ein Präfix genügt (`google` trifft
`googled`, `googleg`, `googleytis`). Genau deshalb braucht es `mediums`:
**dieselbe Plattform taucht bezahlt und organisch auf.**

| utm_source | utm_medium | ohne `mediums` | mit `mediums` |
|---|---|---|---|
| `meta` | `ppc` | Meta (paid) | Meta (paid) ✓ |
| `instagram` | `organic` | **Meta (paid)** ✗ | organisch ✓ |
| `youtube.com` | `social` | **Google (paid)** ✗ | organisch ✓ |

Ist `mediums` gesetzt, muss das `utm_medium` **exakt** einem der Werte
entsprechen, sonst greift die Quelle nicht und der Lead fällt auf die
Standard-Heuristik zurück. Vor dem Setzen einmal die tatsächlich vorkommenden
`utm_source`/`utm_medium`-Paare im Sheet auszählen — das dauert zwei Minuten und
verhindert still verfälschte CPLs.

---

## 5. Logo & Restarbeiten

- `web/public/logo.svg` ersetzen. **Farben fest ins SVG schreiben** — ein per
  `<img>` eingebundenes SVG erbt keine Seitenfarben, `currentColor` würde zu
  Schwarz auflösen und auf dunklem Grund verschwinden.
- `config/campaigns.json`: welche Meta-Ziele als Lead-Kampagne zählen
  (steuert, welcher Spend in den CPL einfließt).
- `config/scoring.json`: nur bei `hasQuality: true` relevant.
- `package.json` → `name`, `render.yaml` → `name`.

---

## 6. Environment-Variablen

### Pflicht

| Variable | Wert |
|---|---|
| `SPREADSHEET_ID` | ID aus der Sheet-URL zwischen `/d/` und `/edit` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Kompletter Service-Account-Key als **eine Zeile** JSON |

Ohne diese beiden startet das Dashboard im **Demo-Modus** mit synthetischen
Daten — praktisch zum Ansehen, aber es sind keine echten Zahlen (Badge „DEMO"
oben im Kopf).

**Service-Account einrichten:** Google Cloud Console → neues Projekt → Google
Sheets API aktivieren → Service Account anlegen → JSON-Key erzeugen → **das
Sheet für die `client_email` des Service Accounts freigeben** (Leseberechtigung
genügt). Der letzte Schritt wird am häufigsten vergessen; ohne ihn kommt ein
403 vom Sheets-API.

Lokal statt `GOOGLE_SERVICE_ACCOUNT_JSON` auch möglich:
`GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` (Pfad zur Key-Datei —
die Datei gehört **nicht** ins Git, sie steht in `.gitignore`).

### Meta Marketing API (für Adspend, CPL, Kampagnen-Hierarchie)

| Variable | Wert |
|---|---|
| `META_ACCESS_TOKEN` | Token mit Berechtigung `ads_read` |
| `META_AD_ACCOUNT_ID` | Ad-Account **inkl. `act_`-Präfix**, z. B. `act_799222403469426` |
| `META_API_VERSION` | optional, Standard `v21.0` |
| `META_LOOKBACK_DAYS` | optional, Standard `90` |

Ohne Meta-Anbindung läuft das Dashboard weiter, zeigt aber keinen Spend, kein
CPL und keine Kampagnen-Hierarchie.

### Zugriffsschutz

| Variable | Wert |
|---|---|
| `DASHBOARD_USER` | Benutzername (Basic Auth) |
| `DASHBOARD_PASSWORD` | Passwort |

Beide setzen = Login aktiv. Beide leer = **öffentlich erreichbar**. Bei einer
öffentlichen Render-URL mit echten Lead-Daten inkl. Namen, E-Mail-Adressen und
Telefonnummern immer setzen. `/api/health` bleibt bewusst ungeschützt, sonst
schlägt der Render-Healthcheck fehl.

### KI-Chatbot

| Variable | Wert |
|---|---|
| `ANTHROPIC_API_KEY` | API-Key. Leer = Chat-Tab ausgeblendet |
| `ANTHROPIC_MODEL` | optional, überschreibt das Standardmodell |

Der Chatbot bekommt die Lead-Einzeldatensätze **inklusive Name, E-Mail und
Telefon** in den Kontext (internes Tool). Bei einem öffentlich erreichbaren
Dashboard also entweder Basic Auth setzen oder den Key weglassen.

### Sonstiges

| Variable | Wert |
|---|---|
| `PORT` | Standard `3000` (Render setzt das selbst) |
| `CACHE_TTL_SECONDS` | Standard `900` — wie lange Sheet-/Meta-Daten gecacht werden |

Der „Aktualisieren"-Button umgeht den Cache immer.

Optionaler Supermetrics-Fallback statt Meta: `SUPERMETRICS_API_KEY`,
`SUPERMETRICS_DS_ACCOUNTS`, `SUPERMETRICS_DS_USER`, `SUPERMETRICS_QUERY_JSON`.

---

## 7. Deployment auf Render

1. Repo auf GitHub, `render.yaml` liegt im Wurzelverzeichnis.
2. Render → **New** → **Blueprint** → Repo auswählen.
3. **Branch** auf den Branch stellen, der `render.yaml` enthält (Standard `main`).
   Findet Render die Datei nicht, ist fast immer der falsche Branch ausgewählt
   oder es wurde noch nichts gepusht.
4. Render fragt alle `sync: false`-Variablen ab → oben eintragen.
5. Deploy. Healthcheck läuft gegen `/api/health`.

Der Build-Befehl installiert bewusst auch die devDependencies
(`npm install --include=dev`), weil Vite für den Frontend-Build gebraucht wird.

---

## 8. Lokal entwickeln

```bash
npm install
cp .env.example .env      # ausfüllen
npm run dev               # Server :3000 + Vite :5173
npm test                  # alle Testsuiten
npm run serve             # Produktions-Build + Server, wie auf Render
```

`npm test` deckt Parser, Supermetrics, Meta-Aggregation, Attribution sowie
Feature-Flags und Funnel-Aufteilung ab. **Nach jeder Änderung an
`project.config.json` einmal laufen lassen** — die Tests prüfen unter anderem,
dass bei abgeschalteten Flags wirklich keine Ticket-/Quali-Felder mehr im
Datensatz landen.

---

## 9. Checkliste

- [ ] `project.config.json`: Name, Untertitel, Branding
- [ ] Feature-Flags gesetzt
- [ ] Sheet-Spalten gemappt, `decodePlusAsSpace` geprüft
- [ ] Funnels definiert (oder `[]`)
- [ ] Traffic-Quellen inkl. `hasSpend` gesetzt
- [ ] `web/public/logo.svg` ersetzt
- [ ] `config/campaigns.json` geprüft
- [ ] Sheet für die Service-Account-Adresse freigegeben
- [ ] Env-Vars in Render eingetragen
- [ ] `DASHBOARD_USER` / `DASHBOARD_PASSWORD` gesetzt
- [ ] `npm test` grün
- [ ] Erster Deploy: Lead-Zahl im Dashboard gegen das Sheet gegengeprüft
