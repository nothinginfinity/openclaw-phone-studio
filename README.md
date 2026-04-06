# OpenClaw Phone Studio

Self-hosted OpenClaw agent for Instagram DM ingestion, approval-based posting, and Phone Studio PWA integration.

## Included

- Express server with JSON API routes
- SQLite schema and bootstrapper
- Instagram OAuth callback + token persistence
- DM sync route that stores conversations/messages in SQLite
- Posting queue + approval token middleware
- Admin status/config routes
- Background scheduler stub for DM polling

## Structure

```text
openclaw-phone-studio/
├── .env.example
├── package.json
├── index.js
├── db/
│   ├── init.sql
│   └── db.js
├── routes/
│   ├── auth.js
│   ├── dm.js
│   ├── posting.js
│   └── admin.js
├── services/
│   ├── instagram.js
│   ├── queue.js
│   └── scheduler.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
└── README.md
```

## Quick Start

```bash
cd /Users/kanelawaccount/openclaw-phone-studio
cp .env.example .env
npm install
npm run dev
```

Server base URL:

```text
http://localhost:3001
```

## Deployment to Render

Use a separate Render service and a separate GitHub repo for this backend. Keep the iPhone PWA in `phone-studio` on GitHub Pages, and connect only `openclaw-phone-studio` to Render.

### Important SQLite Note

Render free web services use ephemeral storage. This backend currently uses SQLite, so persistent data such as OAuth tokens and synced DMs will only survive deploys and restarts if you attach a persistent disk and keep `DB_PATH=/var/data/phone_studio.db`.

That means:

- Free Render is acceptable for smoke tests.
- Paid Render with a persistent disk is the right deployment for real usage.

### Files Included for Render

- [`render.yaml`](./render.yaml): Render Blueprint with build/start commands and env var names
- [`Render.env.example`](./Render.env.example): reference values to copy into the Render dashboard
- [`.env.example`](./.env.example): local development defaults

### Render Deployment Steps

1. Push this repo to GitHub.
2. In Render, create a new Web Service or Blueprint from this repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Set environment variables from [`Render.env.example`](./Render.env.example).
6. If you want persistent SQLite data, attach a persistent disk and keep `DB_PATH=/var/data/phone_studio.db`.
7. Set `INSTAGRAM_REDIRECT_URI` to `https://YOUR_RENDER_SERVICE.onrender.com/api/auth/instagram-callback`.
8. Set `PWA_ORIGIN` to your deployed frontend origin, currently `https://nothinginfinity.github.io/phone-studio`.

### After First Deploy

Test these endpoints:

```bash
curl https://YOUR_RENDER_SERVICE.onrender.com/api/status
curl -X POST https://YOUR_RENDER_SERVICE.onrender.com/api/auth/instagram-setup
curl https://YOUR_RENDER_SERVICE.onrender.com/api/auth/integrations
```

Then use the setup URL to complete OAuth and run a DM sync.

## Current State

This is a working backend foundation, not a full production Graph integration yet.

- OAuth setup returns a real authorization URL
- OAuth setup now fails clearly if Meta app credentials are missing
- OAuth callback exchanges the code for a live token and stores the selected Instagram integration in SQLite
- `/api/auth/integrations` exposes masked integration rows for debugging
- DM sync fetches conversations/messages from the configured Graph API and stores them locally
- Queue persistence works through SQLite
- Approval token enforcement works for queue + approve endpoints
- Posting publishes through a stub Instagram service

## Instagram Configuration

The backend defaults to the Facebook-style OAuth + Graph hosts:

```env
INSTAGRAM_OAUTH_AUTHORIZE_URL=https://www.facebook.com/v21.0/dialog/oauth
INSTAGRAM_OAUTH_TOKEN_URL=https://graph.facebook.com/v21.0/oauth/access_token
INSTAGRAM_GRAPH_API_BASE_URL=https://graph.facebook.com/v21.0
```

If your Meta app is configured for Instagram Login instead, point those env vars at the Instagram Login endpoints for your app. The backend keeps them configurable because Meta exposes different login/product combinations depending on app setup.

## Next Work

1. Encrypt or otherwise protect stored access tokens at rest.
2. Add webhook ingestion so DM sync can be incremental instead of poll-heavy.
3. Replace the posting stub with real publish flows.
4. Add retry/backoff job processing for failed posts.
5. Add auth/session layer between the backend and the frontend PWA.
