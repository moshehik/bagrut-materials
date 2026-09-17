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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("materials_category_idx").on(t.categoryId)],
);

/** מאגר שיחות מורות (שיחה / חברה / כישורי חיים) — שיחה/פעילות שמורה מעלה, לא "חומר" רגיל של המנהלת */
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
export type Sicha = typeof sichot.$inferSelect;
export type SichaRating = typeof sichaRatings.$inferSelect;
export type SichaUsage = typeof sichaUsages.$inferSelect;
export type SichaIdea = typeof sichaIdeas.$inferSelect;
export type SichaTeacherStatus = typeof sichaTeacherStatus.$inferSelect;
export type SichaSeminar = (typeof sichaSeminarEnum.enumValues)[number];
export type CategoryModule = (typeof categoryModuleEnum.enumValues)[number];
