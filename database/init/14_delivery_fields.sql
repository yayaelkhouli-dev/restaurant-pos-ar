-- ============================================================
-- Delivery order fields (حقول طلبات التوصيل)
-- Phone, address and a delivery fee for takeout/delivery orders.
-- The delivery fee is added on top of the order total.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee     DECIMAL(10,2) NOT NULL DEFAULT 0;
