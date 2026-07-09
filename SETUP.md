# تركيب النظام على جهاز جديد

هذا الدليل يعيد بناء النظام كاملاً من هذا المستودع. اتّبعه بالترتيب.

> **ما هو موجود هنا وما هو ليس هنا**
>
> | | في المستودع؟ |
> |---|---|
> | كل الكود (الخادم، الواجهة) | ✅ |
> | ملفات إنشاء قاعدة البيانات (`database/init/*.sql`) | ✅ |
> | ملفات التشغيل لويندوز (`scripts/windows/`) | ✅ |
> | PostgreSQL و Go و Node.js | ❌ تُحمّل من مواقعها |
> | **بياناتك: الطلبات والمبيعات والمخزون** | ❌ **نسخة احتياطية منفصلة** |
> | مفتاح التوقيع `jwt.key` وملفات `.env` | ❌ تُنشأ محلياً |

---

## الشكل المطلوب على القرص

المستودع لازم يكون **داخل** مجلد رئيسي، وبجانبه PostgreSQL وبياناتك:

```
D:\pos2\                 <- المجلد الرئيسي (اسمه غير مهم)
  pgsql\                 PostgreSQL المحمول
  pgdata\                بياناتك الحيّة
  backups\               النسخ الاحتياطية (تُنشأ تلقائياً)
  goroot\go\             Go المحمول (اختياري)
  poinf\                 <- هذا المستودع
    backend\  frontend\  database\  scripts\
```

ملفات التشغيل تحسب هذه المسارات بنفسها، فلا تحتاج لتعديل أي شيء.

---

## 1. المتطلبات

| البرنامج | الإصدار | ملاحظة |
|---|---|---|
| **PostgreSQL** | 15 أو أحدث | النسخة المحمولة (zip) أسهل — فُكّها في `<الرئيسي>\pgsql` |
| **Node.js** | 18 أو أحدث | من nodejs.org — يُثبّت عادياً |
| **Go** | 1.21 أو أحدث | إما مثبّت عادي، أو محمول في `<الرئيسي>\goroot\go` |

## 2. تجهيز قاعدة البيانات

```bat
cd /d D:\pos2
pgsql\bin\initdb.exe -D pgdata -U postgres -A trust -E UTF8
pgsql\bin\pg_ctl.exe -D pgdata -l pg-server.log -w start
pgsql\bin\psql.exe -U postgres -c "ALTER USER postgres PASSWORD 'كلمة-سر-قوية';"
pgsql\bin\psql.exe -U postgres -c "CREATE DATABASE pos_system;"
```

## 3. إعداد ملفات البيئة

```bat
copy poinf\backend\.env.example  poinf\backend\.env
copy poinf\frontend\.env.example poinf\frontend\.env
```

افتح `poinf\backend\.env` وضع كلمة السر التي اخترتها في `DB_PASSWORD`.

> إذا غيّرت كلمة سر قاعدة البيانات، عرّف المتغير `POS_DB_PASSWORD` بنفس القيمة
> قبل تشغيل `backup-pos.bat` أو `db-reset.bat`، وإلا سيفشلان.

## 4. إنشاء الجداول

```bat
poinf\scripts\windows\db-reset.bat
```

يحمّل كل ملفات `database/init/*.sql` بالترتيب الرقمي. **يمسح أي بيانات موجودة**،
لذلك لا تشغّله على نظام فيه مبيعات حقيقية.

## 5. البناء والتشغيل

```bat
poinf\scripts\windows\build-backend.bat
poinf\scripts\windows\build-frontend.bat
poinf\scripts\windows\start-pos.bat
```

يفتح المتصفح على `http://localhost:3000`، ويطبع عنوان الشبكة المحلية لبقية
الأجهزة (`http://192.168.x.x:3000`).

### الحسابات الافتراضية

بعد تركيب جديد، الحسابات السبعة (`admin`, `manager1`, `server1`, `server2`,
`counter1`, `counter2`, `kitchen1`) كلمة سرها `admin123`، و**النظام يجبرك على
تغييرها عند أول دخول**. غيّرها فعلاً — خصوصاً `admin`.

---

## استعادة بياناتك من نسخة احتياطية

هذا هو الجزء الذي لا يحفظه GitHub. النسخ الاحتياطية في `<الرئيسي>\backups\`.

```bat
pgsql\bin\pg_restore.exe -h 127.0.0.1 -U postgres -d pos_system --clean --if-exists backups\pos_20260709_233000.dump
```

**اعمل نسخة احتياطية يومياً.** شغّل `scripts\windows\backup-pos.bat` يدوياً، أو
اربطه بـ Task Scheduler في ويندوز ليعمل كل ليلة. الملف يحذف تلقائياً النسخ
الأقدم من 30 يوماً.

---

## أوامر التشغيل اليومية

| الملف | يعمل ماذا |
|---|---|
| `start-pos.bat` | يشغّل قاعدة البيانات + الخادم + الواجهة، ويفتح المتصفح |
| `stop-pos.bat` | يوقف كل شيء |
| `backup-pos.bat` | نسخة احتياطية من قاعدة البيانات |
| `build-frontend.bat` | **لازم بعد أي تعديل في الواجهة** حتى يظهر |
| `build-backend.bat` | بعد أي تعديل في كود Go |
| `db-reset.bat` | ⚠️ يمسح كل شيء ويعيد البناء من الصفر |

## عمل النظام على الشبكة

الخادم يعمل على جهاز واحد. باقي الأجهزة (تابلت، لابتوب) تفتح
`http://<عنوان-الخادم>:3000` من نفس شبكة الواي فاي.

إذا لم تفتح الصفحة، غالباً **جدار الحماية** يمنع المنفذ 3000. اسمح للمنفذين
3000 و8080 في Windows Defender Firewall.
