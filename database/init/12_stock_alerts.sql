-- ============================================================
-- Stock alerts (تنبيهات المخزون)
-- Persist events the manager must see: failed stock deduction on
-- a sale, or an ingredient going negative (oversold). Previously
-- these were only written to a log file nobody reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(30) NOT NULL, -- 'deduction_failed' | 'negative_stock'
    order_id UUID,
    ingredient_id UUID,
    message TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_unresolved ON stock_alerts(resolved, created_at DESC);
