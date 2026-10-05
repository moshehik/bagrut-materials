import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const tierEnum = pgEnum("tier", [
  "none",
  "iron",
  "copper",
  "silver",
  "gold",
  "diamond",
]);
export const materialKindEnum = pgEnum("material_kind", [
  "student_sheet", // דף שכפול לתלמידה
  "teacher_sheet", // דף שכפול למורה
  "presentation", // מצגת
  "past_exam", // שאלות מבגרויות קודמות
  "tips", // טיפים ועצות למסירה
  "ideas", // רעיונות, חידות וסיפורים
  "other",
]);
export const accessEnum = pgEnum("access", ["free", "paid", "tier", "premium"]);
export const statusEnum = pgEnum("status", ["active", "suspended", "draft"]);
export const purchaseStatusEnum = pgEnum("purchase_status", ["active", "cancelled", "refunded", "expired"]);
export const txTypeEnum = pgEnum("tx_type", ["charge", "refund", "manual", "adjustment"]);

/** סוג הסמינר שבו נמסרה השיחה — נבחר ע"י המורה המעלה, מוצג כתגית על כרטיס השיחה */
export const sichaSeminarEnum = pgEnum("sicha_seminar", ["mainstream", "kiruv", "charedi_modern"]);
/** האם קטגוריה זו מציגה את ה-UI הרגיל של חומרים, או את מודול מאגר השיחות (שיחה/חברה/כישורי חיים) */
export const categoryModuleEnum = pgEnum("category_module", ["standard", "sichot"]);

export const planEnum = pgEnum("plan", [
  "single", // הורדה בודדת
  "bundle", // קובץ מורחב (תיקייה)
  "subject_monthly",
  "custom_monthly",
  "yearly",
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** פרטי הרשמה (null אצל מי שנרשמה לפני שהשדות נוספו / דרך גוגל). name = שם פרטי + משפחה */
    firstName: varchar("first_name", { length: 60 }),
    lastName: varchar("last_name", { length: 60 }),
    city: varchar("city", { length: 80 }),
    /** שם התיכון שבו היא מלמדת */
    school: varchar("school", { length: 120 }),
    /** אישור דיוור (שיווקי) */
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    /** מתי אישרה את תקנון האתר */
    termsAcceptedAt: timestamp("terms_accepted_at"),
    /** טלפון (ספרות בלבד, ר' normalizeIsraeliPhone) – מוטבע בסימן המים. null אצל מי
     * שנרשמה לפני שהשדה נוסף / דרך גוגל – תתבקש להשלים לפני ההורדה הבאה */
    phone: varchar("phone", { length: 20 }),
    role: roleEnum("role").notNull().default("user"),
    tier: tierEnum("tier").notNull().default("none"),
    /** מספר אישי – מוטבע על כל קובץ שהמשתמשת מורידה */
    personalCode: varchar("personal_code", { length: 16 }).notNull(),
    /** התחברות עם גוגל */
    googleId: varchar("google_id", { length: 64 }),
    avatarUrl: text("avatar_url"),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** מייל חדש שממתין לאימות (בתהליך שינוי כתובת מייל) */
    pendingEmail: varchar("pending_email", { length: 255 }),
    /** חשבון מושהה – לא יכול להתחבר/להוריד */
    suspended: boolean("suspended").notNull().default(false),
    suspendReason: text("suspend_reason"),
    /** נוכחות */
    lastSeenAt: timestamp("last_seen_at"),
    lastIp: varchar("last_ip", { length: 64 }),
    lastPath: varchar("last_path", { length: 500 }),
    /** הגבלת הורדות יומית אישית (null = ברירת מחדל מההגדרות) */
    dailyDownloadLimit: integer("daily_download_limit"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_google_idx").on(t.googleId),
    index("users_last_seen_idx").on(t.lastSeenAt),
    uniqueIndex("users_code_idx").on(t.personalCode),
  ],
);

/** עץ הקטגוריות: מקצוע → יחידות → פנימי/חיצוני → נושא → פרק ... */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id"),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    /** סמל שאלון (למשל 001101) */
    questionnaireCode: varchar("questionnaire_code", { length: 32 }),
    icon: varchar("icon", { length: 40 }),
    color: varchar("color", { length: 20 }),
    sort: integer("sort").notNull().default(0),
    /** מחיר הורדת כל התיקייה כקובץ מורחב (באגורות). null = לא זמין */
    bundlePrice: integer("bundle_price"),
    /** לא נדרש יותר לבחינה (לפי מיקוד משרד החינוך לשנה הנוכחית) — מוצג במפה עם קו חוצה */
    excluded: boolean("excluded").notNull().default(false),
    /** פרק שרק חלקו נדרש: מה הוצא מהמיקוד — מוצג במפה כריבוע "מה לא צריך" צמוד בלי רווח לריבוע הפרק */
    excludedNote: text("excluded_note"),
    /** כבר הוכן חומר בפועל לצומת זה (עדיין לא בהכרח הועלה לאתר) — מוצג במפה עם סימן וי */
    ready: boolean("ready").notNull().default(false),
    /** השהיית דף/תיקייה – מוסתרת מהמשתמשות (מנהלת רואה) */
    status: statusEnum("status").notNull().default("active"),
    /** הגבלת גישה לכל התיקייה לרמת פרימיום מינימלית */
    minTier: tierEnum("min_tier").notNull().default("none"),
    /** "standard" = עמוד חומרים רגיל; "sichot" = מציג את מודול מאגר השיחות (ר' sichot למטה) במקום זאת */
    contentModule: categoryModuleEnum("content_module").notNull().default("standard"),
    /** מזהה תיקיית הדרייב של הקטגוריה (עץ התיקיות משקף את עץ האתר — ר' src/lib/driveTreeCore.ts) */
    driveFolderId: varchar("drive_folder_id", { length: 80 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("categories_parent_idx").on(t.parentId),
    uniqueIndex("categories_parent_slug_idx").on(t.parentId, t.slug),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    kind: materialKindEnum("kind").notNull().default("other"),
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 120 }).notNull(),
    size: integer("size").notNull().default(0),
    /** מחיר הורדה בודדת באגורות */
    price: integer("price").notNull().default(1500),
    /** זמין רק למנויות פרימיום */
    premiumOnly: boolean("premium_only").notNull().default(false),
    /** רמת פרימיום מינימלית לגישה */
    minTier: tierEnum("min_tier").notNull().default("none"),
    sort: integer("sort").notNull().default(0),
    downloads: integer("downloads").notNull().default(0),
    views: integer("views").notNull().default(0),
    /** דירוג גישה: free = חינם למחוברות, paid = רכישה/מנוי, tier = לפי minTier, premium = פרימיום בלבד */
    access: accessEnum("access").notNull().default("paid"),
    /** השהיית דף – לא מוצג ולא ניתן להורדה */
    status: statusEnum("status").notNull().default("active"),
    /** האם ניתן להוריד (אחרת: צפייה בלבד באתר) */
    allowDownload: boolean("allow_download").notNull().default(true),
    /** האם מותר לצפות בתצוגה מקדימה (עמוד ראשון) ללא רכישה */
    allowPreview: boolean("allow_preview").notNull().default(false),
    /** מגבלת הורדות לכל משתמשת לחומר זה (null = ללא) */
    maxDownloadsPerUser: integer("max_downloads_per_user"),
    /** השם שהיה לקובץ בדרייב לפני הארגון מחדש לפי עץ האתר — "תגית השם הישן" (נשמר גם ב-description של הקובץ בדרייב) */
    driveOriginalName: text("drive_original_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("materials_category_idx").on(t.categoryId)],
);

/**
 * בקשת שינוי בקובץ שמורה ביקשה (requestText + ציטוט אופציונלי), ואחרי שהמנהלת מפרסמת אותה כתיקון:
 * fixNumber רץ לכל חומר (1,2,3…) – מוצג באתר בלבד, לא בקובץ שיורד. originalText = הטקסט כפי שהוא בקובץ
 * (מסומן בורוד בהורדה), correctedText = התיקון (מסומן בתכלת). הקובץ המקורי לא משתנה אף פעם –
 * התיקונים מוחלים על ה-docx בזמן ההורדה (ר' src/lib/docx-fixes.ts). שינוי שהמורה לא סימנה בוי – לא מוחל.
 */
export const materialFixes = pgTable(
  "material_fixes",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    /** המבקשת (null אם נמחקה, או תיקון שהמנהלת הוסיפה בעצמה) */
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    requestText: text("request_text").notNull(),
    quoteText: text("quote_text"),
    /** pending = ממתינה למנהלת, published = תיקון מפורסם, merged = שולב בקובץ המקורי (לא מוצג יותר), rejected = נדחתה */
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    fixNumber: integer("fix_number"),
    originalText: text("original_text"),
    correctedText: text("corrected_text"),
    adminNote: text("admin_note"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("material_fixes_material_idx").on(t.materialId),
    uniqueIndex("material_fixes_number_idx").on(t.materialId, t.fixNumber),
  ],
);

/** מאגר שיחות מורות (שיחה / חברה / כישורי חיים) — שיחה/פעילות שמורה מעלה, לא "חומר" רגיל של המנהלת */
/**
 * קופון פרטי של המנהלת – נראה רק בעמוד הניהול, ומופיע ב"קופונים זמינים" רק למשתמשת שכתובת המייל שלה
 * שויכה לקופון (או שמימשה אותו בקוד). חד-פעמי.
 * benefit: percent = הנחה באחוזים על הרכישה הבאה; subjects = גישה חינם למקצועות (subjectIds, JSON) ל-days ימים.
 */
export const privateCoupons = pgTable(
  "private_coupons",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 24 }).notNull(),
    /** כתובת המייל שרשאית לממש (lowercase). null = מי שמחזיקה בקוד */
    email: varchar("email", { length: 255 }),
    label: varchar("label", { length: 120 }).notNull(),
    benefit: varchar("benefit", { length: 12 }).notNull(),
    percent: integer("percent"),
    subjectIds: text("subject_ids"),
    days: integer("days"),
    expiresAt: timestamp("expires_at"),
    /** active / used / revoked */
    status: varchar("status", { length: 10 }).notNull().default("active"),
    /** המשתמשת ששייכה את הקופון לעצמה בקוד (לקופון בלי מייל) */
    claimedBy: integer("claimed_by").references(() => users.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("private_coupons_code_idx").on(t.code), index("private_coupons_email_idx").on(t.email)],
);

export const sichot = pgTable(
  "sichot",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    seminarType: sichaSeminarEnum("seminar_type").notNull(),
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 120 }).notNull(),
    size: integer("size").notNull().default(0),
    /** כלי השעיה בדיעבד למנהלת — פרסום עצמו פתוח וללא אישור מראש */
    status: statusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sichot_category_idx").on(t.categoryId), index("sichot_teacher_idx").on(t.teacherId)],
);

/** דירוג 1-5 של שיחה ע"י מורה — מורה יכולה לעדכן את הדירוג שלה (upsert לפי sichaId+teacherId) */
export const sichaRatings = pgTable(
  "sicha_ratings",
  {
    id: serial("id").primaryKey(),
    sichaId: integer("sicha_id")
      .notNull()
      .references(() => sichot.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sicha_ratings_sicha_teacher_idx").on(t.sichaId, t.teacherId)],
);

/** סימון "השתמשתי בשיחה הזו" — טוגל, שורה אחת למורה לכל שיחה; הספירה = מספר השורות */
export const sichaUsages = pgTable(
  "sicha_usages",
  {
    id: serial("id").primaryKey(),
    sichaId: integer("sicha_id")
      .notNull()
      .references(() => sichot.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sicha_usages_sicha_teacher_idx").on(t.sichaId, t.teacherId)],
);

/** רעיון (משחק/פעילות/סיפור/מדרש) שמורה אחרת הוסיפה על שיחה קיימת */
export const sichaIdeas = pgTable(
  "sicha_ideas",
  {
    id: serial("id").primaryKey(),
    sichaId: integer("sicha_id")
      .notNull()
      .references(() => sichot.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sicha_ideas_sicha_idx").on(t.sichaId)],
);

/** מעקב קצב-העלאה למורות שהצטרפו למאגר השיחות (שורה אחת למורה, נוצרת בהעלאה הראשונה) */
export const sichaTeacherStatus = pgTable("sicha_teacher_status", {
  teacherId: integer("teacher_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastUploadAt: timestamp("last_upload_at").notNull().defaultNow(),
  /** מועד היעד להעלאה הבאה: lastUploadAt + 6 או 10 שבועות, לפי דירוג המורה בעת ההעלאה */
  nextDueAt: timestamp("next_due_at").notNull(),
  /** מתאפס ל-null בכל העלאה חדשה; מסומן ע"י ה-cron כשנשלחה תזכורת למחזור הנוכחי */
  reminderSentAt: timestamp("reminder_sent_at"),
  /** חסימת גישה למאגר השיחות בלבד (לא לשאר האתר) — מבוטלת אוטומטית בהעלאה הבאה */
  blocked: boolean("blocked").notNull().default(false),
});

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: planEnum("plan").notNull(),
    materialId: integer("material_id").references(() => materials.id, {
      onDelete: "set null",
    }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    /** מספר הורדות מותר (למנויים) */
    downloadsLimit: integer("downloads_limit"),
    downloadsUsed: integer("downloads_used").notNull().default(0),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    premium: boolean("premium").notNull().default(false),
    /** מנוי שנתי שנרכש עם "דלג" – המקצועות ייבחרו מאוחר יותר (עד אז אין גישה); ראו /account/subjects */
    subjectsPending: boolean("subjects_pending").notNull().default(false),
    paymentRef: varchar("payment_ref", { length: 120 }),
    status: purchaseStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("purchases_user_idx").on(t.userId)],
);

export const downloads = pgTable(
  "downloads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    watermark: varchar("watermark", { length: 64 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    /** דרך מה הותרה ההורדה: admin/single/bundle/subscription/free */
    via: varchar("via", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("downloads_user_idx").on(t.userId), index("downloads_created_idx").on(t.createdAt)],
);

export const forumThreads = pgTable("forum_threads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  /** סוג ההודעה בפורום: question = שאלה (אפשר להשיב עליה), note = הערה, tip = טיפ */
  kind: varchar("kind", { length: 12 }).notNull().default("question"),
  /** נגזר מתחילת הטקסט (אין יותר כותרת נפרדת) – משמש את הניהול ואת המייל */
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => forumThreads.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("forum_posts_thread_idx").on(t.threadId)],
);

/** דיווח מורה על תוכן לא הולם בפורום (על הודעה = thread או על תשובה = post). המנהלת רואה ב-/admin/forum */
export const forumReports = pgTable(
  "forum_reports",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: integer("thread_id").references(() => forumThreads.id, { onDelete: "cascade" }),
    postId: integer("post_id").references(() => forumPosts.id, { onDelete: "cascade" }),
    /** open = ממתין לטיפול, handled = טופל/נסגר */
    status: varchar("status", { length: 12 }).notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("forum_reports_status_idx").on(t.status)],
);

/** הצעות מכירת חומרים למנהל האתר */
export const sellOffers = pgTable("sell_offers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 120 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  askingPrice: integer("asking_price"),
  fileUrl: text("file_url"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** לוג מיילים – כל שליחה (אוטומטית או ידנית) נרשמת */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: serial("id").primaryKey(),
    to: text("to").notNull(),
    cc: text("cc"),
    subject: varchar("subject", { length: 300 }),
    body: text("body"),
    fileName: varchar("file_name", { length: 255 }),
    /** סוג ההודעה: welcome / purchase / sell_offer / forum_reply / contact / manual / broadcast */
    kind: varchar("kind", { length: 40 }).notNull().default("manual"),
    status: varchar("status", { length: 20 }).notNull().default("success"),
    errorMessage: text("error_message"),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    sentById: integer("sent_by_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [index("email_logs_sent_idx").on(t.sentAt)],
);

/** היסטוריית גלישה – כל צפייה בדף */
export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** מזהה סשן אנונימי (עוגייה) */
    sessionId: varchar("session_id", { length: 64 }),
    path: varchar("path", { length: 500 }).notNull(),
    referer: text("referer"),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    /** משך שהייה בשניות (מתעדכן ב-heartbeat) */
    duration: integer("duration").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("page_views_user_idx").on(t.userId),
    index("page_views_created_idx").on(t.createdAt),
    index("page_views_path_idx").on(t.path),
  ],
);

/** לוג פעולות (audit) – פעולות מנהל ופעולות מערכת חשובות */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 60 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: integer("entity_id"),
    details: text("details"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_actor_idx").on(t.actorId)],
);

/** הגדרות מערכת – מפתח/ערך */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
});

/** עגלת קניות – פריט = חומר בודד או תיקייה (bundle) או מסלול */
export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: integer("material_id").references(() => materials.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
    plan: planEnum("plan"),
    premium: boolean("premium").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("cart_user_idx").on(t.userId)],
);

/** תנועות כספיות – חיובים, זיכויים, תשלומים ידניים */
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    purchaseId: integer("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    type: txTypeEnum("type").notNull().default("charge"),
    /** באגורות; זיכוי = שלילי */
    amount: integer("amount").notNull(),
    method: varchar("method", { length: 40 }),
    reference: varchar("reference", { length: 120 }),
    note: text("note"),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("transactions_created_idx").on(t.createdAt), index("transactions_user_idx").on(t.userId)],
);

/** נושאי לימוד שמעניינים את המשתמשת (להתאמת המלצות/עדכונים) */
export const userInterests = pgTable(
  "user_interests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_interests_user_cat_idx").on(t.userId, t.categoryId),
    index("user_interests_user_idx").on(t.userId),
  ],
);

/** טוקנים לאיפוס סיסמה / אימות מייל */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull(),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("auth_tokens_token_idx").on(t.token)],
);

/** דיווחי תקלות/שאלות מהאתר, לסוכן ה-fix-reports האוטומטי (ר' .claude/commands/fix-reports.md).
 * היה מאוחסן ב-Vercel Blob; הועבר ל-DB אחרי שה-Blob store הושעה (מכסה), 09.2026 —
 * ר' /agent-system לתיעוד המלא. */
export const errorReportStatusEnum = pgEnum("error_report_status", ["OPEN", "ARCHIVED"]);
export const errorReportKindEnum = pgEnum("error_report_kind", ["report", "agentLog"]);
export const errorReportNoteRoleEnum = pgEnum("error_report_note_role", ["support", "reporter"]);
/** מי בפועל כתב תגובת role="support" — פנימי בלבד, לא משפיע על התצוגה החיצונית (ר' agent-system-panel.tsx).
 * קיים כדי שהסוכן האוטומטי יוכל להבדיל בין התגובה-המסכמת של עצמו (ממתינה לאישור משה) לבין תגובה שמנהל/ת הקליד/ה ידנית באותו thread. */
export const errorReportNoteAuthorKindEnum = pgEnum("error_report_note_author_kind", ["agent", "admin"]);

export const errorReports = pgTable(
  "error_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    status: errorReportStatusEnum("status").notNull().default("OPEN"),
    kind: errorReportKindEnum("kind").notNull().default("report"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    time: varchar("time", { length: 100 }),
    url: varchar("url", { length: 500 }),
    title: varchar("title", { length: 200 }),
    queryParams: varchar("query_params", { length: 500 }),
    lastButtons: text("last_buttons"), // JSON.stringify(string[])
    userText: text("user_text").notNull(),
  },
  (t) => [index("error_reports_status_idx").on(t.status), index("error_reports_kind_idx").on(t.kind)],
);

export const errorReportNotes = pgTable(
  "error_report_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    reportId: varchar("report_id", { length: 36 })
      .notNull()
      .references(() => errorReports.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    role: errorReportNoteRoleEnum("role").notNull().default("support"),
    isQuestion: boolean("is_question").notNull().default(false),
    previewUrl: varchar("preview_url", { length: 500 }),
    /** רק כש-role="support": מי כתב בפועל — "agent" (הסוכן האוטומטי) או "admin" (הוקלד ידנית בלוח /agent-system). null עבור role="reporter". */
    authorKind: errorReportNoteAuthorKindEnum("author_kind"),
  },
  (t) => [index("error_report_notes_report_idx").on(t.reportId)],
);

/** דגל הפעלה/כיבוי + שעון-שקט של הסוכן האוטומטי — שורה יחידה (id קבוע = 1) */
export const agentLoopStatus = pgTable("agent_loop_status", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  lastActivityAt: timestamp("last_activity_at"),
});

/**
 * יומן מלא של כל פעולה של סוכן ה-fix-reports (הרצת workflow, כל קריאת כלי של קלוד,
 * כל הודעה שלו, תגובות/PR-ים, הדלקה/כיבוי מהניהול). נכתב ע"י src/lib/agentEvents.ts —
 * מהאתר, מהסקריפטים, ומ-scripts/agent-log-ingest.ts (שמייבא את תמליל ההרצה המלא).
 * מוצג ב-/admin/agent. נוצר ב-SQL גולמי (scripts/_create-agent-events.ts) — db:push שבור כאן.
 */
export const agentEvents = pgTable(
  "agent_events",
  {
    id: serial("id").primaryKey(),
    /** מזהה הרצה: GITHUB_RUN_ID ב-Actions, "admin" לפעולות מהאתר, "local" מקומית */
    runId: varchar("run_id", { length: 64 }),
    /** workflow | claude | script | admin | site */
    source: varchar("source", { length: 20 }).notNull(),
    /** run.check | run.start | run.skip | run.end | toggle | dispatch | message | tool | tool.result | reply | pr | cli | error */
    kind: varchar("kind", { length: 30 }).notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    reportId: varchar("report_id", { length: 36 }),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("agent_events_created_idx").on(t.createdAt),
    index("agent_events_run_idx").on(t.runId),
    index("agent_events_kind_idx").on(t.kind),
  ],
);

/**
 * היסטוריית הדרייב: הוספה/שינוי שם/העברה/העברה לארכיון של קבצים ותיקיות. נכתב ע"י src/lib/driveTreeCore.ts
 * (דרך סקריפט הארגון, הסייר בניהול והעלאות חדשות); מזין את קובץ המידע _מידע.txt של כל תיקייה.
 * נוצר ב-SQL גולמי (scripts/_create-drive-events.ts).
 */
export const driveEvents = pgTable(
  "drive_events",
  {
    id: serial("id").primaryKey(),
    /** file.add | file.rename | file.move | file.archive | file.restore | folder.create | folder.rename | folder.move | info.update */
    kind: varchar("kind", { length: 30 }).notNull(),
    materialId: integer("material_id"),
    categoryId: integer("category_id"),
    driveId: varchar("drive_id", { length: 80 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    details: text("details"),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("drive_events_material_idx").on(t.materialId),
    index("drive_events_category_idx").on(t.categoryId),
    index("drive_events_created_idx").on(t.createdAt),
  ],
);

export const categoriesRelations =relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "tree",
  }),
  children: many(categories, { relationName: "tree" }),
  materials: many(materials),
}));

export const materialsRelations = relations(materials, ({ one }) => ({
  category: one(categories, {
    fields: [materials.categoryId],
    references: [categories.id],
  }),
}));

export const sichotRelations = relations(sichot, ({ one, many }) => ({
  category: one(categories, { fields: [sichot.categoryId], references: [categories.id] }),
  teacher: one(users, { fields: [sichot.teacherId], references: [users.id] }),
  ratings: many(sichaRatings),
  usages: many(sichaUsages),
  ideas: many(sichaIdeas),
}));

export const sichaRatingsRelations = relations(sichaRatings, ({ one }) => ({
  sicha: one(sichot, { fields: [sichaRatings.sichaId], references: [sichot.id] }),
  teacher: one(users, { fields: [sichaRatings.teacherId], references: [users.id] }),
}));

export const sichaUsagesRelations = relations(sichaUsages, ({ one }) => ({
  sicha: one(sichot, { fields: [sichaUsages.sichaId], references: [sichot.id] }),
  teacher: one(users, { fields: [sichaUsages.teacherId], references: [users.id] }),
}));

export const sichaIdeasRelations = relations(sichaIdeas, ({ one }) => ({
  sicha: one(sichot, { fields: [sichaIdeas.sichaId], references: [sichot.id] }),
  teacher: one(users, { fields: [sichaIdeas.teacherId], references: [users.id] }),
}));

export const forumThreadsRelations = relations(forumThreads, ({ one, many }) => ({
  user: one(users, { fields: [forumThreads.userId], references: [users.id] }),
  posts: many(forumPosts),
}));

export const forumPostsRelations = relations(forumPosts, ({ one }) => ({
  user: one(users, { fields: [forumPosts.userId], references: [users.id] }),
  thread: one(forumThreads, {
    fields: [forumPosts.threadId],
    references: [forumThreads.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Tier = (typeof tierEnum.enumValues)[number];
export type MaterialKind = (typeof materialKindEnum.enumValues)[number];
export type Plan = (typeof planEnum.enumValues)[number];
export type Access = (typeof accessEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type PurchaseStatus = (typeof purchaseStatusEnum.enumValues)[number];
export type PageView = typeof pageViews.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type UserInterest = typeof userInterests.$inferSelect;
export type MaterialFix = typeof materialFixes.$inferSelect;
export type Sicha = typeof sichot.$inferSelect;
export type SichaRating = typeof sichaRatings.$inferSelect;
export type SichaUsage = typeof sichaUsages.$inferSelect;
export type SichaIdea = typeof sichaIdeas.$inferSelect;
export type SichaTeacherStatus = typeof sichaTeacherStatus.$inferSelect;
export type SichaSeminar = (typeof sichaSeminarEnum.enumValues)[number];
export type CategoryModule = (typeof categoryModuleEnum.enumValues)[number];
