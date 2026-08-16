# Cloudflare -> GitHub/Northflank migration

This package keeps the Cloudflare project's Vue UI and application behavior, but replaces Cloudflare Workers + D1 with:

- Vite + Vue frontend (same App.vue and style.css)
- Node.js 24 server
- Express HTTP API
- built-in Node `node:sqlite` database (no better-sqlite3/native C++ build)
- same API paths and admin/session logic
- same PBKDF2-SHA256 100,000-iteration password verification
- same test seed (60 approved listings)

The database is stored at `data/titanium-market.db`. For production persistence across container recreation, attach a Northflank persistent volume to the directory containing `data/`.
