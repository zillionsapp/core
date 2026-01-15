-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(255) UNIQUE NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    max_uses INTEGER DEFAULT 1 CHECK (max_uses > 0),
    current_uses INTEGER DEFAULT 0,
    commission_rate NUMERIC DEFAULT 0.10 CHECK (commission_rate >= 0 AND commission_rate <= 0.2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create invite_code_usages table to track each usage
CREATE TABLE IF NOT EXISTS invite_code_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_code_id UUID REFERENCES invite_codes(id) ON DELETE CASCADE,
    used_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on code for faster lookups
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- Create index on created_by for user's invite codes
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);

-- Create index on invite_code_usages
CREATE INDEX IF NOT EXISTS idx_invite_code_usages_code_id ON invite_code_usages(invite_code_id);
CREATE INDEX IF NOT EXISTS idx_invite_code_usages_used_by ON invite_code_usages(used_by);

-- Row Level Security (RLS) policies
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invite codes they created
CREATE POLICY "Users can view their own invite codes" ON invite_codes
    FOR SELECT USING (auth.uid() = created_by);

-- Policy: Users can create invite codes
CREATE POLICY "Users can create invite codes" ON invite_codes
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own invite codes (e.g., deactivate)
CREATE POLICY "Users can update their own invite codes" ON invite_codes
    FOR UPDATE USING (auth.uid() = created_by);

-- Policy: Allow anyone to check if a code exists and is active (for registration)
CREATE POLICY "Anyone can check invite code validity" ON invite_codes
    FOR SELECT USING (is_active = true);

-- RLS for invite_code_usages
ALTER TABLE invite_code_usages ENABLE ROW LEVEL SECURITY;

-- Users can view usages of their own invite codes
CREATE POLICY "Users can view usages of their invite codes" ON invite_code_usages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM invite_codes ic
            WHERE ic.id = invite_code_usages.invite_code_id
            AND ic.created_by = auth.uid()
        )
    );

-- Users can insert usages for their invite codes (when using codes)
CREATE POLICY "Users can insert usages for invite codes" ON invite_code_usages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM invite_codes ic
            WHERE ic.id = invite_code_usages.invite_code_id
            AND ic.is_active = true
        )
    );

-- Function to generate a random invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN := TRUE;
BEGIN
    WHILE code_exists LOOP
        -- Generate a random 8-character alphanumeric code
        new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM invite_codes WHERE code = new_code) INTO code_exists;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can register (has valid invite or is first user)
CREATE OR REPLACE FUNCTION can_user_register(invite_code_param TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    user_count INTEGER;
    code_valid BOOLEAN := FALSE;
BEGIN
    -- Check total user count
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- If no users exist, allow registration (first user)
    IF user_count = 0 THEN
        RETURN TRUE;
    END IF;

    -- If invite code provided, check if it's valid and has remaining uses
    IF invite_code_param IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM invite_codes
            WHERE code = invite_code_param
            AND is_active = true
            AND current_uses < max_uses
        ) INTO code_valid;
    END IF;

    RETURN code_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to use an invite code
CREATE OR REPLACE FUNCTION use_invite_code(invite_code_param TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    invite_code_record RECORD;
    can_use BOOLEAN := FALSE;
    new_current_uses INTEGER;
BEGIN
    -- Get the invite code details
    SELECT * INTO invite_code_record
    FROM invite_codes
    WHERE code = invite_code_param
    AND is_active = true;

    -- Check if code exists and has remaining uses
    IF invite_code_record.id IS NOT NULL AND invite_code_record.current_uses < invite_code_record.max_uses THEN
        -- Check if user hasn't already used this code
        SELECT NOT EXISTS(
            SELECT 1 FROM invite_code_usages
            WHERE invite_code_id = invite_code_record.id
            AND used_by = user_id
        ) INTO can_use;
    END IF;

    IF can_use THEN
        -- Calculate new usage count
        new_current_uses := invite_code_record.current_uses + 1;

        -- Insert usage record
        INSERT INTO invite_code_usages (invite_code_id, used_by)
        VALUES (invite_code_record.id, user_id);

        -- Update current uses and deactivate if limit reached
        UPDATE invite_codes
        SET current_uses = new_current_uses,
            is_active = CASE WHEN new_current_uses >= max_uses THEN false ELSE true END
        WHERE id = invite_code_record.id;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USER SETTINGS TABLE
-- ============================================================================

-- User settings table - stores user preferences and configuration
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, setting_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_key ON user_settings(setting_key);

-- Row Level Security (RLS) policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own settings
CREATE POLICY "Users can view their own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own settings
CREATE POLICY "Users can insert their own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own settings
CREATE POLICY "Users can update their own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own settings
CREATE POLICY "Users can delete their own settings" ON user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- Function to get user setting with default value
CREATE OR REPLACE FUNCTION get_user_setting(user_id_param UUID, setting_key_param TEXT, default_value JSONB DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    setting_value JSONB;
BEGIN
    SELECT setting_value INTO setting_value
    FROM user_settings
    WHERE user_id = user_id_param AND setting_key = setting_key_param;

    IF setting_value IS NULL THEN
        RETURN default_value;
    END IF;

    RETURN setting_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user setting (upsert)
CREATE OR REPLACE FUNCTION set_user_setting(user_id_param UUID, setting_key_param TEXT, setting_value_param JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
    VALUES (user_id_param, setting_key_param, setting_value_param, NOW())
    ON CONFLICT (user_id, setting_key)
    DO UPDATE SET
        setting_value = setting_value_param,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USER WALLETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_wallets (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, wallet_address)
);

-- RLS for user_wallets
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wallet" ON user_wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can link their own wallet" ON user_wallets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- VAULT TRANSACTIONS TABLE
-- ============================================================================

-- Vault Transactions Table
CREATE TABLE IF NOT EXISTS public.vault_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    shares NUMERIC NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Extend vault_transactions table with commission-related fields
-- These ALTER statements are idempotent - they won't error if columns already exist
DO $$
BEGIN
    -- Add commission-related columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_transactions' AND column_name = 'inviter_id') THEN
        ALTER TABLE public.vault_transactions ADD COLUMN inviter_id UUID REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_transactions' AND column_name = 'invited_user_id') THEN
        ALTER TABLE public.vault_transactions ADD COLUMN invited_user_id UUID REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_transactions' AND column_name = 'invited_portfolio_value') THEN
        ALTER TABLE public.vault_transactions ADD COLUMN invited_portfolio_value NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_transactions' AND column_name = 'invited_daily_pnl') THEN
        ALTER TABLE public.vault_transactions ADD COLUMN invited_daily_pnl NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_transactions' AND column_name = 'commission_rate') THEN
        ALTER TABLE public.vault_transactions ADD COLUMN commission_rate NUMERIC;
    END IF;

    -- Update the CHECK constraint to include commission transaction types
    -- Drop existing constraint first (if it exists)
    ALTER TABLE public.vault_transactions DROP CONSTRAINT IF EXISTS vault_transactions_type_check;
    ALTER TABLE public.vault_transactions ADD CONSTRAINT vault_transactions_type_check CHECK (type IN (
        'DEPOSIT', 
        'WITHDRAWAL', 
        'SEND', 
        'RECEIVE', 
        'COMMISSION_EARNED', 
        'COMMISSION_PAID', 
        'COMMISSION_PAYOUT'
    ));
EXCEPTION
    WHEN others THEN
        -- Ignore errors if alterations fail (e.g., columns already exist)
        NULL;
END $$;

-- ============================================================================
-- COMMISSION SYSTEM TABLES AND FUNCTIONS
-- ============================================================================

-- Commission payments table - tracks actual commission payouts
CREATE TABLE IF NOT EXISTS commission_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_invited_profit NUMERIC NOT NULL DEFAULT 0,
    commission_amount NUMERIC NOT NULL DEFAULT 0, -- 10% of invited profit
    commission_rate NUMERIC NOT NULL DEFAULT 0.10, -- 10%
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Commission transactions table - tracks commission payouts as transactions
CREATE TABLE IF NOT EXISTS commission_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    invited_portfolio_value NUMERIC NOT NULL DEFAULT 0,
    invited_daily_pnl NUMERIC NOT NULL DEFAULT 0,
    commission_earned NUMERIC NOT NULL DEFAULT 0, -- 10% of daily pnl
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_payments_inviter ON commission_payments(inviter_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_invited ON commission_payments(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_period ON commission_payments(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_commission_transactions_inviter ON commission_transactions(inviter_id);
CREATE INDEX IF NOT EXISTS idx_commission_transactions_date ON commission_transactions(transaction_date);

-- Row Level Security for commission tables
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own commission payments (as inviter)
CREATE POLICY "Users can view their commission payments" ON commission_payments
    FOR SELECT USING (auth.uid() = inviter_id);

-- Users can view their commission transactions (as both inviter and invited)
CREATE POLICY "Users can view their commission transactions" ON commission_transactions
    FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invited_user_id);

-- Function to calculate daily commissions for all inviters
CREATE OR REPLACE FUNCTION calculate_daily_commissions(target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
    commission_record RECORD;
    user_daily_pnl NUMERIC;
    commission_amount NUMERIC;
    net_user_profit NUMERIC;
    inserted_count INTEGER := 0;
    first_deposit_timestamp BIGINT;
    user_deposit_total NUMERIC;
    vault_daily_pnl NUMERIC;
    vault_total_value NUMERIC;
    inviter_email TEXT;
BEGIN
    -- Loop through all invite relationships (including deactivated codes)
    FOR commission_record IN
        SELECT
            ic.created_by as inviter_id,
            icu.used_by as invited_user_id,
            ic.commission_rate,
            u.email as invited_email
        FROM invite_codes ic
        JOIN invite_code_usages icu ON icu.invite_code_id = ic.id
        JOIN auth.users u ON u.id = icu.used_by
    LOOP
        -- Find the user's first deposit timestamp
        SELECT MIN(vt.timestamp) INTO first_deposit_timestamp
        FROM vault_transactions vt
        WHERE vt.email = commission_record.invited_email
        AND vt.type = 'DEPOSIT';

        -- If user has no deposits, skip commission calculation
        IF first_deposit_timestamp IS NULL THEN
            CONTINUE;
        END IF;

        -- Calculate user's actual profit based on their vault share
        -- Get user's net deposit amount (deposits + receives - withdrawals - sends)
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN vt.type IN ('DEPOSIT', 'RECEIVE') THEN vt.amount
                    WHEN vt.type IN ('WITHDRAWAL', 'SEND') THEN -vt.amount
                    ELSE 0
                END
            ), 0) INTO user_deposit_total
        FROM vault_transactions vt
        WHERE vt.email = commission_record.invited_email;

        -- Get vault's total value for the period
        SELECT COALESCE(ps."totalValue", 10000) INTO vault_total_value
        FROM portfolio_snapshots ps
        WHERE DATE(ps.created_at) = target_date
        ORDER BY ps.created_at DESC
        LIMIT 1;

        -- Get vault's daily P&L
        SELECT COALESCE(ps.pnl, 0) INTO vault_daily_pnl
        FROM portfolio_snapshots ps
        WHERE DATE(ps.created_at) = target_date
        ORDER BY ps.created_at DESC
        LIMIT 1;

        -- Calculate user's share of vault P&L based on their deposit percentage
        -- This gives the user's actual profit contribution
        RAISE NOTICE 'Commission calc for user %: deposits=%, vault_value=%, vault_pnl=%',
            commission_record.invited_email, user_deposit_total, vault_total_value, vault_daily_pnl;

        IF user_deposit_total > 0 AND vault_total_value > 0 THEN
            user_daily_pnl := vault_daily_pnl * (user_deposit_total / vault_total_value);
            RAISE NOTICE 'Calculated user P&L: % * (% / %) = %',
                vault_daily_pnl, user_deposit_total, vault_total_value, user_daily_pnl;
        ELSE
            user_daily_pnl := 0;
            RAISE NOTICE 'User P&L set to 0: deposits=%, vault_value=%', user_deposit_total, vault_total_value;
        END IF;

        -- Only calculate commission if the user was active (had deposited) on this date
        -- Convert first_deposit_timestamp from milliseconds to date for comparison
        IF first_deposit_timestamp / 1000 <= EXTRACT(epoch FROM target_date + INTERVAL '1 day') THEN
            -- Calculate commission using the custom rate from the invite code
            commission_amount := user_daily_pnl * commission_record.commission_rate;
            -- Keep user's P&L gross, commission paid separately
            net_user_profit := user_daily_pnl;

            -- Only record if there's profit to commission
            IF commission_amount > 0 THEN
                -- Check if commission transactions already exist for this date and users
                    -- 1. Create ledger entries if they don't exist yet (Real-time might have done them)
                    IF NOT EXISTS (
                        SELECT 1 FROM vault_transactions
                        WHERE inviter_id = commission_record.inviter_id
                        AND invited_user_id = commission_record.invited_user_id
                        AND type IN ('COMMISSION_EARNED', 'COMMISSION_PAID')
                        AND DATE(to_timestamp(timestamp / 1000)) = target_date
                    ) THEN
                        -- Get inviter's email for vault transaction
                        SELECT u2.email INTO STRICT inviter_email
                        FROM auth.users u2
                        WHERE u2.id = commission_record.inviter_id;

                        -- Debit from invited user (commission payment)
                        INSERT INTO vault_transactions (
                            email, amount, shares, type, timestamp,
                            inviter_id, invited_user_id, invited_portfolio_value, invited_daily_pnl, commission_rate
                        ) VALUES (
                            commission_record.invited_email, -commission_amount, 0, 'COMMISSION_PAID', EXTRACT(epoch FROM target_date) * 1000,
                            commission_record.inviter_id, commission_record.invited_user_id, user_deposit_total, net_user_profit, commission_record.commission_rate
                        );

                        -- Credit to inviter (commission earned)
                        INSERT INTO vault_transactions (
                            email, amount, shares, type, timestamp,
                            inviter_id, invited_user_id, invited_portfolio_value, invited_daily_pnl, commission_rate
                        ) VALUES (
                            inviter_email, commission_amount, 0, 'COMMISSION_EARNED', EXTRACT(epoch FROM target_date) * 1000,
                            commission_record.inviter_id, commission_record.invited_user_id, user_deposit_total, net_user_profit, commission_record.commission_rate
                        );
                    END IF;

                    -- 2. Create pending commission payment record (Source of truth for physical payouts)
                    -- Check if a payment for this period already exists
                    IF NOT EXISTS (
                        SELECT 1 FROM commission_payments
                        WHERE inviter_id = commission_record.inviter_id
                        AND invited_user_id = commission_record.invited_user_id
                        AND DATE(period_end) = target_date
                    ) THEN
                        INSERT INTO commission_payments (
                            inviter_id,
                            invited_user_id,
                            period_start,
                            period_end,
                            total_invited_profit,
                            commission_amount,
                            commission_rate,
                            status
                        ) VALUES (
                            commission_record.inviter_id,
                            commission_record.invited_user_id,
                            (target_date - INTERVAL '1 day')::timestamp with time zone,
                            target_date::timestamp with time zone,
                            net_user_profit,
                            commission_amount,
                            commission_record.commission_rate,
                            'PENDING'
                        );
                        inserted_count := inserted_count + 1;
                    END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get total commissions earned by a user
CREATE OR REPLACE FUNCTION get_user_total_commissions(user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_commission NUMERIC;
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total_commission
    FROM vault_transactions
    WHERE inviter_id = user_id AND type = 'COMMISSION_EARNED';

    RETURN total_commission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get total commission paid by a user (when they were referred)
CREATE OR REPLACE FUNCTION get_user_commission_paid(user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_paid NUMERIC;
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total_paid
    FROM vault_transactions
    WHERE invited_user_id = user_id AND type = 'COMMISSION_PAID';

    RETURN total_paid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get commission summary for a user
CREATE OR REPLACE FUNCTION get_user_commission_summary(user_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_earned NUMERIC;
    total_paid NUMERIC;
    monthly_earned NUMERIC;
    invited_count BIGINT;
    last_date DATE;
    pending_count BIGINT;
BEGIN
    -- Get total earned (as referrer)
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total_earned
    FROM vault_transactions
    WHERE inviter_id = user_id AND type = 'COMMISSION_EARNED';

    -- Get total paid (as referred user)
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total_paid
    FROM vault_transactions
    WHERE invited_user_id = user_id AND type = 'COMMISSION_PAID';

    -- Get monthly earned (last 30 days)
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO monthly_earned
    FROM vault_transactions
    WHERE inviter_id = user_id AND type = 'COMMISSION_EARNED'
    AND DATE(to_timestamp(timestamp / 1000)) >= CURRENT_DATE - INTERVAL '30 days';

    -- Get invited users count
    SELECT COUNT(DISTINCT invited_user_id) INTO invited_count
    FROM vault_transactions
    WHERE inviter_id = user_id AND type = 'COMMISSION_EARNED';

    -- Get last commission date
    SELECT MAX(DATE(to_timestamp(timestamp / 1000))) INTO last_date
    FROM vault_transactions
    WHERE inviter_id = user_id AND type = 'COMMISSION_EARNED';

    -- Get pending payments count (keeping this for now, though it might be obsolete)
    SELECT COUNT(*) INTO pending_count
    FROM commission_payments
    WHERE inviter_id = user_id AND status = 'PENDING';

    -- Build result JSON
    result := json_build_object(
        'total_earned', total_earned,
        'total_paid', total_paid,
        'invited_users_count', invited_count,
        'last_commission_date', last_date,
        'monthly_earned', monthly_earned,
        'pending_payments', pending_count
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get commission history for a user
CREATE OR REPLACE FUNCTION get_user_commission_history(
    user_id UUID,
    limit_count INTEGER DEFAULT 50,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    transaction_date DATE,
    invited_user_email TEXT,
    invited_gross_pnl NUMERIC,
    invited_net_pnl NUMERIC,
    commission_earned NUMERIC,
    commission_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(to_timestamp(vt.timestamp / 1000)) as transaction_date,
        u.email::TEXT,
        (vt.invited_daily_pnl + ABS(vt.amount)) as invited_gross_pnl, -- Reconstruct gross profit
        vt.invited_daily_pnl as invited_net_pnl, -- Net profit after commission
        ABS(vt.amount) as commission_earned,
        vt.commission_rate
    FROM vault_transactions vt
    JOIN auth.users u ON u.id = vt.invited_user_id
    WHERE vt.inviter_id = user_id AND vt.type = 'COMMISSION_EARNED'
    ORDER BY vt.timestamp DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;