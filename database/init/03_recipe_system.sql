-- ============================================================
-- Recipe / Ingredient System (Phase 1)
-- نظام الوصفات والمكوّنات — المرحلة الأولى
-- ============================================================
-- يضيف: وحدات القياس + المكوّنات الخام + الوصفات + بنود الوصفة
-- آمن للتشغيل أكثر من مرة (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- وحدات القياس (Units of Measure)
-- base_factor = كم وحدة أساسية تساوي وحدة واحدة من النوع
--   الوزن: الأساس = جرام (جرام=1، كيلوجرام=1000)
--   الحجم: الأساس = مليلتر (مل=1، لتر=1000)
--   العدد: الأساس = قطعة (قطعة=1)
-- التحويل بين وحدتين من نفس النوع: qty * from.base_factor / to.base_factor
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    abbreviation VARCHAR(20) NOT NULL,
    unit_type VARCHAR(20) NOT NULL CHECK (unit_type IN ('weight', 'volume', 'count')),
    base_factor DECIMAL(20, 8) NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- المكوّنات الخام (Ingredients / Raw Materials)
-- unit_id = وحدة المخزون الأساسية للمكوّن (مثلاً جرام للدقيق)
-- cost_per_unit = تكلفة الوحدة الواحدة من unit_id
-- minimum_stock = الحد الأدنى (par level) للتنبيه عند النقص
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
    current_stock DECIMAL(16, 4) NOT NULL DEFAULT 0,
    minimum_stock DECIMAL(16, 4) NOT NULL DEFAULT 0,
    cost_per_unit DECIMAL(16, 4) NOT NULL DEFAULT 0,
    supplier VARCHAR(150),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- الوصفات (Recipes) — وصفة واحدة لكل منتج
-- yield_quantity = عدد الحصص/الأطباق الناتجة من الوصفة (افتراضي 1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    yield_quantity DECIMAL(16, 4) NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- بنود الوصفة (Recipe Items) — كل بند = مكوّن + كمية + وحدة
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity DECIMAL(16, 4) NOT NULL DEFAULT 0,
    unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- الفهارس
CREATE INDEX IF NOT EXISTS idx_ingredients_is_active ON ingredients(is_active);
CREATE INDEX IF NOT EXISTS idx_recipes_product_id ON recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient_id ON recipe_items(ingredient_id);

-- محفّزات updated_at (الدالة معرّفة في 01_schema.sql)
DROP TRIGGER IF EXISTS update_units_updated_at ON units;
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ingredients_updated_at ON ingredients;
CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_recipes_updated_at ON recipes;
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_recipe_items_updated_at ON recipe_items;
CREATE TRIGGER update_recipe_items_updated_at BEFORE UPDATE ON recipe_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- بيانات أولية: وحدات القياس الشائعة
-- ------------------------------------------------------------
INSERT INTO units (name, abbreviation, unit_type, base_factor)
SELECT * FROM (VALUES
    ('جرام',        'جم',   'weight', 1),
    ('كيلوجرام',    'كجم',  'weight', 1000),
    ('مليجرام',     'مجم',  'weight', 0.001),
    ('مليلتر',      'مل',   'volume', 1),
    ('لتر',         'ل',    'volume', 1000),
    ('قطعة',        'قطعة', 'count',  1),
    ('علبة',        'علبة', 'count',  1),
    ('ملعقة كبيرة', 'م.ك',  'volume', 15),
    ('ملعقة صغيرة', 'م.ص',  'volume', 5),
    ('كوب',         'كوب',  'volume', 240)
) AS v(name, abbreviation, unit_type, base_factor)
WHERE NOT EXISTS (SELECT 1 FROM units);

-- ------------------------------------------------------------
-- بيانات أولية: مكوّنات خام نموذجية (تكلفة تقريبية بالجنيه)
-- ------------------------------------------------------------
INSERT INTO ingredients (name, unit_id, current_stock, minimum_stock, cost_per_unit)
SELECT v.name, u.id, v.stock, v.minstock, v.cost
FROM (VALUES
    ('دقيق',            'جرام',  50000, 5000,  0.02),
    ('سكر',             'جرام',  30000, 3000,  0.03),
    ('زيت',             'مليلتر',20000, 2000,  0.05),
    ('جبنة موزاريلا',   'جرام',  15000, 2000,  0.18),
    ('صلصة طماطم',      'مليلتر',10000, 1500,  0.04),
    ('صدور دجاج',       'جرام',  20000, 3000,  0.12),
    ('لحم مفروم',       'جرام',  15000, 2000,  0.22),
    ('خبز برجر',        'قطعة',  200,   30,    3.50)
) AS v(name, unit_name, stock, minstock, cost)
JOIN units u ON u.name = v.unit_name
WHERE NOT EXISTS (SELECT 1 FROM ingredients);
