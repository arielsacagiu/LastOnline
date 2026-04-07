# LastOnline

LastOnline is a Flutter mobile app plus a Node.js backend that tracks WhatsApp Web presence changes for saved contacts, stores online sessions, and streams live updates to the app.

## Repo Layout

```text
.
|-- backend/            # Express + Prisma + Puppeteer tracker
|-- whatsapp_tracker/   # Flutter mobile app
|-- docker-compose.production.yml
`-- .github/workflows/ci.yml
```

## Current Status

- Good fit for private use or a controlled beta.
- Better prepared for deployment than a raw prototype.
- Still depends on WhatsApp Web automation, which is the main production risk.

## Features

- Multi-user auth
- Per-contact status tracking
- Online session reconstruction with timestamps and duration
- Session log files written to `backend/session_logs/`
- Live SSE updates to the Flutter app
- Analytics, monitoring, and weekly summaries

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm start
```

Important local files:

- `.env` contains local secrets and is ignored by git
- `prisma/dev.db` is the local SQLite database
- `wa_session/` stores the WhatsApp Web browser session

### Flutter App

```bash
cd whatsapp_tracker
flutter pub get
flutter run
```

Debug builds default to:

```text
http://10.0.2.2:3000
```

## Release Build

Release builds require a real backend URL at build time:

```bash
cd whatsapp_tracker
flutter build apk --release \
  --dart-define=PRODUCTION_BASE_URL=https://api.your-domain.com
```

Optional beta escape hatch:

```bash
--dart-define=ALLOW_SERVER_OVERRIDE=true
```

## Backend Environment

Start from [`backend/.env.example`](backend/.env.example).

Important production values:

- `NODE_ENV=production`
- `JWT_SECRET=<long random secret>`
- `CORS_ORIGINS=https://app.your-domain.com`
- `PORT=3000`
- `DATABASE_URL=...`
- `TRUST_PROXY=1`

Optional tuning:

- `CHECK_INTERVAL_MS`
- `WHATSAPP_SETTLE_MS`
- `SESSION_LOG_TIMEZONE`
- `ENABLE_COMPRESSION`
- `WHATSAPP_BROWSER_URL`

## Deployment Options

### Docker

The repo includes:

- [`backend/Dockerfile`](backend/Dockerfile)
- [`backend/.dockerignore`](backend/.dockerignore)
- [`docker-compose.production.yml`](docker-compose.production.yml)

Typical flow:

```bash
cp backend/.env.example backend/.env
docker compose -f docker-compose.production.yml up -d --build
```

The Docker image starts with:

```bash
npx prisma migrate deploy && node src/index.js
```

### PM2 on a VM

The repo also includes [`backend/ecosystem.config.cjs`](backend/ecosystem.config.cjs).

```bash
cd backend
npm install
pm2 start ecosystem.config.cjs
pm2 save
```

The PM2 config uses `npm run start:prod`, which applies Prisma migrations before starting the API.

## CI

GitHub Actions is configured in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to run:

- backend tests
- Flutter analyze
- Flutter tests
- backend Docker image build

## Tests

Backend tests:

```bash
cd backend
npm test
```

## Session Logs

Per-contact text logs are written to:

```text
backend/session_logs/
```

Example line:

```text
2026-04-07 | logged on from 17:28:05-17:31:46 | 3 minutes 40 seconds
```

## Production Notes

What is already improved in-repo:

- config validation
- CORS restrictions for production
- helmet + compression
- stronger contact validation and duplicate detection
- deploy/runtime files
- CI automation
- session logging

What still requires manual work:

- provision a server that stays online
- set real production env values
- set up HTTPS and a real domain
- choose and operate your production database strategy
- keep the WhatsApp Web account linked on the server

## Important Limitation

The tracker works by automating WhatsApp Web through Puppeteer. That is the biggest operational and policy risk in this project. Treat this repo as private-beta-ready infrastructure, not guaranteed public-store-safe infrastructure.
