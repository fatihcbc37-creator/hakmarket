# Frischemarkt Cebeci

Node.js/Express-Webseite fuer einen Supermarkt mit oeffentlicher Flyer-Anzeige und Adminbereich fuer PDF-Uploads.

## Start

```bash
npm install
npm run dev
```

Standard-URLs:

- Oeffentliche Seite: `http://localhost:5051`
- Adminseite: `http://localhost:5051/admin.html`

Fuer den Produktivstart ohne Watch-Modus:

```bash
npm start
```

## Admin

Das Demo-Passwort ist `admin123`. Fuer den Betrieb sollte es per Umgebungsvariable geaendert werden:

```bash
ADMIN_PASSWORD=ein-sicheres-passwort npm start
```

PDFs werden in `uploads/flyers` gespeichert. Die Flyer-Metadaten liegen in `data/flyers.json`.

## Railway Deployment

Die App ist fuer Railway vorbereitet. Lokal bleibt der Speicher wie bisher im Projektordner. Auf Railway sollte ein Volume verwendet werden, damit hochgeladene PDFs und `flyers.json` nach Deploys erhalten bleiben.

Railway-Einstellungen:

- Build Command: `npm install`
- Start Command: `npm start`
- Volume Mount Path: `/data`
- Variable `STORAGE_DIR`: `/data`
- Variable `ADMIN_PASSWORD`: ein eigenes sicheres Passwort

Beim ersten Start mit leerem Volume kopiert die App vorhandene Flyer aus dem Repo nach `/data`, falls welche vorhanden sind.
