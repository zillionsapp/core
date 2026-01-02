-- Migration: Add kv_store for Application State Persistence
-- Date: 2026-01-02

-- 1. Create Key-Value Store Table
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS) - Optional but recommended pattern
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

-- 3. Create Policy (Open access for service role, restrict if needed)
-- Allows all operations for authenticated users (or service role)
CREATE POLICY "Enable all for authenticated users" ON kv_store
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Comment
COMMENT ON TABLE kv_store IS 'Generic key-value store for persisting application state (e.g. risk limits)';
