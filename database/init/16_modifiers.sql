-- ============================================================
-- Product modifiers: sizes and add-ons (الأحجام والإضافات)
--   modifier_groups : a choice group on a product, e.g. "الحجم" or "إضافات"
--   modifiers       : the options inside a group, each with a price delta
--   order_item_modifiers : the options chosen on a sold line item
--
-- Selection rules per group:
--   min_select = 1, max_select = 1  → must pick exactly one (sizes)
--   min_select = 0, max_select = 0  → pick any number (add-ons; 0 = unlimited)
-- ============================================================

CREATE TABLE IF NOT EXISTS modifier_groups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    min_select  INTEGER NOT NULL DEFAULT 0,
    max_select  INTEGER NOT NULL DEFAULT 1, -- 0 = unlimited
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modifiers (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id     UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    price_delta  DECIMAL(10,2) NOT NULL DEFAULT 0, -- added to the product price
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chosen options on a sold line. Name and price are snapshotted so deleting a
-- modifier later never rewrites or destroys past order history.
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id   UUID REFERENCES modifiers(id) ON DELETE SET NULL,
    name          VARCHAR(100) NOT NULL,
    price_delta   DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_product ON modifier_groups(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);
