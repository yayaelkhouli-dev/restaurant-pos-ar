-- ضبط أسعار المنتجات لقيم واقعية بالجنيه المصري (بدل الأسعار التجريبية القديمة بالدولار)
-- المطابقة بالاسم العربي.

-- أطباق رئيسية
UPDATE products SET price = 130 WHERE name = 'باستا كاربونارا';
UPDATE products SET price = 220 WHERE name = 'ستيك لحم';
UPDATE products SET price = 160 WHERE name = 'سمك وبطاطس';
UPDATE products SET price = 140 WHERE name = 'صدر دجاج مشوي';
UPDATE products SET price = 200 WHERE name = 'ضلوع باربكيو';

-- بيتزا
UPDATE products SET price = 150 WHERE name = 'بيتزا بيبروني';
UPDATE products SET price = 180 WHERE name = 'بيتزا سوبريم';
UPDATE products SET price = 130 WHERE name = 'بيتزا مارجريتا';
UPDATE products SET price = 160 WHERE name = 'بيتزا هاواي';

-- حلويات
UPDATE products SET price = 55 WHERE name = 'آيس كريم صنداي';
UPDATE products SET price = 70 WHERE name = 'تشيز كيك';
UPDATE products SET price = 60 WHERE name = 'فطيرة تفاح';
UPDATE products SET price = 65 WHERE name = 'كيكة شوكولاتة';

-- سلطات
UPDATE products SET price = 60 WHERE name = 'سلطة خضار';
UPDATE products SET price = 85 WHERE name = 'سلطة سيزر';
UPDATE products SET price = 80 WHERE name = 'سلطة يونانية';

-- مشروبات
UPDATE products SET price = 30 WHERE name = 'شاي مثلّج';
UPDATE products SET price = 40 WHERE name = 'عصير برتقال طازج';
UPDATE products SET price = 35 WHERE name = 'قهوة';
UPDATE products SET price = 25 WHERE name = 'كوكا كولا';
UPDATE products SET price = 50 WHERE name = 'ميلك شيك فانيليا';

-- مقبّلات
UPDATE products SET price = 90 WHERE name = 'أجنحة بافلو';
UPDATE products SET price = 75 WHERE name = 'أصابع موزاريلا';
UPDATE products SET price = 55 WHERE name = 'حلقات بصل';
UPDATE products SET price = 95 WHERE name = 'ناتشوز سوبريم';

SELECT count(*) FILTER (WHERE price < 25) AS suspiciously_cheap, count(*) AS total FROM products;
