-- Titanium Market: additional fields for vehicle and real-estate listings.
-- Safe to run more than once.
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS vehicle_model TEXT,
  ADD COLUMN IF NOT EXISTS tuning TEXT,
  ADD COLUMN IF NOT EXISTS acceleration_stage INTEGER,
  ADD COLUMN IF NOT EXISTS speed_stage INTEGER,
  ADD COLUMN IF NOT EXISTS house_class INTEGER,
  ADD COLUMN IF NOT EXISTS district TEXT;

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_acceleration_stage_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_acceleration_stage_check CHECK (acceleration_stage IS NULL OR acceleration_stage BETWEEN 1 AND 3);

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_speed_stage_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_speed_stage_check CHECK (speed_stage IS NULL OR speed_stage BETWEEN 1 AND 3);

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_house_class_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_house_class_check CHECK (house_class IS NULL OR house_class BETWEEN 1 AND 7);
