# Titanium Market — vehicle/house fields fix

Replace `server.js`, `src/App.vue`, and `src/style.css` with the files from this patch.
Add `db/migration_v4_listing_fields.sql`.

The server also runs the same `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at startup, so the new columns are created automatically when the PostgreSQL user has ALTER permission.

Then run:

    npm run build
    npm start

New database fields:
- vehicle_model
- tuning
- acceleration_stage
- speed_stage
- house_class
- district
