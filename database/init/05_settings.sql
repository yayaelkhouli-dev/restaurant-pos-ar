-- ============================================================
-- System Settings (key-value)
-- إعدادات النظام — تُحفظ فعلياً في قاعدة البيانات
-- ============================================================
-- آمن للتشغيل أكثر من مرة.

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- القيم الافتراضية (تُدرج فقط إن لم تكن موجودة)
INSERT INTO settings (key, value) VALUES
    ('restaurant_name',    'مطعمي'),
    ('currency',           'EGP'),
    ('tax_rate',           '10.00'),
    ('service_charge',     '0.00'),
    ('receipt_header',     'شكراً لتناولكم الطعام معنا!'),
    ('receipt_footer',     'في انتظار زيارتكم مجدداً!'),
    ('receipt_width',      '80'),
    ('notification_email', 'admin@restaurant.com'),
    ('backup_frequency',   'daily'),
    ('theme',              'light'),
    ('language',           'ar')
ON CONFLICT (key) DO NOTHING;
