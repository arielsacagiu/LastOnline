# Production Checklist

Use this as the manual finish line after the in-repo setup is done.

## 1. Infrastructure

- Provision a server or VM that can stay online 24/7
- Ensure it can run Chromium / Puppeteer
- Set up HTTPS with a real domain
- Put the backend behind a reverse proxy if needed

## 2. Secrets and Env

- Copy `backend/.env.example` to `backend/.env`
- Replace `JWT_SECRET`
- Set `NODE_ENV=production`
- Set `CORS_ORIGINS`
- Set `TRUST_PROXY=1` when running behind a reverse proxy
- Set your real `DATABASE_URL`

## 3. Database

- Choose whether you will stay on single-node SQLite or move to a managed DB
- Back up the database regularly
- Persist the database path if using Docker volumes

## 4. WhatsApp Session

- Run the backend on the production machine
- Open the visible browser setup flow if needed
- Log the WhatsApp account into WhatsApp Web on that machine
- Verify the session survives restarts

## 5. Runtime

- Use Docker or PM2
- Make sure the process restarts automatically after crashes or reboots
- Persist:
  - `backend/wa_session/`
  - database storage
  - `backend/session_logs/`

## 6. Mobile Release

- Build with:
  - `--dart-define=PRODUCTION_BASE_URL=https://api.your-domain.com`
- Test install on real Android devices
- Test login, add contact, live updates, and session logs

## 7. Monitoring

- Watch backend logs
- Check `/api/health`
- Confirm SSE live updates reconnect after network drops
- Confirm the tracker still detects online/offline transitions over time

## 8. Risk Acknowledgement

- The app depends on WhatsApp Web automation
- That is the main production and policy risk
- Decide whether you are shipping as a private tool, beta, or public product
