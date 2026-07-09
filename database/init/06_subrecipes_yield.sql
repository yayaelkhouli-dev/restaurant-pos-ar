-- ============================================================
-- Sub-recipes (Preparations) + Ingredient Yield/Waste (Phase 3)
-- الوصفات الفرعية (التحضيرات) + نسبة الهالك للمكوّنات
-- ============================================================
-- آمن للتشغيل أكثر من مرة.

-- ------------------------------------------------------------
-- recipes: دعم الوصفات الفرعية (تحضيرة تُصنع مرة وتُستخدم في أصناف كثيرة)
--   is_sub_recipe = true  → وصفة فرعية ليست مرتبطة بمنتج
--   name          = اسم التحضيرة (للوصفات الفرعية فقط)
--   yield_unit_id = وحدة قياس الناتج (مثلاً: 1000 مل صوص)
-- ------------------------------------------------------------
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_sub_recipe BOOLEAN DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_unit_id UUID REFERENCES units(id);

-- ------------------------------------------------------------
-- recipe_items: بند الوصفة ممكن يكون مكوّن خام أو تحضيرة (وصفة فرعية)
--   إمّا ingredient_id (مكوّن) أو sub_recipe_id (تحضيرة) — واحد منهم فقط
-- ------------------------------------------------------------
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS sub_recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT;
ALTER TABLE recipe_items ALTER COLUMN ingredient_id DROP NOT NULL;

-- ------------------------------------------------------------
-- ingredients: نسبة الهالك (Yield/Waste) — الجزء المفقود في التحضير
--   مثال: بصل هالكه 10% → لاستخدام 100ج صافي تحتاج 111ج إجمالي
-- ------------------------------------------------------------
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS waste_pct DECIMAL(5, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_recipe_items_sub_recipe ON recipe_items(sub_recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_is_sub ON recipes(is_sub_recipe);
