-- ============================================================
-- Purchasing / Receiving + Stock Counts (Phase 4)
-- المشتريات/التوريد + الجرد (نظري مقابل فعلي)
-- ============================================================
-- آمن للتشغيل أكثر من مرة.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- المشتريات (فاتورة توريد) — تزيد المخزون وتحدّث التكلفة (متوسط مرجّح)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier VARCHAR(150),
    reference VARCHAR(100),                 -- رقم الفاتورة
    total_cost DECIMAL(16, 4) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity DECIMAL(16, 4) NOT NULL DEFAULT 0,
    unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
    unit_cost DECIMAL(16, 4) NOT NULL DEFAULT 0,  -- تكلفة الوحدة (بوحدة الشراء)
    line_total DECIMAL(16, 4) NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
-- الجرد (Stock Count) — يقارن المخزون النظري بالفعلي ويسوّي الفرق
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notes TEXT,
    total_variance_cost DECIMAL(16, 4) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    count_id UUID REFERENCES stock_counts(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
    system_qty DECIMAL(16, 4) NOT NULL DEFAULT 0,   -- النظري (ما يقوله النظام)
    counted_qty DECIMAL(16, 4) NOT NULL DEFAULT 0,  -- الفعلي (المعدود)
    variance DECIMAL(16, 4) NOT NULL DEFAULT 0,     -- counted - system
    variance_cost DECIMAL(16, 4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_ingredient ON purchase_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_created_at ON stock_counts(created_at DESC);
