-- Titanium Market: user accounts and personal cabinet.
-- Safe to run more than once on PostgreSQL.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_salt TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS last_extended_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_ads_user_id ON public.ads(user_id);
