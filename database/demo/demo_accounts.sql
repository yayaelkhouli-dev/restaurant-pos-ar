-- ============================================================
-- DEMO BUILD ONLY - do not run this on a real restaurant install.
--
-- The shipped product forces every seeded account to choose a new password on
-- first login (see database/init/13_must_change_password.sql). That is correct
-- for a real installation and wrong for a trial: a tester who changes the admin
-- password and forgets it is locked out of the demo.
--
-- So the demo package: one shared password, no forced change.
-- Password for every account below: demo1234
-- The hash is bcrypt cost 10, generated and verified against "demo1234".
-- ============================================================

UPDATE users
SET password_hash        = '$2a$10$SFVLSSKblyBkwNezxdU8aOQayOeNpaAko0bOFVrdrjzTNv5ULZw.q',
    must_change_password = false
WHERE username IN ('admin', 'manager1', 'server1', 'server2', 'counter1', 'counter2', 'kitchen1');

-- Make it obvious on screen that this is a trial copy.
INSERT INTO settings (key, value) VALUES ('restaurant_name', 'مطعم التجربة')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
