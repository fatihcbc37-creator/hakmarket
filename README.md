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
