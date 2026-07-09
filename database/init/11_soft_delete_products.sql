-- ============================================================
-- Soft-delete for products (يحمي تاريخ المبيعات عند حذف منتج)
-- Deleting a product used to CASCADE-delete its order_items rows,
-- destroying the sales history of completed orders and corrupting
-- reports. We now soft-delete such products (is_deleted = true) and
-- change the FK to RESTRICT so history can never be wiped by a delete.
-- ============================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);

-- Change order_items.product_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'order_items_product_id_fkey'
          AND table_name = 'order_items'
    ) THEN
        ALTER TABLE order_items DROP CONSTRAINT order_items_product_id_fkey;
    END IF;

    ALTER TABLE order_items
        ADD CONSTRAINT order_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
END $$;
