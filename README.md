# SimpleTicket – Minimal Ticketing (SPA + Node.js + PostgreSQL)

Live-URL: **https://simpleticketsys.onrender.com**  
Health: **https://simpleticketsys.onrender.com/healthz**

## Login (Demo)
- **admin / admin123** → darf Status & Assignee setzen, löschen
- **user / user123** → darf Tickets erstellen, Titel/Beschreibung ändern, eigenes Ticket schließen

## Tech-Stack
- **Frontend**: React (CDN, Single File `public/index.html`) – ausgeliefert vom Node-Server
- **Backend**: Node.js (Express), REST-API unter `/api/...`
- **DB**: PostgreSQL (Render Managed Postgres, zentral)
- **Auth**: JWT (Bearer)
- **CI**: GitHub Actions (Jest + Supertest – Unit/Integration)
- **CD**: Render Auto-Deploy (Backend & SPA)

## Features (Kurz)
- Tickets: erstellen, filtern, suchen
- Rollen: `user` (create/update/close eigene), `admin` (assign/status/delete)
- Healthcheck: `/healthz`

## Lokal starten
```bash
npm install
# Umgebungsvariablen für lokale Postgres-DB:
# DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, DB_SSL=false
npm start
