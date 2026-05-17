
-- Highly scalable function to fetch transaction history with accurate running balances
CREATE OR REPLACE FUNCTION get_user_transactions(
    target_email TEXT, 
    p_limit INTEGER DEFAULT 50, 
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    event_timestamp BIGINT,
    type TEXT,
    description TEXT,
    amount NUMERIC,
    shares NUMERIC,
    running_balance NUMERIC,
    total_count BIGINT
) AS $$
DECLARE
BEGIN
    RETURN QUERY
    WITH all_events AS (
        -- 1. Vault Transactions (Deposits, Transfers, Commissions)
        SELECT 
            vt.id::TEXT,
            vt.timestamp as event_timestamp,
            vt.type::TEXT,
            CASE 
                WHEN vt.type = 'DEPOSIT' THEN 'Deposit'
                WHEN vt.type = 'WITHDRAWAL' THEN 'Withdrawal'
                WHEN vt.type = 'SEND' THEN 'Sent'
                WHEN vt.type = 'RECEIVE' THEN 'Received'
                WHEN vt.type = 'COMMISSION_EARNED' THEN 'Commission Received'
                WHEN vt.type = 'COMMISSION_PAID' THEN 'Commission Paid'
                ELSE vt.type::TEXT
            END AS description,
            CASE 
                WHEN vt.type IN ('DEPOSIT', 'RECEIVE', 'COMMISSION_EARNED') THEN vt.amount
                WHEN vt.type IN ('WITHDRAWAL', 'SEND') THEN -vt.amount
                WHEN vt.type = 'COMMISSION_PAID' THEN -ABS(vt.amount)
                ELSE 0
            END AS amount_change,
            COALESCE(vt.shares, 0) as event_shares
        FROM vault_transactions vt
        WHERE vt.email = target_email

        UNION ALL

        -- 2. Trade Entries (Margin Locked)
        SELECT 
            'trade-entry-' || t.id::TEXT as id,
            t.timestamp as event_timestamp,
            'TRADE_ENTRY' as type,
            (CASE WHEN t.side = 'BUY' THEN 'Buy ' ELSE 'Short Sell ' END) || t.symbol as description,
            -COALESCE(t.margin, (t.price * t.quantity)) as amount_change,
            0 as event_shares
        FROM trades t

        UNION ALL

        -- 3. Trade Exits (Margin Returned + PnL)
        SELECT 
            'trade-exit-' || t.id::TEXT as id,
            t.exitTimestamp as event_timestamp,
            'TRADE_EXIT' as type,
            (CASE WHEN t.side = 'BUY' THEN 'Sell ' ELSE 'Buy to Cover ' END) || t.symbol as description,
            (
                COALESCE(t.margin, (t.price * t.quantity)) + 
                (
                    ((CASE WHEN t.side = 'BUY' THEN t.exitPrice - t.price ELSE t.price - t.exitPrice END) * t.quantity) *
                    COALESCE(
                        (SELECT SUM(CASE WHEN vt.type IN ('DEPOSIT', 'RECEIVE') THEN vt.shares WHEN vt.type IN ('WITHDRAWAL', 'SEND') THEN -vt.shares ELSE 0 END) 
                         FROM vault_transactions vt WHERE vt.email = target_email AND vt.timestamp <= t.exitTimestamp), 0
                    ) /
                    NULLIF(
                        (SELECT SUM(CASE WHEN vt2.type IN ('DEPOSIT', 'RECEIVE') THEN vt2.shares WHEN vt2.type IN ('WITHDRAWAL', 'SEND') THEN -vt2.shares ELSE 0 END) 
                         FROM vault_transactions vt2 WHERE vt2.timestamp <= t.exitTimestamp), 0
                    )
                )
            ) as amount_change,
            0 as event_shares
        FROM trades t
        WHERE t.status = 'CLOSED' AND t.exitTimestamp IS NOT NULL
    ),
    ledger AS (
        SELECT 
            ae.id,
            ae.event_timestamp,
            ae.type,
            ae.description,
            ae.amount_change,
            ae.event_shares,
            SUM(ae.amount_change) OVER (ORDER BY ae.event_timestamp ASC, ae.id ASC) as balance_at_time,
            COUNT(*) OVER() as full_count
        FROM all_events ae
    )
    SELECT 
        l.id,
        l.event_timestamp,
        l.type,
        l.description,
        l.amount_change,
        l.event_shares,
        l.balance_at_time,
        l.full_count
    FROM ledger l
    ORDER BY l.event_timestamp DESC, l.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Summary RPC for the wallet page
CREATE OR REPLACE FUNCTION get_user_summary(target_email TEXT)
RETURNS TABLE (
    total_deposited NUMERIC,
    realized_pnl NUMERIC,
    current_shares NUMERIC,
    user_ownership NUMERIC,
    vault_assets NUMERIC,
    vault_shares NUMERIC,
    vault_margin_used NUMERIC
) AS $$
DECLARE
    v_total_vault_shares NUMERIC;
    v_user_shares NUMERIC;
    v_latest_trade_ts BIGINT;
    v_baseline_deposited NUMERIC;
BEGIN
    -- 1. Vault State
    SELECT total_assets, total_shares INTO vault_assets, vault_shares FROM vault_state LIMIT 1;
    v_total_vault_shares := vault_shares;

    -- 2. User Shares
    SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT', 'RECEIVE') THEN shares WHEN type IN ('WITHDRAWAL', 'SEND') THEN -shares ELSE 0 END), 0) INTO v_user_shares
    FROM vault_transactions WHERE email = target_email;
    current_shares := v_user_shares;

    user_ownership := CASE WHEN v_total_vault_shares > 0 THEN v_user_shares / v_total_vault_shares ELSE 0 END;

    -- 3. Total Deposited (Cash Basis)
    SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT', 'RECEIVE', 'COMMISSION_EARNED') THEN amount WHEN type IN ('WITHDRAWAL', 'SEND') THEN -amount WHEN type = 'COMMISSION_PAID' THEN -ABS(amount) ELSE 0 END), 0) INTO total_deposited
    FROM vault_transactions WHERE email = target_email;

    -- 4. Realized PnL (Weighted by Historical Ownership)
    SELECT COALESCE(SUM(
        ((CASE WHEN t.side = 'BUY' THEN t.exitPrice - t.price ELSE t.price - t.exitPrice END) * t.quantity) * 
        (
            COALESCE((SELECT SUM(CASE WHEN vt.type IN ('DEPOSIT', 'RECEIVE') THEN vt.shares WHEN vt.type IN ('WITHDRAWAL', 'SEND') THEN -vt.shares ELSE 0 END) FROM vault_transactions vt WHERE vt.email = target_email AND vt.timestamp <= t.exitTimestamp), 0) /
            NULLIF((SELECT SUM(CASE WHEN vt2.type IN ('DEPOSIT', 'RECEIVE') THEN vt2.shares WHEN vt2.type IN ('WITHDRAWAL', 'SEND') THEN -vt2.shares ELSE 0 END) FROM vault_transactions vt2 WHERE vt2.timestamp <= t.exitTimestamp), 0)
        )
    ), 0) INTO realized_pnl
    FROM trades t WHERE t.status = 'CLOSED' AND t.exitPrice IS NOT NULL;

    -- 5. Latest Margin
    SELECT COALESCE("totalMarginUsed", 0) INTO vault_margin_used FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT 1;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
