# TITANIUM MARKET

Cloudflare version migrated to a standard Node.js/Vue deployment while preserving the original UI, API routes, moderation panel, admin sessions, categories, reports, logs and test data.

## Local

Requirements: Node.js 24+.

```powershell
npm.cmd install
npm.cmd run build
npm.cmd start
```

Open `http://localhost:3000`.

## Northflank

Use GitHub repository and **Buildpack**.

- Build command: `npm run build`
- Start command: `npm start`
- Public port: `3000` (HTTP)
- Environment: `PORT=3000`

Northflank can use the default `$PORT`; the server listens on `0.0.0.0`.

## Admin accounts

See `README_ADMIN_ACCOUNTS.txt`. Sessions use an HttpOnly 30-day cookie and PBKDF2-SHA256 with 100,000 iterations, matching the original Cloudflare implementation.
