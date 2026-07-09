-- ============================================================
-- وصفات نموذجية للمنتجات (Phase: recipes seed)
-- تربط كل منتج بمكوّناته من المخزون ليعمل الخصم التلقائي عند البيع.
-- آمن للتشغيل أكثر من مرة: لا يضيف وصفة لمنتج له وصفة بالفعل.
-- الكميات بوحدة المكوّن نفسه (جرام/مليلتر/قطعة).
-- ============================================================

-- دالة مساعدة عبر CTE لكل منتج:
--   1) ينشئ وصفة للمنتج إن لم تكن موجودة (RETURNING id)
--   2) يضيف بنود الوصفة من قائمة (اسم المكوّن، الكمية)

-- بيتزا مارجريتا
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'بيتزا مارجريتا'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 200), ('صلصة طماطم', 80), ('جبنة موزاريلا', 120), ('زيت', 10)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- بيتزا بيبروني
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'بيتزا بيبروني'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 200), ('صلصة طماطم', 80), ('جبنة موزاريلا', 120), ('لحم مفروم', 50)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- بيتزا سوبريم
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'بيتزا سوبريم'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 200), ('صلصة طماطم', 90), ('جبنة موزاريلا', 140), ('لحم مفروم', 60)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- بيتزا هاواي
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'بيتزا هاواي'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 200), ('صلصة طماطم', 80), ('جبنة موزاريلا', 120)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- صدر دجاج مشوي
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'صدر دجاج مشوي'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('صدور دجاج', 250), ('زيت', 15)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- باستا كاربونارا
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'باستا كاربونارا'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 150), ('زيت', 20), ('جبنة موزاريلا', 40)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- ستيك لحم
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'ستيك لحم'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('لحم مفروم', 250), ('زيت', 15)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- أصابع موزاريلا
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'أصابع موزاريلا'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('جبنة موزاريلا', 150), ('دقيق', 50), ('زيت', 30)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- حلقات بصل
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'حلقات بصل'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 60), ('زيت', 40)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- ناتشوز سوبريم
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'ناتشوز سوبريم'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('جبنة موزاريلا', 80), ('لحم مفروم', 60), ('صلصة طماطم', 30)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- أجنحة بافلو
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'أجنحة بافلو'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('صدور دجاج', 200), ('زيت', 25), ('صلصة طماطم', 20)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- كيكة شوكولاتة
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'كيكة شوكولاتة'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 100), ('سكر', 90), ('زيت', 30)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- فطيرة تفاح
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'فطيرة تفاح'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 120), ('سكر', 60), ('زيت', 20)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- تشيز كيك
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'تشيز كيك'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('دقيق', 80), ('سكر', 70), ('جبنة موزاريلا', 60)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- ميلك شيك فانيليا
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'ميلك شيك فانيليا'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('سكر', 45)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- آيس كريم صنداي
WITH r AS (
  INSERT INTO recipes (product_id, yield_quantity)
  SELECT p.id, 1 FROM products p
  WHERE p.name = 'آيس كريم صنداي'
    AND NOT EXISTS (SELECT 1 FROM recipes rr WHERE rr.product_id = p.id)
  RETURNING id
)
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id)
SELECT r.id, i.id, v.qty, i.unit_id
FROM r CROSS JOIN (VALUES ('سكر', 50)) AS v(iname, qty)
JOIN ingredients i ON i.name = v.iname;

-- تحقّق
SELECT count(*) AS recipes_created FROM recipes;
SELECT count(*) AS recipe_items_created FROM recipe_items;
