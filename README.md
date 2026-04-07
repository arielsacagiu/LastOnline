# WhatsApp Last Seen Tracker

A cross-platform Flutter app (Android & iOS) + Node.js backend that lets multiple users each track when their WhatsApp contacts were last online.

---

## Architecture

```
windsurf-project-3/
├── backend/          # Node.js + Express + Prisma (SQLite) + Puppeteer scraper
└── whatsapp_tracker/ # Flutter app (Android + iOS)
```

---

## Backend Setup

### Requirements
- Node.js 18+
- A machine that can run a headless Chromium (for WhatsApp Web scraping)

### Steps

```bash
cd backend
npm install
npx prisma migrate dev --name init   # creates prisma/dev.db
npm start                             # starts on port 3000
```

The server will:
- Expose REST API at `http://<your-ip>:3000`
- Run the polling loop every **1 second by default** via Puppeteer (`CHECK_INTERVAL_MS` configurable)

### Environment Variables (`.env`)
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="your_secret_key_here"
PORT=3000
CHECK_INTERVAL_MS=1000
WHATSAPP_SETTLE_MS=500
```

Notes:
- `CHECK_INTERVAL_MS` supports fast polling and is clamped to a minimum of `500` ms
- If a Puppeteer sweep is still running, the next tick is skipped instead of overlapping
- Real throughput still depends on how long WhatsApp Web takes to load and how many contacts you track
- The backend now keeps WhatsApp Web monitor pages open for tracked contacts instead of reopening a fresh page every cycle
- Contacts now store their current status and last-checked timestamp directly, while `LastSeenLog` keeps state-change history instead of every single poll

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/contacts` | List tracked contacts |
| POST | `/api/contacts` | Add a contact to track |
| DELETE | `/api/contacts/:id` | Remove a contact |
| GET | `/api/logs/:contactId` | Get last seen logs |
| GET | `/api/stream` | Authenticated SSE stream for live updates |
| GET | `/api/health` | Server health check |

---

## WhatsApp Web – First-Time QR Setup

WhatsApp Web requires a QR code scan on first use. On the server machine:

1. Change `headless: true` to `headless: false` in `backend/src/scraper.js`
2. Start the server: `npm start`
3. A Chrome window will open — scan the QR code with your WhatsApp
4. Once authenticated, set `headless` back to `true` and restart

> WhatsApp Web sessions persist in the Puppeteer user data dir. You only need to scan once.

---

## Flutter App Setup

### Requirements
- Flutter 3.x SDK
- Android Studio / Xcode for building

### Run in development

```bash
cd whatsapp_tracker
flutter pub get
flutter run
```

### Build APK (Android)

```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

### Build for iOS

```bash
flutter build ios --release
```

### Configure Server URL

On first launch, tap **Server Settings** (gear icon on login screen) and enter your backend URL:
- **Android emulator:** `http://10.0.2.2:3000`
- **Real device (same WiFi):** `http://192.168.x.x:3000`
- **Production server:** `https://your-domain.com`

---

## Features

- **Multi-user:** Each account tracks its own set of contacts independently
- **Per-contact logs:** Full history of online/offline/last seen status
- **Auto-polling:** Backend runs on a configurable millisecond polling interval
- **Live updates:** The mobile app receives server-sent events and updates active screens without manual refresh
- **Activity chart:** Contact detail screens show a recent status breakdown chart
- **Dark mode:** Full light/dark theme support
- **Real-time refresh:** Pull-to-refresh on the contacts dashboard
- **Server config:** Configurable backend URL from within the app

---

## Publishing to Google Play / App Store

1. Follow Flutter's [Android deployment guide](https://docs.flutter.dev/deployment/android)
2. Generate a signing key: `keytool -genkey -v -keystore release-key.jks ...`
3. Configure `android/key.properties` and `android/app/build.gradle`
4. Run `flutter build apk --release` or `flutter build appbundle --release`
5. Upload the `.aab` to Google Play Console
