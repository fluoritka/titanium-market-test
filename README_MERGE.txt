TITANIUM MARKET — old design + new advertisement form

Replace these files in the existing project:
  src/App.vue
  src/style.css

Also copy:
  public/logo.png

Do NOT replace server.js, package.json, package-lock.json, vite.config.ts, .env, data or backups.

The new form logic is preserved:
- vehicles/models and tuning
- 7 house classes + districts
- business types + city + district
- transport without city
- Rules button in the top panel
- Media panel

After replacement:
  npm.cmd install
  npm.cmd run build
  npm.cmd start

Then check:
  Invoke-WebRequest http://localhost:3000/api/health -UseBasicParsing | Select-Object -ExpandProperty Content

Expected databaseType: postgresql
