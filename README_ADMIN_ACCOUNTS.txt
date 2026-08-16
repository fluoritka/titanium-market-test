TITANIUM MARKET — ADMIN ACCESS

The previous demo login admin / 123456 has been removed from the API.

The new production accounts are created by migration_v3_admins.sql.

5 MEDIA ADMIN ACCOUNTS
1. Username: media01
   Password: sjJkWDWWu6fxid
2. Username: media02
   Password: t5UehqPgrgM9QD
3. Username: media03
   Password: 21viiChxBFWB1d
4. Username: media04
   Password: c6Qp2BqCqzsyDU
5. Username: media05
   Password: fhcJe0LZKQVLKV

ROOT ADMIN
Username: root
Password: SWokimejMdyciM

Permissions:
- media01..media05: moderate, edit, delete/archive ads; resolve reports; see their own moderation logs.
- root: all admin permissions + sees the complete moderation log of all admins.

Sessions:
- HttpOnly cookie, 30 days.
- Login persists across page reloads and browser restarts until logout or expiration.
- The UI remembers whether the admin panel was open.

IMPORTANT: these are initial credentials. After the first login, change them when a password-management screen is added. Do not post them publicly.
