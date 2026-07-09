-- Seed data for POS System

-- Insert default users
INSERT INTO users (username, email, password_hash, first_name, last_name, role) VALUES
('admin', 'admin@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Admin', 'User', 'admin'),
('manager1', 'manager@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'John', 'Manager', 'manager'),
('server1', 'server1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Sarah', 'Smith', 'server'),
('server2', 'server2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Mike', 'Johnson', 'server'),
('counter1', 'counter1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Lisa', 'Davis', 'counter'),
('counter2', 'counter2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Tom', 'Wilson', 'counter'),
('kitchen1', 'kitchen@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Chef', 'Williams', 'kitchen');

-- Insert categories
INSERT INTO categories (name, description, color, sort_order) VALUES
('مقبّلات', 'أطباق بادئة وأطباق صغيرة', '#FF6B6B', 1),
('أطباق رئيسية', 'الأطباق الأساسية والرئيسية', '#4ECDC4', 2),
('مشروبات', 'مشروبات وغازيات ومنعشات', '#45B7D1', 3),
('حلويات', 'حلويات ومأكولات سكرية', '#96CEB4', 4),
('سلطات', 'سلطات طازجة وخيارات صحية', '#FECA57', 5),
('بيتزا', 'أنواع متعددة من البيتزا', '#FF9FF3', 6);

-- Insert products
INSERT INTO products (category_id, name, description, price, sku, preparation_time, sort_order) VALUES
-- Appetizers
((SELECT id FROM categories WHERE name = 'مقبّلات'), 'أجنحة بافلو', 'أجنحة دجاج مقرمشة بصوص البافلو', 12.99, 'APP001', 15, 1),
((SELECT id FROM categories WHERE name = 'مقبّلات'), 'أصابع موزاريلا', 'أصابع موزاريلا مغطّاة بالبقسماط مع صوص المارينارا', 8.99, 'APP002', 10, 2),
((SELECT id FROM categories WHERE name = 'مقبّلات'), 'ناتشوز سوبريم', 'رقائق ناتشوز بالجبن والهالابينو وإضافات', 11.49, 'APP003', 12, 3),
((SELECT id FROM categories WHERE name = 'مقبّلات'), 'حلقات بصل', 'حلقات بصل مقرمشة', 7.99, 'APP004', 8, 4),

-- Main Courses
((SELECT id FROM categories WHERE name = 'أطباق رئيسية'), 'صدر دجاج مشوي', 'صدر دجاج متبّل مشوي مع خضار', 18.99, 'MAIN001', 20, 1),
((SELECT id FROM categories WHERE name = 'أطباق رئيسية'), 'ستيك لحم', 'ستيك لحم بقري فاخر يُطهى حسب الطلب', 26.99, 'MAIN002', 25, 2),
((SELECT id FROM categories WHERE name = 'أطباق رئيسية'), 'سمك وبطاطس', 'سمك مقلي مقرمش مع بطاطس', 16.99, 'MAIN003', 18, 3),
((SELECT id FROM categories WHERE name = 'أطباق رئيسية'), 'باستا كاربونارا', 'باستا كريمية بالبيكون والبارميزان', 15.99, 'MAIN004', 15, 4),
((SELECT id FROM categories WHERE name = 'أطباق رئيسية'), 'ضلوع باربكيو', 'ضلوع مطهوّة على نار هادئة بصوص الباربكيو', 22.99, 'MAIN005', 30, 5),

-- Beverages
((SELECT id FROM categories WHERE name = 'مشروبات'), 'كوكا كولا', 'مشروب كولا غازي كلاسيكي', 2.99, 'BEV001', 0, 1),
((SELECT id FROM categories WHERE name = 'مشروبات'), 'عصير برتقال طازج', 'عصير برتقال طازج معصور', 4.99, 'BEV002', 2, 2),
((SELECT id FROM categories WHERE name = 'مشروبات'), 'قهوة', 'قهوة طازجة', 3.49, 'BEV003', 3, 3),
((SELECT id FROM categories WHERE name = 'مشروبات'), 'شاي مثلّج', 'شاي مثلّج منعش', 2.99, 'BEV004', 1, 4),
((SELECT id FROM categories WHERE name = 'مشروبات'), 'ميلك شيك فانيليا', 'ميلك شيك فانيليا كريمي', 5.99, 'BEV005', 4, 5),

-- Desserts
((SELECT id FROM categories WHERE name = 'حلويات'), 'كيكة شوكولاتة', 'كيكة شوكولاتة غنية بالكريمة', 6.99, 'DES001', 5, 1),
((SELECT id FROM categories WHERE name = 'حلويات'), 'فطيرة تفاح', 'فطيرة تفاح كلاسيكية بالقرفة', 5.99, 'DES002', 8, 2),
((SELECT id FROM categories WHERE name = 'حلويات'), 'آيس كريم صنداي', 'آيس كريم فانيليا مع إضافات', 4.99, 'DES003', 3, 3),
((SELECT id FROM categories WHERE name = 'حلويات'), 'تشيز كيك', 'تشيز كيك على طريقة نيويورك', 7.99, 'DES004', 5, 4),

-- Salads
((SELECT id FROM categories WHERE name = 'سلطات'), 'سلطة سيزر', 'خس روماني بصوص السيزر', 9.99, 'SAL001', 8, 1),
((SELECT id FROM categories WHERE name = 'سلطات'), 'سلطة يونانية', 'خضروات طازجة مع جبنة فيتا', 11.99, 'SAL002', 10, 2),
((SELECT id FROM categories WHERE name = 'سلطات'), 'سلطة خضار', 'خضار ورقية متنوّعة مع خضروات', 8.99, 'SAL003', 6, 3),

-- Pizza
((SELECT id FROM categories WHERE name = 'بيتزا'), 'بيتزا مارجريتا', 'بيتزا كلاسيكية بالطماطم والموزاريلا والريحان', 14.99, 'PIZ001', 16, 1),
((SELECT id FROM categories WHERE name = 'بيتزا'), 'بيتزا بيبروني', 'بيتزا بالبيبروني والجبن', 16.99, 'PIZ002', 16, 2),
((SELECT id FROM categories WHERE name = 'بيتزا'), 'بيتزا سوبريم', 'بيتزا محمّلة بإضافات متنوّعة', 19.99, 'PIZ003', 20, 3),
((SELECT id FROM categories WHERE name = 'بيتزا'), 'بيتزا هاواي', 'بيتزا بالجبن واللحم والأناناس', 17.99, 'PIZ004', 16, 4);

-- Insert dining tables
INSERT INTO dining_tables (table_number, seating_capacity, location) VALUES
('T01', 2, 'Main Floor'),
('T02', 4, 'Main Floor'),
('T03', 4, 'Main Floor'),
('T04', 6, 'Main Floor'),
('T05', 2, 'Main Floor'),
('T06', 4, 'Window Side'),
('T07', 4, 'Window Side'),
('T08', 8, 'Private Room'),
('T09', 2, 'Patio'),
('T10', 4, 'Patio'),
('BAR01', 1, 'Bar Counter'),
('BAR02', 1, 'Bar Counter'),
('BAR03', 1, 'Bar Counter'),
('TAKEOUT', 1, 'Takeout Counter');

-- Insert initial inventory
INSERT INTO inventory (product_id, current_stock, minimum_stock, maximum_stock, unit_cost) 
SELECT 
    id as product_id,
    50 as current_stock,
    10 as minimum_stock,
    100 as maximum_stock,
    price * 0.4 as unit_cost
FROM products;

-- ملاحظة: لا تُزرع أي طلبات/مدفوعات تجريبية — النظام يبدأ بدون طلبات (بداية نظيفة).

