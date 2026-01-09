-- Script to empty all existing tables
-- This will remove all data from all tables but keep the table structures intact

TRUNCATE TABLE public.trades CASCADE;
TRUNCATE TABLE public.portfolio_snapshots CASCADE;
TRUNCATE TABLE public.portfolio_chart_cache CASCADE;
TRUNCATE TABLE public.backtest_results CASCADE;
TRUNCATE TABLE public.kv_store CASCADE;
TRUNCATE TABLE public.vault_transactions CASCADE;
TRUNCATE TABLE public.vault_state CASCADE;
