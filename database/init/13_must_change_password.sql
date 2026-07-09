-- ============================================================
-- Force password change on first login (إجبار تغيير كلمة السر)
-- The seeded accounts all share the default password "admin123".
-- Flag them so the app forces a password change on first login,
-- which is required before selling the system to a real restaurant.
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Only flag accounts that still use the well-known default password hash.
-- (New accounts created by an admin will have must_change_password = false
--  unless the admin sets it.)
UPDATE users SET must_change_password = true
WHERE username IN ('admin', 'manager1', 'server1', 'server2', 'counter1', 'counter2', 'kitchen1');
