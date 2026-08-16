PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'player',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  city TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL,
  reporter_nickname TEXT NOT NULL DEFAULT 'Аноним',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_id) REFERENCES ads(id)
);

CREATE TABLE IF NOT EXISTS moderation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER,
  moderator_nickname TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_id) REFERENCES ads(id)
);

INSERT OR IGNORE INTO categories (name) VALUES
 ('Автомобили'),('Недвижимость'),('Работа'),('Услуги'),('Бизнесы'),('Другое');
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','root')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

INSERT OR IGNORE INTO admin_accounts (username,display_name,role,password_salt,password_hash) VALUES
('media01','СМИ Администратор 01','admin','Bbus6Eq4FJHQLEUooy4P9A==','22a0V6vfrift8lpbTY9q8U0PGpxwKqa+m2UNQ4+j/WA='),
('media02','СМИ Администратор 02','admin','RCJkve8q1jZfKrRuD7wOGw==','HYbIvMBcmsQwSRiYxPlbeNzxdcuSVEpg9CDYJ4fhK+0='),
('media03','СМИ Администратор 03','admin','JSMy/IG6jRm2iIqfwkvCeg==','+s9qPIzb02isQ8eG+ENZGcg+n/Or8CxuUsbKykhX0UI='),
('media04','СМИ Администратор 04','admin','zqk+8aY72hQBvzS2HjjENw==','S8rjjoc+u7VnKiubB6BEWsN9KUz2KzOd2JUC7T1orUg='),
('media05','СМИ Администратор 05','admin','fz64t/uSzOb3W6c26pCcLw==','KQkXFgjuD54NHUYtzSf2O3YWkFSLvrAvyJ/udK5/76Y='),
('root','ROOT Администратор','root','BQ3ayBELwmQG4i7ZWEIJjw==','cX9kVeD5klsHmdCYao/lV5UREvxEmsubc6FX397cnDI=');

DELETE FROM admin_sessions WHERE expires_at <= datetime('now');
