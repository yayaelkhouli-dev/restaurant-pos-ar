-- ============================================================
-- Shifts + cash drawer reconciliation (الورديات ودرج النقدية)
-- A shift is opened with a starting cash float and closed with a
-- counted cash amount. The Z-report (تقرير آخر اليوم) reconciles the
-- counted cash against what the system expects.
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opened_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at     TIMESTAMP WITH TIME ZONE,
    opening_cash  DECIMAL(10,2) NOT NULL DEFAULT 0,
    closing_cash  DECIMAL(10,2),  -- physically counted at close
    expected_cash DECIMAL(10,2),  -- opening + net cash movements
    difference    DECIMAL(10,2),  -- counted - expected (over/short)
    status        VARCHAR(10) NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    notes         TEXT
);

-- Only one shift may be open at a time (single cash drawer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open ON shifts ((status)) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts (opened_at DESC);

-- Tie every payment to the shift it was taken in, so cash can be reconciled
ALTER TABLE payments ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_shift_id ON payments (shift_id);
