# LabBuddy — production deployment

This is the minimum to safely ship LabBuddy. The app is a Vite + React client
served as a static bundle and an Express + SQLite API server.

## 1. Required env vars (server)

See `server/.env.example`. The non-negotiables:

| Var | Why it matters |
| --- | --- |
| `NODE_ENV=production` | Switches auth-middleware to strict mode (no dev-secret fallback). |
| `JWT_SECRET` | Signs parent auth tokens. Must be ≥32 chars. `openssl rand -hex 32`. Boot fails without it in prod. |
| `CLIENT_ORIGIN` | Public URL of the client; used for CORS and Stripe checkout return URLs. |
| `ANTHROPIC_API_KEY` | Chat, experiment generation, DIY guides — the product doesn't work without it. |

Strongly recommended:

- `FAL_KEY` and/or `OPENAI_API_KEY` — without these the image pipeline falls back to Claude-SVG, which is correct but visually plain.
- Stripe keys — only if you're charging. The Family/Classroom tier buttons silently fail without them.

## 2. Build & run

```bash
npm ci
npm run build           # builds client (dist/) and server (dist/)
NODE_ENV=production node server/dist/index.js
```

Serve `client/dist/` from any static host (Vercel, Netlify, S3+CloudFront, nginx). Point `/api/*` at the Express server.

## 3. Database

- SQLite file lives at `server/data/labbuddy.db` (WAL mode).
- Migrations are idempotent — they run automatically on boot.
- For production, **mount this directory on persistent disk** (Fly volume, Railway volume, EBS). Don't put it in the container's writable layer.
- Back it up: a nightly `sqlite3 .backup` to object storage is enough at this scale.

## 4. Account management surface (newly wired)

The parent dashboard is now reachable from the app header (`👤 Parent Sign In` / `👤 Parent Dashboard`). Inside the dashboard, the `⚙️ Settings` sidebar entry exposes:

- **Profile** — name + email
- **Security** — password change (bcrypt, current-password verified)
- **Children** — add/edit/remove
- **Subscription** — tier display + upgrade link
- **Danger Zone** — account deletion (password + literal "DELETE" confirmation, sweeps all child data in a single transaction)

The backend routes (`/api/parent/me`, `/api/parent/me/password`, `DELETE /api/parent/me`, `/api/parent/me/account-summary`) are all auth-gated by `requireParentAuth` and validated with Zod.

## 5. Pre-launch checklist

- [ ] Strong `JWT_SECRET` set; verify the server refuses to boot without it (`NODE_ENV=production node dist/index.js`).
- [ ] HTTPS terminated in front of the API (cookie/token transport).
- [ ] CORS origin pinned to your production hostname (no `*`).
- [ ] Rate-limit headers visible — the `express-rate-limit` instances are already configured per-identity, but confirm your reverse proxy sets `X-Forwarded-For` so per-IP limits work.
- [ ] `data/` mounted on a persistent volume with a backup job.
- [ ] Stripe webhook endpoint registered and `STRIPE_WEBHOOK_SECRET` matches.
- [ ] Run through Settings → Profile → Security → Danger Zone end-to-end on staging with a throwaway account, confirm the delete sweeps every child-scoped table.
