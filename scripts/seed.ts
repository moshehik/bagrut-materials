/**
 * זריעת עץ הקטגוריות + משתמש מנהל.
 * הרצה: npx tsx scripts/seed.ts   (או: npm run db:seed)
 * אידמפוטנטי: upsert לפי (parent, slug).
 * SEED_DEMO=1 → זורע גם כמה חומרי דמו תחת כתובים/תהילים/פרק א'.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { SUBJECT_ICONS } from "../src/lib/constants";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { categories, materials, users } = schema;

/* ---------- tree definition ---------- */

type Node = {
  slug: string;
  title: string;
  questionnaireCode?: string;
  bundlePrice?: number;
  description?: string;
  children?: Node[];
};

const PALETTE = ["#2f6fed", "#f472b6", "#b98555", "#d4a017", "#1d4ed8", "#ec4899", "#8a5a2b"];

const perakim = (list: [string, string][]): Node[] =>
  list.map(([slug, title]) => ({ slug, title }));
const perek123 = perakim([
  ["perek-1", "פרק א'"],
  ["perek-2", "פרק ב'"],
  ["perek-3", "פרק ג'"],
]);

/** פרקי תהילים בשאלון החיצוני המשותף (3381) — לפי מיקוד משרד החינוך, פיקוח חרדי */
const tehilimPerakim = perakim([
  ["perek-1", "פרק א'"],
  ["perek-19", 'פרק י"ט'],
  ["perek-20", "פרק כ'"],
  ["perek-23", 'פרק כ"ג'],
  ["perek-24", 'פרק כ"ד'],
  ["perek-27", 'פרק כ"ז'],
  ["perek-29", 'פרק כ"ט'],
  ["perek-30", "פרק ל'"],
  ["perek-33", 'פרק ל"ג'],
  ["perek-34", 'פרק ל"ד'],
  ["perek-47", 'פרק מ"ז'],
  ["perek-48", 'פרק מ"ח'],
  ["perek-130", 'פרק ק"ל'],
  ["perek-136", 'פרק קל"ו'],
  ["perek-137", 'פרק קל"ז'],
  ["perek-145-150", 'פרקים קמ"ה-ק"נ'],
]);

/** פרקי יחזקאל בשאלון החיצוני המשותף (3381) — נביאים אחרונים */
const yechezkelPerakim = perakim([
  ["perek-2", "פרק ב'"],
  ["perek-3", "פרק ג'"],
  ["perek-18", 'פרק י"ח'],
  ["perek-20", "פרק כ'"],
  ["perek-36", 'פרק ל"ו'],
  ["perek-37", 'פרק ל"ז'],
  ["perek-38", 'פרק ל"ח (מפסוק י"ח)'],
  ["perek-39", 'פרק ל"ט (עד פסוק ט"ז)'],
  ["perek-44", 'פרק מ"ד (פסוקים ט"ו-ל"א)'],
]);

/** שמואל א' — נביאים ראשונים, בשאלון הבית-ספרי (3573/3373) */
const shmuelAlefPerakim: Node[] = [
  { slug: "perek-1-2", title: "פרקים א'-ב' – חנה ותפילתה" },
  { slug: "perek-3-7", title: "פרקים ג', ז' – שמואל כנביא וכשופט" },
  { slug: "perek-8-12", title: 'פרקים ח\'-י"ב – בקשת המלוכה ושאול' },
  { slug: "perek-16-17", title: 'פרקים ט"ז-י"ז – דוד' },
  { slug: "perek-18-26", title: 'פרקים י"ח-כ"ד, כ"ו – שאול ויחסו לדוד' },
];
/** שמואל ב' — נביאים ראשונים, בשאלון הבית-ספרי (3573/3373) */
const shmuelBetPerakim: Node[] = [
  { slug: "perek-1", title: "פרק א' – קינת דוד" },
  { slug: "perek-5", title: "פרק ה' – המלכת דוד" },
  { slug: "perek-6", title: "פרק ו' – העלאת ארון ה'" },
  { slug: "perek-14-18", title: 'פרקים י"ד-י"ח – מרד אבשלום' },
];

/** תוכן הלכתי משותף לשאלון 4381 החיצוני (3 ו-5 יח"ל) */
const YAHADUT_CORE_TOPICS: Node[] = [
  { slug: "shabbat", title: "הלכות שבת", description: 'לפי "יסודות ועיקרים בהלכות שבת", הוצאת מכון אור מאיר' },
  { slug: "tefila", title: "תפילה", description: 'לפי קיצור שולחן ערוך' },
  { slug: "brachot", title: "ברכות", description: 'לפי קיצור שולחן ערוך' },
  { slug: "yom-tov", title: "הלכות יום טוב", description: 'לפי קיצור שולחן ערוך' },
  { slug: "kashrut", title: "כשרות", description: 'לפי קיצור שולחן ערוך' },
  { slug: "bein-adam-lechavero", title: "מצוות בין אדם לחברו" },
  { slug: "mitzvot-shonot", title: 'מצוות שונות (כיבוד או"ב, כבוד רבו, איסור יחוד, שעטנז)' },
];

/** תוכן מחשבה ומוסר לשאלון הבית-ספרי (4373/4573) */
const YAHADUT_MACHSHAVA_TOPICS: Node[] = [
  { slug: "pirkei-avot", title: 'פרקי אבות (עם פירוש הר"ע מברטנורה)' },
  { slug: "rambam", title: 'רמב"ם – הלכות תשובה, משנה תורה' },
  { slug: "ramban-al-hatora", title: 'רמב"ן על התורה' },
  { slug: "mesilat-yesharim", title: "מסילת ישרים (רמח\"ל)" },
  { slug: "sefer-hachinuch", title: 'ספר החינוך (ר\' אהרון הלוי)' },
  { slug: "beit-elokim", title: 'בית אלוקים – שער התפילה (המבי"ט)' },
  { slug: "sichot-musar", title: "שיחות מוסר – הכרת הטוב (ר' חיים שמואלביץ')" },
  { slug: "michtav-meeliyahu", title: 'מכתב מאליהו – קונטרס החסד (הרב דסלר)' },
  { slug: "chovot-halevavot", title: "חובות הלבבות – שער התשובה, שער עבודת האלוקים (רבינו בחיי)" },
];

/** פרשות בראשית משותפות לשאלון הבית-ספרי (3573/3373) – וירא, חיי שרה, תולדות */
const BEREISHIT_SCHOOL_PARSHIOT: Node[] = [
  { slug: "vayera", title: "פרשת וירא", children: perek123 },
  { slug: "chayei-sara", title: "פרשת חיי שרה", children: perek123 },
  { slug: "toldot", title: "פרשת תולדות", children: perek123 },
];

/** חלופות לבחירה בשאלון 3583 (5 יח"ל) – יש לבחור 3 מתוך 4 */
const TORAH_5U_CHALUFOT: Node[] = [
  { slug: "chalufa-a", title: 'חלופה א׳ – עיון בראשית (ויחי) ודברים (האזינו, וזאת הברכה)' },
  { slug: "chalufa-b", title: "חלופה ב' – ויקרא (אחרי מות, קדושים, אמור)" },
  { slug: "chalufa-c", title: "חלופה ג' – במדבר (2 מתוך בהעלותך/שלח/קורח)" },
  { slug: "chalufa-d", title: "חלופה ד' – כתובים (רות ואסתר, משלי, קהלת, עזרא-נחמיה)" },
];

/** חלופות לבחירה בשאלון 3383 (3 יח"ל) – חלופה אחת מ-א'/ב', חלופה אחת מ-ג'/ד' */
const TORAH_3U_CHALUFOT: Node[] = [
  { slug: "chalufa-a", title: "חלופה א' – עיון בראשית (ויחי) ודברים (וזאת הברכה)" },
  { slug: "chalufa-b", title: "חלופה ב' – במדבר (2 מתוך בהעלותך/שלח/קורח)" },
  { slug: "chalufa-c", title: "חלופה ג' – כתובים (רות ואסתר, קהלת)" },
  { slug: "chalufa-d", title: "חלופה ד' – כתובים (עזרא-נחמיה, משלי)" },
];

const TANACH_NOTE =
  'בבגרות החרדית תורה, נביא וכתובים נבחנים יחד בשאלון תנ"ך משותף (פיקוח חרדי) — הסמלים כאן משותפים לשלושתם. הפרקים המפורטים הם תוכנית הלימודים הבסיסית; יתכנו החרגות/מיקוד משתנים משנה לשנה. החל מכיתה י׳ תשפ"ה קיימת גם "תכנית בגרויות גמישה" מקבילה (שאלונים אחרים: 3311/3312/3321/3322/3315/3325 ועוד) שטרם מופתה כאן במלואה.';

const TREE: Node[] = [
  {
    slug: "torah",
    title: "תורה",
    description: TANACH_NOTE,
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "3381",
            children: [
              { slug: "shemot", title: "פרשת שמות", children: perek123 },
              { slug: "devarim", title: "פרשת דברים", children: perek123 },
              { slug: "vaetchanan", title: "פרשת ואתחנן", children: perek123 },
            ],
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית – פרשות נבחרות",
                questionnaireCode: "3373",
                children: BEREISHIT_SCHOOL_PARSHIOT,
              },
              {
                slug: "school-based-electives",
                title: "הערכה בית ספרית – חלופות לבחירה",
                questionnaireCode: "3383",
                children: TORAH_3U_CHALUFOT,
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "3382" },
            ],
          },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "3381",
            children: [
              {
                slug: "devarim",
                title: "פרשת דברים",
                bundlePrice: 9900,
                children: [
                  { slug: "hakdamat-haramban", title: 'הקדמת הרמב"ן' },
                  ...perek123,
                ],
              },
            ],
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית – פרשות נבחרות",
                questionnaireCode: "3573",
                children: BEREISHIT_SCHOOL_PARSHIOT,
              },
              {
                slug: "school-based-electives",
                title: "הערכה בית ספרית – חלופות לבחירה",
                questionnaireCode: "3583",
                children: TORAH_5U_CHALUFOT,
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "3372" },
            ],
          },
          {
            slug: "unit-hagever",
            title: 'יחידת הגבר (תוספת חיצונית ל-5 יח"ל)',
            questionnaireCode: "3281",
            description: 'בראשית/דברים בעיון, מלכים א׳-ב׳, ישעיה ותרי עשר',
          },
        ],
      },
    ],
  },
  {
    slug: "navi",
    title: "נביא",
    description: TANACH_NOTE,
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "3381",
            children: [{ slug: "yechezkel", title: "יחזקאל", children: yechezkelPerakim }],
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית",
                questionnaireCode: "3373",
                children: [
                  { slug: "shmuel-a", title: "שמואל א'", children: shmuelAlefPerakim },
                  { slug: "shmuel-b", title: "שמואל ב'", children: shmuelBetPerakim },
                ],
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "3382" },
            ],
          },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "3381",
            children: [{ slug: "yechezkel", title: "יחזקאל", children: yechezkelPerakim }],
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית",
                questionnaireCode: "3573",
                children: [
                  { slug: "shmuel-a", title: "שמואל א'", children: shmuelAlefPerakim },
                  { slug: "shmuel-b", title: "שמואל ב'", children: shmuelBetPerakim },
                ],
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "3372" },
            ],
          },
          {
            slug: "unit-hagever",
            title: 'יחידת הגבר (תוספת חיצונית ל-5 יח"ל)',
            questionnaireCode: "3281",
            description: "מלכים א׳-ב׳, ישעיה ותרי עשר",
          },
        ],
      },
    ],
  },
  {
    slug: "ktuvim",
    title: "כתובים",
    description: TANACH_NOTE,
    children: [
      {
        slug: "tehilim",
        title: "תהילים",
        questionnaireCode: "3381",
        children: tehilimPerakim,
      },
      {
        slug: "megilat-esther",
        title: "מגילת אסתר – הערכה חלופית",
        description:
          "אחת מ-3-4 חלופות לבחירה בהערכה הבית-ספרית (יחד עם רות, משלי, קהלת, עזרא-נחמיה).",
      },
    ],
  },
  {
    slug: "lashon",
    title: "לשון",
    description:
      'שני השאלונים חיצוניים לחלוטין (אין מסלול פנימי מאומת): 75281 (70% מהציון – הבנת הנקרא והבעה 50%, לשון ומטה-לשון 50%; בית הספר בוחר מראש אם נבחנים במערכת הצורות/גזרות או בתחביר) ו-75282 (30%, לנבחנים חיצוניים/משנה). גרסה מותאמת ללקויי למידה: 75241.',
    children: [
      {
        slug: "internal",
        title: "חומר לימוד – לשון ומטה-לשון",
        description:
          'תוכן הנלמד בבית הספר לקראת השאלון החיצוני (לא מסלול הערכה פנימי נפרד – ראו הערה במקצוע).',
        children: [
          {
            slug: "internal-material",
            title: "מערכת הצורות",
            children: [
              { slug: "chelkei-dibur", title: "חלקי דיבר" },
              {
                slug: "gzarot",
                title: "גזרות",
                children: [
                  { slug: "hagroniyot", title: "הגרוניות" },
                  { slug: "merubaim", title: "מרובעים" },
                  { slug: "nafyo", title: 'נפ"יו' },
                  { slug: "chafan", title: 'חפ"ן' },
                  { slug: "nala", title: 'נל"א' },
                  { slug: "nalyeh", title: 'נל"י/ה' },
                  { slug: "naoy", title: 'נע"ו/י' },
                ],
              },
              { slug: "darchei-tzura", title: "דרכי תצורה" },
              { slug: "beinoni", title: "בינוני" },
            ],
          },
          {
            slug: "talkit",
            title: "תלקיט",
            children: [{ slug: "talkitim-lebchira", title: "תלקיטים לבחירה" }],
          },
        ],
      },
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "75281",
        description: "הבנת הנקרא, הבעה ולשון (70% מהציון). המשך: שאלון 75282 (30%).",
        children: [
          { slug: "tachbir", title: "תחביר" },
          { slug: "havanat-hanikra", title: "הבנת הנקרא" },
          { slug: "hava'a", title: "הבעה" },
        ],
      },
    ],
  },
  {
    slug: "sifrut",
    title: "ספרות",
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "10281",
        description: '70% מהציון, 2 יח"ל.',
        children: [
          { slug: "piyut", title: "פיוט" },
          { slug: "shirat-yemei-habeinaim", title: "שירת ימי הביניים" },
          { slug: "proza", title: "פרוזה – סיפורת" },
          { slug: "shira-chadasha", title: "שירה חדשה" },
          { slug: "machaze", title: "מחזה ופלייטונים" },
        ],
      },
      {
        slug: "internal",
        title: "בגרות פנימית",
        children: [
          {
            slug: "school-based",
            title: "הערכה בית ספרית",
            questionnaireCode: "10283",
            description: '30% מהציון.',
            children: [
              { slug: "shira-hazman", title: "שירה חדשה בנושא הזמן" },
              { slug: "shoah", title: "יצירות בנושא השואה" },
              { slug: "meshalim", title: "משלים עבריים ומתורגמים" },
              { slug: "sefer-nivchar", title: "קריאה מונחית – ספר אחד מבין המבחר" },
            ],
          },
          {
            slug: "alternative",
            title: "הערכה חלופית – לבתי ספר ללא הכרה/אקסטרניים/נבחני משנה",
            questionnaireCode: "10282",
            description: '30% מהציון.',
          },
        ],
      },
    ],
  },
  {
    slug: "english",
    title: "אנגלית",
    description:
      'בגרות באנגלית בנויה ממודולים מצטברים (לא פנימי/חיצוני). הסמלים ארציים — זהים בכל המגזרים, לא ייחודיים לחרדים. שימוש בפועל אינו אחיד: מוסדות בנות (חינוך עצמאי) לומדות ובוחנות לפי מודולים אלו, אך חלק ניכר ממוסדות הבנים (בפרט "מוסדות הפטור") אינם מלמדים אנגלית באופן פורמלי וכלל אינם ניגשים לבגרות בה.',
    children: [
      { slug: "module-a", title: 'יחידה A (3 יח"ל)', questionnaireCode: "16381" },
      { slug: "module-b", title: 'יחידה B (3 יח"ל)', questionnaireCode: "16384" },
      { slug: "module-c", title: 'יחידה C (3-4 יח"ל)', questionnaireCode: "16382" },
      { slug: "module-d", title: 'יחידה D (4 יח"ל)', questionnaireCode: "16484" },
      { slug: "module-e", title: 'יחידה E (4-5 יח"ל)', questionnaireCode: "16481" },
      { slug: "module-e-vocab", title: "יחידה E – אוצר מילים", questionnaireCode: "16471" },
      { slug: "module-f", title: 'יחידה F (5 יח"ל)', questionnaireCode: "16584" },
      { slug: "module-g", title: 'יחידה G (5 יח"ל)', questionnaireCode: "16582" },
    ],
  },
  {
    slug: "yahadut",
    title: "יהדות",
    description:
      'כולל את חומר הדינים (קיצור שולחן ערוך) — הלכה נבחנת כחלק משאלוני יהדות ולא כמקצוע בגרות נפרד.',
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "4381",
            description: "40% מהציון.",
            children: YAHADUT_CORE_TOPICS,
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית",
                questionnaireCode: "4373",
                description: "30% מהציון.",
                children: YAHADUT_MACHSHAVA_TOPICS,
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "4382" },
            ],
          },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית",
            questionnaireCode: "4381",
            description: "20% מהציון.",
            children: YAHADUT_CORE_TOPICS,
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית",
                questionnaireCode: "4573",
                description: "20% מהציון.",
                children: YAHADUT_MACHSHAVA_TOPICS,
              },
              { slug: "alternative", title: "הערכה חלופית", questionnaireCode: "4582" },
            ],
          },
          {
            slug: "unit-hagever",
            title: 'יחידת הגבר (תוספת חיצונית ל-5 יח"ל)',
            questionnaireCode: "4281",
            description: "40% מהציון.",
            children: [
              { slug: "sefer-hachinuch", title: 'ספר החינוך (ר\' אהרון הלוי)' },
              { slug: "kuzari", title: "הכוזרי (ר' יהודה הלוי)" },
              { slug: "peirush-hamishna", title: "רמב\"ם – פירוש המשנה, שמונה פרקים, י\"ג עיקרים" },
              { slug: "mishne-tora", title: 'רמב"ם – משנה תורה (הלכות יסודי התורה, תשובה, מלכים)' },
              { slug: "ramban-al-hatora", title: 'רמב"ן על התורה' },
              { slug: "drashot-haran", title: 'דרשות הר"ן' },
              { slug: "mesilat-yesharim", title: "מסילת ישרים (רמח\"ל)" },
              { slug: "derech-chaim", title: 'מהר"ל – דרך החיים לפרקי אבות' },
              { slug: "michtav-meeliyahu", title: 'מכתב מאליהו – קונטרס הבחירה (הרב דסלר)' },
              { slug: "kovetz-maamarim", title: "קובץ מאמרים – מאמר על אמונה (הרב אלחנן וסרמן)" },
              { slug: "emuna-uvitachon", title: 'אמונה וביטחון (החזון איש)' },
              { slug: "netivot-shalom", title: 'נתיבות שלום – טהרת המידות (האדמו"ר מסלונים)' },
              { slug: "chaim-friedlander", title: "הרב חיים פרידלנדר – שבת, הצנע לכת" },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "math",
    title: "מתמטיקה",
    description:
      'לא אותר סמל שאלון חרדי ייעודי — אלו הסמלים הארציים הכלליים (זהים בכל המגזרים). בפועל בתי ספר חרדיים רבים, בפרט מוסדות בנים, אינם ניגשים לבגרות פורמלית במתמטיקה.',
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        children: [
          { slug: "school-based", title: "הערכה בית ספרית", questionnaireCode: "35182" },
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35381" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35382" },
        ],
      },
      {
        slug: "4-units",
        title: "בגרות 4 יחידות",
        children: [
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35481" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35482" },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        children: [
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35581" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35582" },
        ],
      },
    ],
  },
  {
    slug: "dinim",
    title: "דינים",
    description:
      'אינו מקצוע בגרות נפרד במשרד החינוך — נבחן כחלק משאלוני "יהדות" (קיצור שולחן ערוך, ובנפרד הלכות שבת מ"יסודות ועיקרים בהלכות שבת"). ראי סמלים תחת יהדות.',
  },
  {
    slug: "history",
    title: "היסטוריה",
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        children: [
          { slug: "main-exam", title: "מבחן עיקרי (70%)", questionnaireCode: "030-281" },
          {
            slug: "substitute",
            title: "תחליף למטלת הביצוע – לנבחנות חיצוניות/משנה (30%)",
            questionnaireCode: "030-282",
          },
        ],
      },
      {
        slug: "internal",
        title: "בגרות פנימית",
        children: [
          {
            slug: "school-based",
            title: "הערכה חלופית – מטלת ביצוע (30%, תוכנית טרום-רפורמה)",
            questionnaireCode: "030-283",
            description: 'יהדות רוסיה, אנטישמיות מודרנית, השואה, א"י 1939-1948, מלחמת העצמאות',
          },
        ],
      },
      {
        slug: "topics",
        title: "תוכן הלימודים",
        children: [
          { slug: "topic-1", title: 'נושא ראשון: תנועות ושיטות בעם ישראל במאות הי"ח-הי"ט' },
          { slug: "topic-2", title: "נושא שני: ארץ ישראל – ארץ הקודש, ישן מול חדש" },
          { slug: "topic-3", title: "נושא שלישי: ארץ ישראל תחת שלטון המנדט הבריטי" },
          { slug: "topic-4", title: "נושא רביעי: יהדות התפוצות" },
          { slug: "topic-5", title: "נושא חמישי: חורבן יהדות אירופה" },
          {
            slug: "topic-6",
            title: 'נושא שישי: מדינת ישראל – מהכרזת המדינה עד לאחר מלחמת יום הכיפורים',
          },
        ],
      },
    ],
  },
  {
    slug: "ezrachut",
    title: "אזרחות",
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        children: [
          { slug: "main-exam", title: "מבחן עיקרי (80%)", questionnaireCode: "071-281" },
          {
            slug: "substitute",
            title: "תחליף למטלת הביצוע – לנבחנות חיצוניות/משנה (20%)",
            questionnaireCode: "071-282",
          },
        ],
      },
      {
        slug: "internal",
        title: "בגרות פנימית",
        children: [
          {
            slug: "school-based",
            title: "מטלת ביצוע (20%)",
            questionnaireCode: "071-283",
          },
        ],
      },
      {
        slug: "topics",
        title: "תוכן הלימודים",
        children: [
          { slug: "topic-a", title: "עם ישראל – עם התורה" },
          { slug: "topic-b", title: "אופייה של מדינת ישראל" },
          { slug: "topic-c", title: "דמוקרטיה" },
          { slug: "topic-d", title: "המשטר הדמוקרטי בעולם ובישראל" },
          { slug: "topic-e", title: "מפלגות ובחירות במדינת ישראל" },
          { slug: "topic-f", title: "חוקה וחוקי יסוד" },
          { slug: "topic-g", title: "אזרחות ישראלית וזכות עלייה לישראל" },
          { slug: "topic-h", title: "הרשות המחוקקת – הכנסת" },
          { slug: "topic-i", title: "עבודת הכנסת" },
          { slug: "topic-j", title: "הרשות המבצעת – הממשלה" },
          { slug: "topic-k", title: "הרשות השופטת" },
          { slug: "topic-l", title: "נשיא המדינה" },
          { slug: "topic-m", title: "פיקוח וביקורת על רשויות השלטון" },
          { slug: "topic-n", title: "השלטון המקומי" },
          { slug: "topic-o", title: "דת ומדינה" },
          { slug: "topic-p", title: "החיים הרוחניים" },
        ],
      },
    ],
  },
  {
    slug: "sicha",
    title: "שיחה",
    description: "אינו מקצוע בגרות רשמי במשרד החינוך — שיחת מוסר/השקפה פנימית בלבד, ללא סמל שאלון.",
  },
  {
    slug: "chevra",
    title: "חברה",
    description: "אינו מקצוע בגרות רשמי במשרד החינוך במגזר החרדי — ללא סמל שאלון.",
  },
  {
    slug: "teacher",
    title: "הרחבת ידע למורה",
    description:
      'אינו מקצוע בגרות לתלמידות — זהו כינוי לתוכניות "הרחבת הסמכה" למורות מוסמכות (לימודי המשך לתעודת הוראה נוספת). מומלץ לשקול הסרה ממפת הבגרות או הבהרה שזה תוכן נפרד.',
  },
];

/* ---------- upsert ---------- */

const stats = { inserted: 0, updated: 0 };

async function upsertCategory(
  node: Node,
  parentId: number | null,
  sort: number,
  extra: { icon?: string; color?: string } = {},
): Promise<number> {
  const cond =
    parentId === null
      ? and(isNull(categories.parentId), eq(categories.slug, node.slug))
      : and(eq(categories.parentId, parentId), eq(categories.slug, node.slug));
  const [existing] = await db.select({ id: categories.id }).from(categories).where(cond).limit(1);

  const values = {
    parentId,
    slug: node.slug,
    title: node.title,
    description: node.description ?? null,
    questionnaireCode: node.questionnaireCode ?? null,
    bundlePrice: node.bundlePrice ?? null,
    icon: extra.icon ?? null,
    color: extra.color ?? null,
    sort,
  };

  let id: number;
  if (existing) {
    await db.update(categories).set(values).where(eq(categories.id, existing.id));
    id = existing.id;
    stats.updated++;
  } else {
    const [row] = await db.insert(categories).values(values).returning({ id: categories.id });
    id = row.id;
    stats.inserted++;
  }

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await upsertCategory(children[i], id, (i + 1) * 10);
  }
  return id;
}

async function findByPath(path: string[]): Promise<number | null> {
  let parentId: number | null = null;
  for (const slug of path) {
    const cond: SQL | undefined =
      parentId === null
        ? and(isNull(categories.parentId), eq(categories.slug, slug))
        : and(eq(categories.parentId, parentId), eq(categories.slug, slug));
    const [c]: { id: number }[] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(cond)
      .limit(1);
    if (!c) return null;
    parentId = c.id;
  }
  return parentId;
}

async function seedDemoMaterials() {
  const catId = await findByPath(["ktuvim", "tehilim", "perek-1"]);
  if (!catId) {
    console.warn("demo: category ktuvim/tehilim/perek-1 not found");
    return 0;
  }
  const demos: {
    title: string;
    kind: schema.MaterialKind;
    fileName: string;
    price: number;
    premiumOnly: boolean;
  }[] = [
    { title: "דף שכפול לתלמידה – תהילים פרק א'", kind: "student_sheet", fileName: "תהילים א לתלמיד.pdf", price: 1500, premiumOnly: false },
    { title: "דף שכפול למורה – תהילים פרק א'", kind: "teacher_sheet", fileName: "תהילים א למורה.pdf", price: 2500, premiumOnly: false },
    { title: "מצגת מלווה – תהילים פרק א'", kind: "presentation", fileName: "תהילים א מצגת.pptx", price: 2000, premiumOnly: true },
    { title: "שאלות מבגרויות קודמות – תהילים פרק א'", kind: "past_exam", fileName: "תהילים א בגרות.pdf", price: 1800, premiumOnly: true },
  ];
  let n = 0;
  for (let i = 0; i < demos.length; i++) {
    const d = demos[i];
    const [exists] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.categoryId, catId), eq(materials.title, d.title)))
      .limit(1);
    if (exists) continue;
    await db.insert(materials).values({
      categoryId: catId,
      title: d.title,
      description: "חומר דמו לתצוגה בלבד",
      kind: d.kind,
      fileUrl: "https://example.com/demo.pdf",
      fileName: d.fileName,
      mime: d.fileName.endsWith(".pptx")
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : "application/pdf",
      size: 245_000,
      price: d.price,
      premiumOnly: d.premiumOnly,
      sort: (i + 1) * 10,
    });
    n++;
  }
  return n;
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)[0];
  if (!email) {
    console.warn("ADMIN_EMAILS not set – skipping admin user");
    return { email: null, created: false };
  }
  const [exists] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (exists) {
    if (exists.role !== "admin") {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, exists.id));
    }
    return { email, created: false };
  }
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin1234!";
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    passwordHash,
    name: "מנהל האתר",
    role: "admin",
    tier: "diamond",
    personalCode: "ADMN-0001",
  });
  return { email, created: true, password };
}

async function main() {
  console.log("Seeding categories…");
  for (let i = 0; i < TREE.length; i++) {
    const n = TREE[i];
    await upsertCategory(n, null, (i + 1) * 10, {
      icon: SUBJECT_ICONS[n.slug] ?? "📁",
      color: PALETTE[i % PALETTE.length],
    });
  }
  console.log(`Categories: ${stats.inserted} inserted, ${stats.updated} updated`);

  if (process.env.SEED_DEMO === "1") {
    const n = await seedDemoMaterials();
    console.log(`Demo materials inserted: ${n}`);
  }

  const admin = await seedAdmin();
  if (admin.email) {
    console.log(
      admin.created
        ? `Admin user created: ${admin.email} / ${admin.password}`
        : `Admin user exists: ${admin.email}`,
    );
  }

  const c = (await db.select({ id: categories.id }).from(categories)).length;
  const m = (await db.select({ id: materials.id }).from(materials)).length;
  const u = (await db.select({ id: users.id }).from(users)).length;
  console.log(`Totals → categories: ${c}, materials: ${m}, users: ${u}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
