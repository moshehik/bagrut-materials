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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("materials_category_idx").on(t.categoryId)],
);

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("downloads_user_idx").on(t.userId)],
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

export const categoriesRelations = relations(categories, ({ one, many }) => ({
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
