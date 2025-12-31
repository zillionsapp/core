-- Migration script to add portfolio metrics columns to existing portfolio_snapshots table

ALTER TABLE public.portfolio_snapshots
ADD COLUMN IF NOT EXISTS pnl numeric,
ADD COLUMN IF NOT EXISTS "winRate" numeric,
ADD COLUMN IF NOT EXISTS "profitFactor" numeric,
ADD COLUMN IF NOT EXISTS "openTrades" jsonb,
ADD COLUMN IF NOT EXISTS "closedTrades" jsonb,
ADD COLUMN IF NOT EXISTS "currentEquity" numeric,
ADD COLUMN IF NOT EXISTS "currentBalance" numeric;

-- Optional: Update existing records with default values if needed
-- UPDATE public.portfolio_snapshots SET pnl = 0 WHERE pnl IS NULL;
-- UPDATE public.portfolio_snapshots SET "winRate" = 0 WHERE "winRate" IS NULL;
-- UPDATE public.portfolio_snapshots SET "profitFactor" = 0 WHERE "profitFactor" IS NULL;
-- UPDATE public.portfolio_snapshots SET "openTrades" = '[]'::jsonb WHERE "openTrades" IS NULL;
-- UPDATE public.portfolio_snapshots SET "closedTrades" = '[]'::jsonb WHERE "closedTrades" IS NULL;
-- UPDATE public.portfolio_snapshots SET "currentEquity" = "totalValue" WHERE "currentEquity" IS NULL;
-- UPDATE public.portfolio_snapshots SET "currentBalance" = "totalValue" WHERE "currentBalance" IS NULL;
