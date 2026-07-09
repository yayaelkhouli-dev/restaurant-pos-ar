-- ============================================================
-- Stock Movements + Auto-Deduction (Phase 2)
-- حركات المخزون + الخصم التلقائي عند البيع
-- ============================================================
-- سجل تدقيق لكل حركة مخزون: بيع / إضافة / هالك / تعديل يدوي / استرجاع إلغاء
-- آمن للتشغيل أكثر من مرة.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('sale', 'purchase', 'waste', 'adjustment', 'cancel_return', 'restock')),
    quantity DECIMAL(16, 4) NOT NULL,          -- بوحدة مخزون المكوّن. موجب = دخول، سالب = خروج
    balance_after DECIMAL(16, 4),              -- رصيد المخزون بعد الحركة (لقطة)
    reference_type VARCHAR(20),                -- 'order' أو 'manual'
    reference_id UUID,                         -- معرّف الطلب مثلاً
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
