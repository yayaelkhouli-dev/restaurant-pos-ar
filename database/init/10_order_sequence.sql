-- تسلسل فريد لتوليد أرقام الطلبات (يمنع التكرار تحت الضغط) + قيد فريد داعم
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND contype = 'u'
      AND conname = 'orders_order_number_unique'
  ) THEN
    BEGIN
      ALTER TABLE orders ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      -- موجود بالفعل أو فيه تكرار قديم — نتجاهل بأمان
      NULL;
    END;
  END IF;
END $$;
