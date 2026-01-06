-- Script to empty the specified tables: kv_store, portfolio_chart_cache, portfolio_snapshots, and trades
-- This will remove all data from these tables but keep the table structures intact

TRUNCATE TABLE public.kv_store CASCADE;
TRUNCATE TABLE public.portfolio_chart_cache CASCADE;
TRUNCATE TABLE public.portfolio_snapshots CASCADE;
TRUNCATE TABLE public.trades CASCADE;
