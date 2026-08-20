/**
 * זריעת עץ הקטגוריות + משתמש מנהל.
 * הרצה: npx tsx scripts/seed.ts   (או: npm run db:seed)
 * אידמפוטנטי: upsert לפי (parent, slug).
 * SEED_DEMO=1  → זורע גם כמה חומרי דמו תחת כתובים/תהילים/פרק א'.
 * SEED_PRUNE=1 → מוחק קטגוריות ישנות שאינן בעץ הנוכחי (רק אם אין חומרים בתת-העץ שלהן).
 *
 * מקורות התוכן: תכניות הלימודים הרשמיות של הפיקוח החרדי (תשפ"ו) —
 * תנ"ך 3/5 יח"ל, יהדות ודינים 3/5 יח"ל, ספרות, היסטוריה, אזרחות, מנהל וכלכלה 30%/70% —
 * וכן לוח הבגרויות הבית-ספרי תשפ"ו (סמלי שאלונים במתמטיקה, אנגלית ולשון).
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

/* --- עזרי פרקים בגימטריה --- */
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת"];
function hebNum(n: number): string {
  let s = HUNDREDS[Math.floor(n / 100)];
  const r = n % 100;
  if (r === 15) s += "טו";
  else if (r === 16) s += "טז";
  else s += TENS[Math.floor(r / 10)] + ONES[r % 10];
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
}
/** פרק בודד */
const perek = (n: number, suffix?: string): Node => ({
  slug: `perek-${n}`,
  title: `פרק ${hebNum(n)}${suffix ? ` (${suffix})` : ""}`,
});
/** טווח פרקים רצוף */
const prakim = (from: number, to: number): Node[] => {
  const out: Node[] = [];
  for (let n = from; n <= to; n++) out.push(perek(n));
  return out;
};
/** רשימת פרקים לפי מספרים */
const prakimOf = (...nums: number[]): Node[] => nums.map((n) => perek(n));
/** סימן בקיצור שולחן ערוך, עם פירוט הסעיפים הנלמדים */
const siman = (n: number, seifim?: string): Node => ({
  slug: `siman-${n}`,
  title: `סימן ${hebNum(n)}`,
  description: seifim ? (seifim === "כולו" ? "הסימן כולו." : `סעיפים ${seifim}.`) : undefined,
});

/** הערה משותפת לתורה/נביא/כתובים */
const TANACH_NOTE =
  'בבגרות החרדית תורה, נביא וכתובים נבחנים יחד בשאלוני תנ"ך משותפים (הפיקוח על תנ"ך חינוך חרדי). כאן מוצג בכל מקצוע החלק שלו מכל שאלון, לפי תכניות הלימודים הרשמיות לתשפ"ו. הסמלים משותפים לשלושת המקצועות.';

/* ---- תנ"ך: שאלון חיצוני 3381 – חלק החומש (עיון בשמות) ---- */
const SHEMOT_3381: Node[] = [
  {
    slug: "bo",
    title: "פרשת בא",
    description:
      'עם פירוש רש"י, וקטעי מפרשים: רמב"ן י"ב ב\' ("וטעם החדש הזה לכם"), רמב"ן י"ב מ\' (ב-5 יח"ל), ספורנו י"ב מ"ג, ספורנו י"ג ב\'.',
    children: [perek(10), perek(11), perek(12), perek(13, 'עד פסוק ט"ז')],
  },
  {
    slug: "beshalach",
    title: "פרשת בשלח",
    description:
      'עם פירוש רש"י, וקטעי מפרשים: ספורנו י"ג י"ז (ב-5 יח"ל), רמב"ן ט"ו כ"ז, רמב"ן ט"ז ב\', רשב"ם ט"ז כ"ג, רמב"ן י"ז א\'.',
    children: [perek(13, 'מפסוק י"ז'), perek(14), perek(15), perek(16), perek(17)],
  },
  {
    slug: "yitro",
    title: "פרשת יתרו",
    description: 'עם פירוש רש"י, וקטעי מפרשים: ספורנו י"ח ט\', רמב"ן י"ח ט"ו, רשב"ם כ\' ח\'.',
    children: prakim(18, 20),
  },
  {
    slug: "mishpatim",
    title: 'פרשת משפטים (מפרק כ"ד)',
    description: 'מפרק כ"ד עד סוף הפרשה, כהשלמה לעניין מתן תורה. עם פירוש רש"י.',
    children: [perek(24)],
  },
];

/* ---- תנ"ך: הערכה בית ספרית 3373/3573 – חלק החומש (עיון בראשית) ---- */
const BEREISHIT_SCHOOL: Node[] = [
  {
    slug: "vayera",
    title: "פרשת וירא",
    description: 'עם פירוש רש"י, וקטעי מפרשים: רמב"ן י"ח ז\', ספורנו י"ט ט"ז, רמב"ן כ"ב א\'.',
    children: prakim(18, 22),
  },
  {
    slug: "chayei-sara",
    title: "פרשת חיי שרה",
    description: 'עם פירוש רש"י, וקטעי מפרשים: כלי יקר כ"ה א\', רמב"ן כ"ה ח\'.',
    children: [perek(23), perek(24), perek(25, 'עד פסוק י"ח')],
  },
  {
    slug: "toldot",
    title: "פרשת תולדות",
    description:
      'עם פירוש רש"י, וקטעי מפרשים: רמב"ן כ"ו כ\', ספורנו כ"ז ד\', רמב"ן כ"ז ל"ג, רמב"ן כ"ח ה\'.',
    children: [perek(25, 'מפסוק י"ט'), perek(26), perek(27), perek(28, "עד פסוק ט'")],
  },
];

/* ---- חלופות במדבר (משותף ל-3383 חלופה ב' ול-3583 חלופה ג') ---- */
const BAMIDBAR_CHALUFA: Node[] = [
  {
    slug: "behaalotcha",
    title: "פרשת בהעלותך",
    children: prakim(8, 12),
  },
  {
    slug: "shlach",
    title: "פרשת שלח",
    children: prakim(13, 15),
  },
  {
    slug: "korach",
    title: "פרשת קורח",
    children: prakim(16, 18),
  },
];

/* ---- חלופה א': ויחי (+וזאת הברכה / האזינו) ---- */
const VAYECHI: Node = {
  slug: "vayechi",
  title: "פרשת ויחי",
  description:
    'עם פירוש רש"י, וקטעי מפרשים: רמב"ן מ"ז כ"ט, רמב"ן מ"ז ל"א, ספורנו מ"ח י\', ספורנו מ"ט י\'.',
  children: [perek(47, 'מפסוק כ"ח'), perek(48), perek(49), perek(50)],
};
const VEZOT_HABRACHA: Node = {
  slug: "vezot-habracha",
  title: "פרשת וזאת הברכה",
  description: 'עם פירוש רש"י.',
  children: [perek(33), perek(34)],
};

/** פרקי תהילים בשאלון החיצוני 3381 */
const tehilimPerakim: Node[] = [
  perek(1),
  perek(19),
  perek(20),
  perek(23),
  perek(24),
  perek(27),
  perek(29),
  perek(30),
  perek(33),
  perek(34),
  perek(47),
  perek(48),
  perek(130),
  perek(136),
  perek(137),
  { slug: "perek-145-150", title: 'פרקים קמ"ה-ק"נ' },
];

/** פרקי תהילים ביחידת הגבר 3281 */
const tehilimHagever: Node[] = [
  perek(49),
  perek(51),
  perek(79),
  perek(81),
  perek(82),
  { slug: "perek-90-95", title: "פרקים צ'-צ\"ה" },
  perek(100),
  perek(104),
  perek(107),
  { slug: "perek-111-118", title: 'פרקים קי"א-קי"ח' },
  perek(139),
];

/** פרקי יחזקאל בשאלון החיצוני 3381 */
const yechezkelPerakim: Node[] = [
  perek(2),
  perek(3),
  perek(18),
  perek(20),
  perek(36),
  perek(37),
  perek(38, 'מפסוק י"ח'),
  perek(39, 'עד פסוק ט"ז'),
  perek(44, 'פסוקים ט"ו-ל"א'),
];

/** פרקי ירמיה בשאלון החיצוני 3381 */
const yirmiyaPerakim: Node[] = [
  perek(1),
  perek(2),
  perek(7),
  perek(8, 'מפסוק י"ג'),
  perek(9),
  perek(16, 'מפסוק י"ט'),
  perek(17, 'עד פסוק י"ד'),
  perek(31),
];

/** פרקי ישעיה בשאלון החיצוני 3381 */
const yeshayaPerakim: Node[] = [
  perek(1),
  perek(2),
  perek(40),
  perek(41),
  perek(43),
  perek(44),
  perek(57, 'מפסוק י"ד'),
  perek(58),
  perek(60),
  perek(66),
];

/** שמואל א' – נביאים ראשונים, הערכה בית ספרית 3373/3573 */
const shmuelAlefPerakim: Node[] = [
  { slug: "perek-1-2", title: "פרקים א'-ב' – חנה ותפילתה" },
  { slug: "perek-3-12", title: 'פרקים ג\', ז\', ט\', י"ב – שמואל כנביא וכשופט' },
  { slug: "perek-8-12", title: 'פרקים ח\', י"ב – בקשת המלוכה ותגובת שמואל' },
  { slug: "perek-9-12", title: 'פרקים ט\'-י"ב – שאול: מעלותיו ומשיחתו למלך' },
  { slug: "perek-16-17", title: 'פרקים ט"ז-י"ז – דוד: מעלותיו ומשיחתו למלך' },
  { slug: "perek-18-26", title: 'פרקים י"ח-כ"ד, כ"ו – שאול ויחסו לדוד' },
];
/** שמואל ב' – נביאים ראשונים, הערכה בית ספרית 3373/3573 */
const shmuelBetPerakim: Node[] = [
  { slug: "perek-1", title: "פרק א' – קינת דוד על שאול ויהונתן" },
  { slug: "perek-5", title: "פרק ה' – המלכת דוד על כל ישראל" },
  { slug: "perek-6", title: "פרק ו' – העלאת ארון ה' לעיר דוד" },
  { slug: "perek-14-18", title: 'פרקים י"ד-י"ח – מרד אבשלום' },
];

/* ---- יהדות/דינים: תוכן משותף לשאלון 4381 החיצוני (3 ו-5 יח"ל) ---- */
const YAHADUT_CORE_TOPICS: Node[] = [
  {
    slug: "shabbat",
    title: "שבת",
    description: 'לפי "יסודות ועיקרים בהלכות שבת" (מכון אור מאיר).',
    children: [perek(5), perek(12), perek(13)],
  },
  {
    slug: "tefila",
    title: "תפילה",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      siman(1, "א'-ד'"),
      siman(2, "א', ג'-ט'"),
      siman(3, 'ב\' (עד "על הכנעה וצניעות"), ג\'-ה\', ז\''),
      siman(6, "א'-ד', ו'-י\"א"),
      siman(7, "ב'-ז'"),
      siman(12, 'א\' (עד "ילביש את עצמו כראוי"), ב\'-ג\', ה\'-ו\''),
      siman(14, 'א\', ב\' (החל מ"ויאמר כל פסוקי דזמרא"), ג\'-ה\''),
      siman(16, "כולו"),
      siman(17, "א'-ו', ח'-ט'"),
      siman(18, 'א\'-ח\', ט\' (עד "ירוק לימנו"), י\'-י"ב, י"ד-ט"ז, י"ח-כ"א'),
      siman(19, "א'-ה', ו'-ח', י'-י\"ב, י\"ד"),
      siman(68, "א'-ה'"),
      siman(69, "א'-ד'"),
    ],
  },
  {
    slug: "brachot",
    title: "ברכות",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      siman(40, "א'-ב', ד'-ז', ח'-י\"ג, י\"ד-כ'"),
      siman(41, "א'-ה', ו'-ז', ח', ט'-י'"),
      siman(42, "א'-י\"א, ט\"ו, י\"ז-כ\"ג"),
      siman(43, "א'-ב', ג'-ז'"),
      siman(44, "א'-י\"ז"),
      siman(48, "א'-ז', ח', ט'-י'"),
      siman(50, "א'-ה', ז'-ט\"ז"),
      siman(51, "כולו"),
      siman(52, "א'-ו', ח'-ט', ט\"ז, י\"ח"),
      siman(53, "א'-ה'"),
      siman(54, "א'-ו', ט'"),
      siman(55, "כולו"),
      siman(56, "כולו"),
      siman(57, "א'-ו'"),
      siman(58, "א'-ה', ז', י\"ג"),
      siman(59, "א'-ב', ד', ו'-ח', ט', י\"א-י\"ד, ט\"ז-י\"ט"),
      siman(60, "א'-ח'"),
    ],
  },
  {
    slug: "yom-tov",
    title: "הלכות יום טוב",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      siman(98, 'א\', ז\', ט\', י"א (עד "מוצאי יו"ט וישרפנה"), כ"ג-כ"ה, כ"ז-ל"א, ל"ג, ל"ד, ל"ה'),
      siman(99, "א'-ב'"),
      siman(102, "א'-ו'"),
      siman(103, "כולו"),
      siman(104, "א'-ה', ח'-ט', י\"א-ט\"ו, י\"ז-י\"ט"),
      siman(105, "כולו"),
      siman(106, "א'-ב', ה'"),
    ],
  },
  {
    slug: "kashrut",
    title: "כשרות",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      siman(36, "א'-י\"ב, י\"ד-י\"ז, כ'-כ\"ב, כ\"ו-כ\"ח"),
      siman(37, "א', ג'-ה', ח', י'-י\"ב"),
      siman(46, "א'-ג', ה'-ט\"ז, כ\"א, כ\"ה-כ\"ז, ל\"א-ל\"ב, ל\"ד-ל\"ז, ל\"ט, מ\"ב-מ\"ה"),
      siman(172, "א'-ב'"),
    ],
  },
  {
    slug: "bein-adam-lechavero",
    title: "מצוות בין אדם לחברו",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      siman(29, "כולו"),
      siman(30, "כולו"),
      siman(34, "א'-ג', ו'-ח', י\"א-י\"ד"),
      siman(63, "כולו"),
      siman(65, "א'-י'"),
      siman(67, "א'-ט'"),
      siman(182, "כולו"),
      siman(183, "א'-ב'"),
      siman(184, "א'-ח'"),
      siman(187, "א'-ד'"),
    ],
  },
  {
    slug: "mitzvot-shonot",
    title: "מצוות שונות",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      { slug: "kibud-av-vaem", title: 'כיבוד אב ואם – סימן קמ"ג', description: "הסימן כולו." },
      {
        slug: "kvod-rabo",
        title: 'כבוד רבו, תלמיד חכם וכהן – סימן קמ"ד',
        description: "סעיפים א'-ד', ו'-ח'.",
      },
      { slug: "isur-yichud", title: 'איסור יחוד – סימן קנ"ב', description: "סעיפים א'-ו'." },
      { slug: "lo-yilbash", title: 'איסור לא ילבש – סימן קע"א', description: "סעיף א'." },
      { slug: "shaatnez", title: 'שעטנז – סימן קע"ו', description: "סעיפים א'-ה', ז'." },
    ],
  },
];

/* ---- דינים: הערכה בית ספרית 4383/4583 – הלכה מורחבת ---- */
const YAHADUT_HALACHA_SCHOOL = (isFive: boolean): Node[] => [
  {
    slug: "hilchot-shabbat",
    title: "הלכות שבת",
    description:
      'לפי "יסודות ועיקרים בהלכות שבת" (מכון אור מאיר) — כל הפרקים מלבד ה\', י"ב, י"ג (שבבחינה החיצונית)' +
      (isFive ? " ומלבד ח'-י' (שאינם חובה)." : "."),
    children: isFive
      ? [...prakim(1, 4), perek(6), perek(7), perek(11), ...prakim(14, 16)]
      : [...prakim(1, 4), ...prakim(6, 11), ...prakim(14, 16)],
  },
  {
    slug: "hilchot-chagim",
    title: "הלכות חגים",
    description: "לפי קיצור שולחן ערוך.",
    children: [
      {
        slug: "pesach",
        title: "פסח",
        children: [
          siman(111, "א'-ג', ה', ז'-י\"א, י\"ז"),
          siman(112, "א', ו'"),
          siman(113, "א'-ה'"),
          siman(114, "א'"),
          siman(116, isFive ? "א'-ו', י'-י\"ח" : "ב'-ד', י'-י\"ח"),
          siman(118, "א'-ט'"),
          siman(119, "א'-ט'"),
          siman(120, "א', ו'-ז', ט'-י\"א"),
          siman(121, "א'-ו'"),
          siman(122, isFive ? "א'-ג', י\"ב-ט\"ז" : "א'-ג', ז'-ט'"),
        ],
      },
      {
        slug: "yamim-noraim",
        title: "ימים נוראים",
        children: [
          siman(128, "א'-ג', י\"ב-ט\"ז"),
          siman(129, "ב'-ה', ח'-ט', י\"א, י\"ד, י\"ט-כ\"א, כ\"ג"),
          siman(130, "א'-ג'"),
          siman(131, "א'-ד', ח'-ט', י\"ב, י\"ד-ט\"ז"),
          siman(132, "א'-ג'"),
          siman(
            133,
            isFive
              ? "א', ג', ח', י', י\"ד-ט\"ו, י\"ח-כ', כ\"ד, כ\"ו, כ\"ח-ל\"א"
              : "א'-ג', ח', י', י\"ד-ט\"ו, י\"ח-כ', כ\"ד, כ\"ו, כ\"ח-ל\"א",
          ),
        ],
      },
      {
        slug: "chanuka-purim",
        title: "חנוכה ופורים",
        children: [
          siman(
            139,
            isFive ? 'א\'-ד\' (עד "כל נר יחידי"), ו\'-י"ד, ט"ז-כ"ב' : "א'-ג', ו'-י\"ב, י\"ד, ט\"ז-כ\"ב",
          ),
          siman(141, "א'-ט\"ז, כ\"ב-כ\"ג"),
          siman(142, 'א\', ז\' (עד "דבר שאינו של שמחה"), ח\'-י\''),
        ],
      },
    ],
  },
  {
    slug: "mitzvot-haaretz",
    title: "מצוות התלויות בארץ",
    description:
      'הלכות חלה לפי קיצור שולחן ערוך; שאר ההלכות לפי הנספח "מצוות התלויות בארץ" ע"פ פסקי החזון איש (הוצאת "אשכול" ממהדורת תשל"ה, או הוצאת "שי למורא").',
    children: [
      {
        slug: "chala",
        title: "מצות הפרשת חלה",
        description: 'קיצור שולחן ערוך, סימן ל"ה: סעיפים א\', ג\', ו\'-ח\'.',
      },
      {
        slug: "trumot-maasrot",
        title: "תרומות ומעשרות",
        description: "לפי הנספח: סימנים א'-י\"ז (סעיפים נבחרים).",
      },
      {
        slug: "orla",
        title: "ערלה ונטע רבעי",
        description: "לפי הנספח: סימנים י\"ט-כ' (סעיפים נבחרים).",
      },
      {
        slug: "shmita",
        title: "שמיטה",
        description:
          "לפי הנספח: סימנים כ\"א-ל\"ט (סעיפים נבחרים). הסימנים הנכללים משתנים לפי מחזור שנת השמיטה.",
      },
    ],
  },
  ...(isFive
    ? [
        {
          slug: "mitzvot-shonot-school",
          title: "מצוות שונות",
          description: "לפי קיצור שולחן ערוך.",
          children: [
            { slug: "mezuza", title: 'מזוזה – סימן י"א', description: "סעיפים א'-ג', ו'-ז', י', כ\"ב-כ\"ה." },
            { slug: "kashrut-school", title: 'כשרות – סימן ל"ח', description: "סעיפים א'-ג', ו', ט'-י\"ד." },
            { slug: "masa-umatan", title: 'משא ומתן – סימן ס"ב', description: "סעיפים א'-ב', ד'-ט', י\"א-י\"ג, ט\"ו-י\"ז." },
          ],
        },
      ]
    : []),
];

/* ---- יהדות: הערכה בית ספרית 4373/4573 – מחשבה ומוסר ---- */
const YAHADUT_MACHSHAVA = (isFive: boolean): Node[] => [
  {
    slug: "pirkei-avot",
    title: 'פרקי אבות – פרק ב\' (פירוש הר"ע מברטנורה)',
    description: isFive ? "ב-5 יח\"ל: בתוספת קטעים נבחרים מפירוש רבנו יונה." : undefined,
  },
  {
    slug: "rambam",
    title: 'רמב"ם – משנה תורה, הלכות תשובה',
    description: isFive ? "פרקים א'-ב', ופרק ג' הלכות א'-ו'." : "פרקים א'-ב'.",
  },
  {
    slug: "ramban-al-hatora",
    title: 'רמב"ן על התורה – קטעים נבחרים',
    description: isFive
      ? 'חוקים (כלאים – ויקרא י"ט י"ט), עדות (תפילין, בכור, פסח – שמות י"ג ט"ז).'
      : 'מושג הקדושה (ויקרא י"ט ב\'), עדות (שמות י"ג ט"ז), עשיית הטוב והישר (דברים ו\' י"ח).',
  },
  {
    slug: "sefer-hachinuch",
    title: "ספר החינוך (ר' אהרון הלוי)",
    description: isFive
      ? "שבת, חגים, כשרות, מצוות התלויות בארץ ובין אדם לחברו (מצוות נבחרות)."
      : "הקדמה; מצוות בין אדם למקום, מצוות התלויות בארץ ומצוות בין אדם לחברו (מצוות נבחרות).",
  },
  ...(isFive
    ? []
    : [
        {
          slug: "mesilat-yesharim",
          title: 'מסילת ישרים (רמח"ל)',
          description: "פרקים א'-ג', ד' (חלקו), ה'.",
        },
      ]),
  {
    slug: "beit-elokim",
    title: 'בית אלוקים – שער התפילה (המבי"ט)',
    description: 'לקט מתוך פרקים ג\', ט"ו, י"ז.',
  },
  {
    slug: "sichot-musar",
    title: "שיחות מוסר – מאמר הכרת הטוב (ר' חיים שמואלביץ')",
  },
  {
    slug: "michtav-meeliyahu",
    title: "מכתב מאליהו – קונטרס החסד (הרב דסלר)",
    description: isFive ? "ללא התוספות וההשלמה." : "פרקים א'-ה'.",
  },
  {
    slug: "chovot-halevavot",
    title: "חובות הלבבות (רבינו בחיי) – שער התשובה",
    description: isFive
      ? 'לפי פירוש "לב טוב": שער התשובה (הקדמה ופרקים א\'-ד\') ושער עבודת האלוקים (פתיחה ופרקים א\'-ג\').'
      : "ההקדמה ופרקים א'-ד'.",
  },
];

const TREE: Node[] = [
  /* ============================ תורה ============================ */
  {
    slug: "torah",
    title: "תורה",
    description: TANACH_NOTE,
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        description:
          "שאלון 3381 חיצוני (40%), 3373 בית ספרי (30%), 3383 בית ספרי (30%). נבחני משנה: 3382.",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית – עיון בשמות",
            questionnaireCode: "3381",
            description:
              '40% מציון תנ"ך 3 יח"ל (שאלון משותף ל-5 יח"ל). השאלון כולל גם נביאים אחרונים ותהלים — ראו נביא וכתובים.',
            children: SHEMOT_3381,
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית – עיון בראשית",
                questionnaireCode: "3373",
                description: "30% מהציון. השאלון כולל גם נביאים ראשונים — ראו נביא.",
                children: BEREISHIT_SCHOOL,
              },
              {
                slug: "school-based-electives",
                title: "הערכה בית ספרית – חלופות לבחירה",
                questionnaireCode: "3383",
                description:
                  "30% מהציון. בוחרים 2 חלופות: אחת מבין א'/ב' ואחת מבין ג'/ד' (חלופות ג'-ד' הן כתובים — ראו שם).",
                children: [
                  {
                    slug: "chalufa-a",
                    title: "חלופה א' – עיון בראשית ודברים",
                    children: [VAYECHI, VEZOT_HABRACHA],
                  },
                  {
                    slug: "chalufa-b",
                    title: "חלופה ב' – עיון במדבר",
                    description: 'בחירה של 2 פרשות מתוך בהעלותך / שלח / קורח, עם פירוש רש"י.',
                    children: BAMIDBAR_CHALUFA,
                  },
                ],
              },
              {
                slug: "alternative",
                title: 'הערכה חלופית – לנבחני משנה ובתי"ס ללא הכרה',
                questionnaireCode: "3382",
                description: "60% מהציון. שאלון חיצוני אחד הכולל את תוכניות 3373 ו-3383.",
              },
            ],
          },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        description:
          "שאלון 3381 חיצוני (20%), 3573 בית ספרי (20%), 3583 בית ספרי (20%), יחידת הגבר 3281 חיצונית (40%). נבחני משנה: 3372.",
        children: [
          {
            slug: "external",
            title: "בגרות חיצונית – עיון בשמות",
            questionnaireCode: "3381",
            description:
              '20% מציון תנ"ך 5 יח"ל (שאלון משותף ל-3 יח"ל). השאלון כולל גם נביאים אחרונים ותהלים — ראו נביא וכתובים.',
            children: SHEMOT_3381,
          },
          {
            slug: "internal",
            title: "בגרות פנימית",
            children: [
              {
                slug: "school-based",
                title: "הערכה בית ספרית – עיון בראשית",
                questionnaireCode: "3573",
                description: "20% מהציון. השאלון כולל גם נביאים ראשונים — ראו נביא.",
                children: BEREISHIT_SCHOOL,
              },
              {
                slug: "school-based-electives",
                title: "הערכה בית ספרית – חלופות לבחירה",
                questionnaireCode: "3583",
                description:
                  "20% מהציון. בוחרים 3 חלופות מתוך א'-ד' (חלופה ד' היא כתובים — ראו שם).",
                children: [
                  {
                    slug: "chalufa-a",
                    title: "חלופה א' – עיון בראשית ודברים",
                    children: [
                      VAYECHI,
                      {
                        slug: "haazinu",
                        title: "פרשת האזינו",
                        description: 'עם פירוש רש"י.',
                        children: [perek(32)],
                      },
                      VEZOT_HABRACHA,
                    ],
                  },
                  {
                    slug: "chalufa-b",
                    title: "חלופה ב' – חומש ויקרא",
                    description:
                      'עיון בפרשיות אחרי מות, קדושים, אמור עם רש"י וקטעי רמב"ן וספורנו; בקיאות במקרא וברש"י בספר ויקרא.',
                    children: [
                      {
                        slug: "acharei-mot",
                        title: "פרשת אחרי מות",
                        children: prakim(16, 18),
                      },
                      {
                        slug: "kedoshim",
                        title: "פרשת קדושים",
                        children: prakim(19, 20),
                      },
                      {
                        slug: "emor",
                        title: "פרשת אמור",
                        children: prakim(21, 24),
                      },
                      {
                        slug: "bekiut-vayikra",
                        title: "בקיאות בספר ויקרא",
                        description: 'התמצאות במקרא וברש"י (פירוש אחד ברש"י).',
                      },
                    ],
                  },
                  {
                    slug: "chalufa-c",
                    title: "חלופה ג' – עיון במדבר",
                    description: 'בחירה של 2 פרשות מתוך בהעלותך / שלח / קורח, עם פירוש רש"י.',
                    children: BAMIDBAR_CHALUFA,
                  },
                ],
              },
              {
                slug: "alternative",
                title: 'הערכה חלופית – לנבחני משנה ובתי"ס ללא הכרה',
                questionnaireCode: "3372",
                description: "40% מהציון. שאלון חיצוני אחד הכולל את תוכניות 3573 ו-3583.",
              },
            ],
          },
          {
            slug: "unit-hagever",
            title: "יחידת הגבר – בחינה חיצונית",
            questionnaireCode: "3281",
            description:
              '40% מציון תנ"ך 5 יח"ל. כוללת גם מלכים, ישעיה, תרי עשר ותהלים — ראו נביא וכתובים.',
            children: [
              {
                slug: "bereishit-iyun",
                title: "עיון בראשית",
                description: 'פרשות בראשית ולך לך עם פירוש רש"י וקטעי רמב"ן וספורנו נבחרים.',
                children: [
                  {
                    slug: "parashat-bereishit",
                    title: "פרשת בראשית",
                    children: [...prakim(1, 5), perek(6, "עד פסוק ח'")],
                  },
                  {
                    slug: "lech-lecha",
                    title: "פרשת לך לך",
                    children: prakim(12, 17),
                  },
                ],
              },
              {
                slug: "devarim-iyun",
                title: "עיון דברים",
                description:
                  'פרשות דברים, ואתחנן, ראה, שופטים עם פירוש רש"י, הקדמת הרמב"ן לחומש דברים, וקטעי רמב"ן, ספורנו, כלי יקר ורשב"ם נבחרים.',
                children: [
                  {
                    slug: "hakdamat-haramban",
                    title: 'הקדמת הרמב"ן על חומש דברים',
                  },
                  {
                    slug: "devarim",
                    title: "פרשת דברים",
                    children: [perek(1), perek(2), perek(3, 'עד פסוק כ"ב')],
                  },
                  {
                    slug: "vaetchanan",
                    title: "פרשת ואתחנן",
                    children: [perek(3, 'מפסוק כ"ג'), perek(4), perek(5), perek(6), perek(7, 'עד פסוק י"א')],
                  },
                  {
                    slug: "reeh",
                    title: "פרשת ראה",
                    children: [perek(11, 'מפסוק כ"ו'), perek(12), perek(13), perek(14), perek(15), perek(16, 'עד פסוק י"ז')],
                  },
                  {
                    slug: "shoftim",
                    title: "פרשת שופטים",
                    children: [perek(16, 'מפסוק י"ח'), perek(17), perek(18), perek(19), perek(20), perek(21, "עד פסוק ט'")],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ============================ נביא ============================ */
  {
    slug: "navi",
    title: "נביא",
    description: TANACH_NOTE,
    children: [
      {
        slug: "external",
        title: "שאלון חיצוני – נביאים אחרונים",
        questionnaireCode: "3381",
        description:
          '40% מהציון ב-3 יח"ל / 20% ב-5 יח"ל (שאלון תנ"ך משותף). יש ללמוד ע"פ רש"י או מצודות באופן שכל הפסוק מפורש.',
        children: [
          { slug: "yechezkel", title: "יחזקאל", children: yechezkelPerakim },
          { slug: "yirmiya", title: "ירמיה", children: yirmiyaPerakim },
          { slug: "yeshaya", title: "ישעיה", children: yeshayaPerakim },
        ],
      },
      {
        slug: "school-based",
        title: "הערכה בית ספרית – נביאים ראשונים",
        questionnaireCode: "3373",
        description:
          '3 יח"ל: שאלון 3373 (30%); 5 יח"ל: שאלון 3573 (20%). כולל גם עיון בראשית — ראו תורה. בנוסף לרש"י/מצודות נלמדים קטעי פירוש רד"ק.',
        children: [
          {
            slug: "yehoshua",
            title: "יהושע",
            description: 'קטעי רד"ק: פרק ד\' י"ט; ב-5 יח"ל גם פרק כ"ד א\'.',
            children: [
              { slug: "nisim-yarden", title: "הניסים במעבר הירדן – פרקים ג'-ד'" },
              { slug: "maal-achan", title: "מעל עכן ותוצאותיו – פרקים ז'-ח'" },
              { slug: "milchemet-yericho", title: "מלחמת יריחו – פרק ו'" },
              { slug: "milchemet-haai", title: "מלחמת העי – פרק ח'" },
              { slug: "shemesh-begivon", title: "שמש בגבעון דום – פרק י'" },
              {
                slug: "tochechat-yehoshua",
                title: 'תוכחת יהושע לפני פטירתו – פרק כ"ד',
                description: 'בתכנית 5 יח"ל (3573).',
              },
            ],
          },
          {
            slug: "shoftim",
            title: "שופטים",
            description: 'קטעי רד"ק: ה\' ו\', ו\' ל"ט, י"ב ח\', י"ג ד\'.',
            children: [
              { slug: "ehud", title: "אהוד בן גרא – פרק ג'" },
              { slug: "dvora", title: "דבורה הנביאה וברק בן אבינועם – פרקים ד'-ה'" },
              { slug: "gidon", title: "גדעון – פרקים ו'-ז'" },
              { slug: "yiftach", title: 'יפתח הגלעדי ונדרו – פרקים י"א-י"ב' },
              { slug: "shimshon", title: 'שמשון הגיבור ומעשיו – פרקים י"ג-ט"ז' },
            ],
          },
          {
            slug: "shmuel-a",
            title: "שמואל א'",
            description: 'קטעי רד"ק: ג\' ג\', ז\' י"ג, י\' ח\', י"ז מ\', כ"ד ד\'.',
            children: shmuelAlefPerakim,
          },
          {
            slug: "shmuel-b",
            title: "שמואל ב'",
            description: 'קטעי רד"ק: א\' כ"ד, ו\' ו\', י"ד כ"ה.',
            children: shmuelBetPerakim,
          },
          {
            slug: "bekiut",
            title: "בקיאות בנביא",
            description: "התמצאות בספרים יהושע, שופטים, שמואל א' ושמואל ב'.",
          },
        ],
      },
      {
        slug: "unit-hagever",
        title: 'יחידת הגבר (5 יח"ל) – עיון בנביאים',
        questionnaireCode: "3281",
        description:
          '40% מציון תנ"ך 5 יח"ל. כוללת גם עיון בראשית ודברים ותהלים — ראו תורה וכתובים.',
        children: [
          {
            slug: "melachim-a",
            title: "מלכים א'",
            children: [
              { slug: "perek-1", title: "פרק א' (פסוקים א'-ל\"א)" },
              { slug: "perek-2", title: "פרק ב' (פסוקים א'-י\"א)" },
              { slug: "perek-3-4", title: "פרק ג' ט\"ו – פרק ד' א'" },
              { slug: "perek-5-6", title: "פרק ה' כ\"ו – פרק ו' י\"ג" },
              { slug: "perek-7", title: "פרק ז' (פסוקים י\"ג-כ\"ו, מ'-נ')" },
              { slug: "perek-18", title: "פרק י\"ח (פסוקים א'-ל\"ט)" },
            ],
          },
          {
            slug: "melachim-b",
            title: "מלכים ב'",
            children: [
              { slug: "perek-4", title: "פרק ד' (פסוקים א'-ל\"ז)" },
              { slug: "perek-4-5", title: "פרק ד' מ\"ב – פרק ה' י\"ט" },
              { slug: "perek-7", title: "פרק ז' (פסוקים ג'-כ')" },
              { slug: "perek-11", title: "פרק י\"א (פסוקים א'-י\"ז)" },
              { slug: "perek-18", title: "פרק י\"ח (פסוקים א'-ז')" },
            ],
          },
          {
            slug: "yeshaya-hagever",
            title: "ישעיה – פרקי הגבר",
            children: [perek(5), perek(6), perek(11), perek(12), ...prakim(51, 56)],
          },
          {
            slug: "trei-asar",
            title: "תרי עשר",
            description: 'יש ללמוד ע"פ רש"י או מצודות באופן שכל הפסוק מפורש.',
            children: [
              {
                slug: "hoshea",
                title: "הושע",
                children: [perek(2), perek(12, 'מפסוק י"ג'), perek(13), perek(14)],
              },
              {
                slug: "yoel",
                title: "יואל",
                children: [perek(1), perek(2, 'מפסוק ט"ו')],
              },
              { slug: "amos", title: "עמוס", children: prakimOf(2, 3, 9) },
              { slug: "ovadia", title: "עובדיה", children: [perek(1)] },
              { slug: "yona", title: "יונה", children: prakim(1, 4) },
              {
                slug: "micha",
                title: "מיכה",
                children: [perek(4), perek(5), perek(6, "עד פסוק ח'")],
              },
              {
                slug: "zecharia",
                title: "זכריה",
                children: [perek(2, 'מפסוק י"ד'), perek(3), perek(4, "עד פסוק ז'"), perek(14)],
              },
              { slug: "malachi", title: "מלאכי", children: [perek(3)] },
            ],
          },
        ],
      },
    ],
  },

  /* ============================ כתובים ============================ */
  {
    slug: "ktuvim",
    title: "כתובים",
    description: TANACH_NOTE,
    children: [
      {
        slug: "tehilim",
        title: "תהלים – שאלון חיצוני",
        questionnaireCode: "3381",
        description:
          '40% מהציון ב-3 יח"ל / 20% ב-5 יח"ל (שאלון תנ"ך משותף). יש ללמוד ע"פ רש"י או מצודות באופן שכל הפסוק מפורש.',
        children: tehilimPerakim,
      },
      {
        slug: "chalufot",
        title: "חלופות כתובים – הערכה בית ספרית",
        questionnaireCode: "3383",
        description:
          'ב-3 יח"ל (3383): חלופה ג\' – רות, אסתר וקהלת; חלופה ד\' – עזרא-נחמיה ומשלי. ב-5 יח"ל (3583): חלופה ד\' – רות, אסתר, משלי, קהלת ועזרא-נחמיה. התמצאות ע"פ רש"י או מצודות.',
        children: [
          { slug: "rut", title: "מגילת רות", children: prakim(1, 4) },
          { slug: "esther", title: "מגילת אסתר", children: prakim(1, 10) },
          {
            slug: "kohelet",
            title: "קהלת",
            description: 'פרקים נבחרים בהיקף של 3 פרקים לפחות, ע"פ בחירת ביה"ס.',
          },
          { slug: "mishlei", title: "משלי", children: prakimOf(1, 3, 31) },
          {
            slug: "ezra-nechemia",
            title: "עזרא ונחמיה",
            description: 'בהיקף של 10 פרקים לפחות ע"פ בחירת ביה"ס.',
          },
        ],
      },
      {
        slug: "tehilim-hagever",
        title: 'תהלים – יחידת הגבר (5 יח"ל)',
        questionnaireCode: "3281",
        description:
          'בנוסף לרש"י/מצודות נלמדים קטעי מפרשים: מלבי"ם צ"ב ה\'-ו\', מלבי"ם ק\' א\'-ב\', רד"ק ק"ז י"ז, מלבי"ם קט"ז י"ב-י"ד, מלבי"ם קי"ח כ"ד.',
        children: tehilimHagever,
      },
    ],
  },

  /* ============================ לשון ============================ */
  {
    slug: "lashon",
    title: "לשון",
    description:
      'שאלון חיצוני 75281 (70% מהציון – הבנת הנקרא, הבעה ולשון; מופיע בלוח הבגרויות תשפ"ו) ושאלון המשך 75282 (30%). בית הספר בוחר מראש אם נבחנים חיצונית במערכת הצורות או בתחביר — רוב בתי הספר בוחרים במערכת הצורות חיצונית ובתחביר פנימית.',
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית – מערכת הצורות",
        questionnaireCode: "75281",
        description:
          "70% מהציון: הבנת הנקרא והבעה, ולשון – מערכת הצורות (לפי בחירת רוב בתי הספר). המשך: שאלון 75282 (30%).",
        children: [
          {
            slug: "tzurot",
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
          { slug: "havanat-hanikra", title: "הבנת הנקרא" },
          { slug: "hava'a", title: "הבעה" },
        ],
      },
      {
        slug: "internal",
        title: "בגרות פנימית – תחביר",
        description:
          "הערכה בית ספרית: התחביר נלמד ומוערך פנימית (לפי בחירת רוב בתי הספר), וכן תלקיט.",
        children: [
          { slug: "tachbir", title: "תחביר" },
          {
            slug: "talkit",
            title: "תלקיט",
            children: [{ slug: "talkitim-lebchira", title: "תלקיטים לבחירה" }],
          },
        ],
      },
    ],
  },

  /* ============================ ספרות ============================ */
  {
    slug: "sifrut",
    title: "ספרות",
    description: "לפי תכנית הלימודים בספרות – חינוך חרדי, חטיבה עליונה.",
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "10281",
        description: '70% מהציון, 2 יח"ל.',
        children: [
          {
            slug: "piyut",
            title: "פיוט",
            children: [
              { slug: "yedid-nefesh", title: "ידיד נפש – הרב אלעזר אזכרי" },
              { slug: "vayehi-bachatzi", title: "ויהי בחצי הלילה – ר' ינאי" },
              { slug: "im-afes", title: "אם אפס רובע הקן – ר' אפריים ב\"ר יצחק מרגנשבורג" },
              { slug: "ezkera-elokim", title: "אזכרה אלוקים ואהמיה – ר' אמיתי בן שפטיה" },
              { slug: "uvchen-gdolim", title: "ובכן גדולים מעשי אלוקינו – ר' אלעזר הקליר" },
            ],
          },
          {
            slug: "shirat-yemei-habeinaim",
            title: "שירת ימי הביניים",
            children: [
              { slug: "libi-bamizrach", title: 'ליבי במזרח – ריה"ל' },
              { slug: "yeshena-becheik", title: 'ישנה בחיק ילדות – ריה"ל' },
              { slug: "tzion-halo-tishali", title: 'ציון הלא תשאלי – ריה"ל' },
              { slug: "haba-mabul", title: 'הבא מבול – ריה"ל' },
              { slug: "shviya-aniya", title: 'שביה עניה – רשב"ג' },
              { slug: "reeh-shemesh", title: 'ראה שמש – רשב"ג' },
              { slug: "shachar-avakeshcha", title: 'שחר אבקשך – רשב"ג' },
              { slug: "shealuni-seapai", title: 'שאלוני שעפי – רשב"ג' },
              { slug: "ktonet-pasim", title: 'כתנת פסים – רמב"ע' },
              // הניקוד במילה הראשונה נדרש — מסנן תוכן ברשת חוסם את הכתיב חסר הניקוד
              { slug: "ashkim-leveit-hasar", title: 'אַשְׁכִּים לבית השר – רמב"ע' },
              { slug: "galgal-umazalot", title: 'גלגל ומזלות – רמב"ע' },
              { slug: "ahavat-hadasa", title: "אהבת הדסה – ר' שלום שבזי" },
            ],
          },
          {
            slug: "proza",
            title: "פרוזה – סיפורת",
            children: [
              {
                slug: "sipur-katzar",
                title: "הסיפור הקצר",
                description:
                  "אחד מאלה ומעשה בזוג נעליים (הרב ד. זריצקי); שני ציירים ותבואת השיגעון (רבי נחמן מברסלב); וגילו ברעדה (א. כי טוב); השם המאיר החוזה ובעל העגלה (וולדאן); סיפור על סיפור (א. חיות).",
              },
              {
                slug: "novela-metugam",
                title: "נובלה וסיפור מתורגם",
                description:
                  "וולדיה נכסף להתפלל (הרב ד. זריצקי); מהו כחול? (ראלף ל. פיין); המשורר (א.ו. גונזלאס); האשה עם הפרה (י.פ. ינסן).",
              },
            ],
          },
          {
            slug: "shira-chadasha",
            title: "שירה חדשה",
            children: [
              {
                slug: "shira-didaktit",
                title: "שירה דידקטית",
                description:
                  "ביטול, התמונה והמסגרת, עניותי ועושרך (צ. יאיר); בעל תשובה, מי ששב, יצר הלב (מ. אלעי); הונאה (ה. תראל); רחל (א. מרגלית); תפילת המשורר (ר. בת חיים); הארה (ר. לינטופ).",
              },
              {
                slug: "shira-alegorit",
                title: "שירה אלגורית",
                description:
                  "אדמה, הרוח הזו, סולמות, ערגה (ה. תראל); כרחם אב (א. מרגלית); צרור (צ. יאיר); ממלכת דמיון (ר. בת חיים).",
              },
              { slug: "shir-shelo-nilmad", title: "שיר שלא נלמד" },
            ],
          },
          {
            slug: "machaze",
            title: "מחזה ופלייטונים (רשימות)",
            children: [
              {
                slug: "leyesharim-tehila",
                title: 'מחזה: לישרים תהילה – הרמח"ל',
                description:
                  "פתשגן ונפשות החיזיון; חלק ראשון – דיבורים ב'-ה'; חלק שני – דיבורים א', ד'; חלק שלישי – דיבור ג'.",
              },
              {
                slug: "playtonim",
                title: "רשימות פלייטונים",
                description: "קרב הבלימה (א. מרגלית); האתמול והלילה (הרב ד. זריצקי).",
              },
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
            title: "הערכה בית ספרית",
            questionnaireCode: "10283",
            description: "30% מהציון.",
            children: [
              {
                slug: "shira-hazman",
                title: "שירה חדשה בנושא הזמן",
                description: "בינתיים (צ. יאיר); הזמן וחשבון נפש (א. מרגלית).",
              },
              {
                slug: "shoah",
                title: "יצירות בנושא השואה",
                description:
                  "חיים שמי (הרב מ. פראגר); שיר המבריח הקטן (הנריקה לאזוברט); בר מצוות הבן וקחוון במחנה ריכוז (ח. ברונשטיין); רעב (ה. נלקן); חלון בית אבא (א. מירסקי).",
              },
              {
                slug: "meshalim",
                title: "משלים עבריים ומתורגמים",
                description:
                  "שני ילדים משחקים (הרב ד. זריצקי); השליחות (הרב י. כהן); פר ושור ופרעוש וגמל (רבי ברכיה הנקדן); הסופר והשודד והחבית (קרילוב).",
              },
              {
                slug: "sefer-nivchar",
                title: "קריאה מונחית – ספר אחד מבין המבחר",
                description:
                  "אבא בשעה שתיים; אדם שיש לו שעה; באשר תלך; גלות באפרים ירוקים; דואט; הדוד הטוב של רולי; הכל לאדון הכל; הרוח שגברה על הדרקון; חתום באש; ילדה נוף; לב של קרח; להישאר יהודי; ניחוח פרחי השלג; קורמן – מסע הגאולה.",
              },
            ],
          },
          {
            slug: "alternative",
            title: "הערכה בית ספרית – לבתי ספר ללא הכרה / אקסטרניים / נבחני משנה",
            questionnaireCode: "10282",
            description: "30% מהציון (אותם נושאים כמו 10283).",
          },
        ],
      },
    ],
  },

  /* ============================ אנגלית ============================ */
  {
    slug: "english",
    title: "אנגלית",
    description:
      'בגרות באנגלית בנויה ממודולים מצטברים. בלוח הבגרויות תשפ"ו מופיעים השאלונים 16381, 16382, 16471 ו-16582.',
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

  /* ============================ יהדות – מחשבת ישראל ============================ */
  {
    slug: "yahadut",
    title: "יהדות",
    description:
      'מחשבת ישראל ומוסר — נבחן בהערכה בית ספרית (שאלון 4373 ל-3 יח"ל / 4573 ל-5 יח"ל) וביחידות ההגבר החיצוניות (4281, ל-5 יח"ל בלבד). ההלכות נבחנות במקצוע דינים. הסמלים משותפים לשאלוני "יהדות ודינים" של הפיקוח החרדי.',
    children: [
      {
        slug: "internal",
        title: "בגרות פנימית – הערכה בית ספרית",
        description: "מחשבה ומוסר: פרקי אבות, רמב\"ם, רמב\"ן, ספר החינוך, ספרי מוסר ומחשבה.",
        children: [
          {
            slug: "school-based-3",
            title: "הערכה בית ספרית – 3 יחידות",
            questionnaireCode: "4373",
            description: '30% מציון יהדות ודינים 3 יח"ל.',
            children: YAHADUT_MACHSHAVA(false),
          },
          {
            slug: "school-based-5",
            title: "הערכה בית ספרית – 5 יחידות",
            questionnaireCode: "4573",
            description: '20% מציון יהדות ודינים 5 יח"ל.',
            children: YAHADUT_MACHSHAVA(true),
          },
        ],
      },
      {
        slug: "unit-hagever",
        title: 'בגרות חיצונית – יחידות הגבר (5 יח"ל)',
        questionnaireCode: "4281",
        description:
          '40% מציון יהדות ודינים 5 יח"ל: נושאים בהשקפת היהדות, ספרים ומאמרים במחשבה ובמוסר.',
        children: [
          { slug: "sefer-hachinuch", title: "ספר החינוך – הקדמה, תפילות וברכות" },
          { slug: "kuzari", title: 'הכוזרי (ר\' יהודה הלוי) – מאמר שלישי, סעיפים א\'-י"ז' },
          {
            slug: "peirush-hamishna",
            title: 'רמב"ם – הקדמה לפירוש המשנה, שמונה פרקים, י"ג עיקרים',
          },
          {
            slug: "mishne-tora",
            title: 'רמב"ם – משנה תורה',
            description:
              "הלכות יסודי התורה (פרק ה'), הלכות תשובה (ז'-ח'), הלכות מלכים (י\"א-י\"ב).",
          },
          {
            slug: "ramban-al-hatora",
            title: 'רמב"ן על התורה',
            description:
              "הקדמה לפירושו לתורה, מושג הקדושה, עשיית הטוב והישר, חשיבותה של ארץ ישראל.",
          },
          { slug: "drashot-haran", title: 'דרשות הר"ן – לקט מתוך הדרוש השישי' },
          { slug: "mesilat-yesharim", title: 'מסילת ישרים (רמח"ל) – ההקדמה ופרקים א\'-ט\'' },
          { slug: "derech-chaim", title: 'מהר"ל – דרך החיים לפרקי אבות (פרקים נבחרים)' },
          { slug: "michtav-meeliyahu", title: "מכתב מאליהו – קונטרס הבחירה (הרב דסלר)" },
          { slug: "kovetz-maamarim", title: "קובץ מאמרים – מאמר על אמונה (הרב אלחנן וסרמן)" },
          { slug: "emuna-uvitachon", title: "אמונה ובטחון (החזון איש) – פרק ב'" },
          { slug: "netivot-shalom", title: 'נתיבות שלום – טהרת המידות (האדמו"ר מסלונים)' },
          { slug: "chaim-friedlander", title: "הרב חיים פרידלנדר – שבת, הצנע לכת" },
        ],
      },
      {
        slug: "alternative",
        title: "הערכה חלופית – לנבחני משנה ובתי\"ס ללא הכרה",
        questionnaireCode: "4382",
        description:
          '3 יח"ל: שאלון 4382 (60%); 5 יח"ל: שאלון 4582 (40%). שאלון חיצוני אחד המשלב את המחשבה (4373/4573) עם ההלכה (4383/4583) — ראו גם דינים.',
      },
    ],
  },

  /* ============================ מתמטיקה ============================ */
  {
    slug: "math",
    title: "מתמטיקה",
    description: 'סמלי השאלונים לפי לוח הבגרויות הבית ספרי תשפ"ו.',
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        children: [
          { slug: "school-based", title: "הערכה בית ספרית", questionnaireCode: "35172" },
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35371" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35372" },
        ],
      },
      {
        slug: "4-units",
        title: "בגרות 4 יחידות",
        children: [
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35471" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35472" },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        children: [
          { slug: "exam-a", title: "שאלון א'", questionnaireCode: "35571" },
          { slug: "exam-b", title: "שאלון ב'", questionnaireCode: "35572" },
        ],
      },
    ],
  },

  /* ============================ דינים – הלכות ============================ */
  {
    slug: "dinim",
    title: "דינים",
    description:
      'הלכות — קיצור שולחן ערוך ו"יסודות ועיקרים בהלכות שבת": בחינה חיצונית (4381) והערכה בית ספרית (4383 ל-3 יח"ל / 4583 ל-5 יח"ל). המחשבה והמוסר נבחנים במקצוע יהדות. הסמלים משותפים לשאלוני "יהדות ודינים" של הפיקוח החרדי.',
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "4381",
        description: '40% מציון יהדות ודינים 3 יח"ל / 20% מציון 5 יח"ל (שאלון משותף).',
        children: YAHADUT_CORE_TOPICS,
      },
      {
        slug: "internal",
        title: "בגרות פנימית – הערכה בית ספרית",
        description: "הלכה מורחבת: שבת, חגים ומצוות התלויות בארץ.",
        children: [
          {
            slug: "school-based-3",
            title: "הערכה בית ספרית – 3 יחידות",
            questionnaireCode: "4383",
            description: '30% מציון יהדות ודינים 3 יח"ל.',
            children: YAHADUT_HALACHA_SCHOOL(false),
          },
          {
            slug: "school-based-5",
            title: "הערכה בית ספרית – 5 יחידות",
            questionnaireCode: "4583",
            description: '20% מציון יהדות ודינים 5 יח"ל.',
            children: YAHADUT_HALACHA_SCHOOL(true),
          },
        ],
      },
      {
        slug: "alternative",
        title: "הערכה חלופית – לנבחני משנה ובתי\"ס ללא הכרה",
        questionnaireCode: "4382",
        description:
          '3 יח"ל: שאלון 4382 (60%); 5 יח"ל: שאלון 4582 (40%). שאלון חיצוני אחד המשלב את ההלכה (4383/4583) עם המחשבה (4373/4573) — ראו גם יהדות.',
      },
    ],
  },

  /* ============================ היסטוריה ============================ */
  {
    slug: "history",
    title: "היסטוריה",
    description: 'לפי תוכנית הלימודים בהיסטוריה לחינוך החרדי, חטיבה עליונה (תשפ"ו).',
    children: [
      {
        slug: "topic-1",
        title: "נושא ראשון: תנועות ושיטות בעם ישראל במאה ה-18 ובמאה ה-19",
        description: "40 שעות.",
        children: [
          { slug: "emancipation", title: "מצב היהודים והאמנציפציה במזרח אירופה ובמערבה" },
          {
            slug: "haskala",
            title: "היהודים במערב אירופה ובמרכזה: ההשכלה והרפורמה",
            description: 'מנדלסון ותלמידיו, "חכמת ישראל", כתב הסובלנות, ועידות הרפורמים.',
          },
          {
            slug: "gdolei-israel",
            title: 'תגובת גדולי ישראל: החת"ם סופר, הכתב סופר והרש"ר הירש',
            description: "הפרדת הקהילות בהונגריה ובגרמניה.",
          },
          {
            slug: "chasidut",
            title: "תנועת החסידות",
            description: 'הבעש"ט, יסודות ועקרונות, מפיצי החסידות ושושלות חסידיות.',
          },
          { slug: "hagra", title: 'הגר"א – דרכו, מורשתו ותלמידיו' },
          {
            slug: "yeshivot",
            title: "עולם הישיבות החדשות",
            description: "וולוז'ין אם הישיבות; מיר, טלז, סלבודקה, פונוביז'.",
          },
          {
            slug: "musar",
            title: "תנועת המוסר",
            description: "ר' ישראל מסלנט; זרמים: קלם, נובהרדוק וסלבודקה.",
          },
        ],
      },
      {
        slug: "topic-2",
        title: "נושא שני: ארץ ישראל – ארץ הקודש – ישן מול חדש",
        description: "20 שעות.",
        children: [
          { slug: "ottoman", title: "האימפריה העותומאנית ומעמד היהודים" },
          {
            slug: "yishuv",
            title: "האוכלוסייה היהודית: העדות והעליות",
            description: 'עליות חסידים ותלמידי הגר"א, עליית רבני המזרח, אישים ופועלם.',
          },
          {
            slug: "jerusalem",
            title: 'ירושלים ת"ר-תרע"ד: הישוב, הכלכלה והחינוך',
            description: 'ה"כוללים" וכספי החלוקה, משה מונטפיורי, מוסדות החינוך והמאבק במיסיון.',
          },
          { slug: "out-of-walls", title: "היציאה מן החומות וההתיישבות ברחבי הארץ" },
          {
            slug: "new-yishuv",
            title: "היווצרות הישוב החדש והעלייה השנייה",
            description:
              "העלייה הראשונה, המושבות, פולמוס השמיטה, תל אביב, מלחמת השפות ומסע התשובה.",
          },
        ],
      },
      {
        slug: "topic-3",
        title: "נושא שלישי: ארץ ישראל תחת שלטון המנדט הבריטי",
        description: "35 שעות.",
        children: [
          { slug: "ww1", title: "ארץ ישראל במלחמת העולם הראשונה והצהרת בלפור" },
          {
            slug: "mandate",
            title: "יחסי יהודים-בריטים-ערבים בין שתי מלחמות העולם",
            description:
              'פרעות תר"פ-תרצ"ו, ועדות חקירה והספרים הלבנים, המחתרות, ההעפלה וחומה ומגדל.',
          },
          {
            slug: "yishuv-institutions",
            title: "התפתחות הישוב היהודי ומוסדותיו",
            description: "עליות שלישית-חמישית, מוסדות ההנהגה והפעילות לשמירת הצביון היהודי.",
          },
          {
            slug: "to-independence",
            title: "ממלחמת העולם השנייה ועד הקמת המדינה",
            description: 'שיתוף פעולה או מאבק, ועדות החקירה, כ"ט בנובמבר והחרפת המאבק בבריטים.',
          },
        ],
      },
      {
        slug: "topic-4",
        title: "נושא רביעי: יהדות התפוצות",
        description: "40 שעות.",
        children: [
          {
            slug: "russia",
            title: "יהדות רוסיה",
            description: "תקופת הצארים, ההגירה ההמונית והשלטון הקומוניסטי.",
          },
          {
            slug: "antisemitism",
            title: "אנטישמיות מודרנית",
            description: "אנטישמיות פוליטית, עלילות דם ומשפט דרייפוס.",
          },
          { slug: "zionism", title: "הציונות", description: "התפתחות התנועה, תוכנית באזל והזרמים." },
          {
            slug: "charedi-org",
            title: "התארגנות היהדות החרדית באירופה",
            description: 'אגודת ישראל, הכנסיות הגדולות, החינוך החרדי בפולין ותנועת "בית יעקב".',
          },
          {
            slug: "islam-lands",
            title: "יהדות ארצות האסלאם",
            description: "תימן, עירק ומרוקו: מצב מדיני, כלכלי ורוחני; גדולי ישראל ופעולותיהם.",
          },
          {
            slug: "usa",
            title: "יהדות ארצות הברית",
            description: "התפתחות המרכז היהודי, החצרות, עולם הישיבות ובית יעקב.",
          },
        ],
      },
      {
        slug: "topic-5",
        title: "נושא חמישי: חורבן יהדות אירופה",
        description: "25 שעות.",
        children: [
          { slug: "nazi-germany", title: 'המשטר הנאצי בגרמניה והיהודים עד תרצ"ט' },
          {
            slug: "ww2",
            title: "מלחמת העולם השנייה והפתרון הסופי",
            description: "הגטאות, הרצח ההמוני, מחנות הריכוז וההשמדה, יהודי צפון אפריקה והונגריה.",
          },
          {
            slug: "kidush-hashem",
            title: "קידוש ה' – בחיים ובמוות",
            description: "הנהגה רבנית, תפילה ולימוד, שמירת הצלם היהודי.",
          },
          {
            slug: "hatzala",
            title: "דרכי התמודדות והצלה",
            description:
              'הרב וייסמנדל, משפחת שטרנבוך, ועד ההצלה, חסידי אומות העולם, הצלת הישיבות והאדמו"רים.',
          },
          {
            slug: "after",
            title: "העולם היהודי אחרי החורבן",
            description: "מחנות העקורים, כיווני ההגירה ושיקום היהדות החרדית.",
          },
        ],
      },
      {
        slug: "topic-6",
        title: "נושא שישי: מדינת ישראל – מהכרזת המדינה עד לאחר מלחמת יום הכיפורים",
        description: "20 שעות.",
        children: [
          { slug: "independence-war", title: 'מלחמת השחרור – תש"ח' },
          {
            slug: "state-building",
            title: "הקמת מוסדות השלטון וקליטת העלייה",
            description:
              "השילומים, פרשת קסטנר ומשפט אייכמן; גלי העלייה, המעברות ומדיניות הצנע.",
          },
          {
            slug: "soul-of-child",
            title: "המאבק על נפש הילד והקמת החינוך העצמאי",
            description: "ביטול הזרמים בחינוך וסוגיית גיוס הבנות.",
          },
          {
            slug: "charedi-israel",
            title: "היהדות החרדית במדינת ישראל",
            description:
              "הסטטוס-קוו, התפתחות החינוך והיישובים, גדולי ישראל: החזון איש, הרב מבריסק, הרב מפונוביז' ועוד.",
          },
          {
            slug: "wars",
            title: "מדיניות חוץ וביטחון",
            description: "הסכסוך הערבי-ישראלי, מבצע קדש, ששת הימים ויום הכיפורים.",
          },
        ],
      },
    ],
  },

  /* ============================ אזרחות ============================ */
  {
    slug: "ezrachut",
    title: "אזרחות",
    description: 'לפי תוכנית הלימודים באזרחות לחינוך החרדי, חטיבה עליונה (תשפ"ו).',
    children: [
      { slug: "topic-a", title: "עם ישראל – עם התורה", description: "9 שעות." },
      { slug: "topic-b", title: "אופייה של מדינת ישראל", description: "12 שעות." },
      { slug: "topic-c", title: "דמוקרטיה", description: "17 שעות." },
      { slug: "topic-d", title: "המשטר הדמוקרטי בעולם ובישראל", description: "13 שעות." },
      { slug: "topic-e", title: "מפלגות ובחירות במדינת ישראל", description: "12 שעות." },
      { slug: "topic-f", title: "חוקה וחוקי יסוד", description: "8 שעות." },
      { slug: "topic-g", title: "אזרחות ישראלית וזכות עלייה לישראל", description: "10 שעות." },
      { slug: "topic-h", title: "הרשות המחוקקת – הכנסת", description: "12 שעות." },
      { slug: "topic-i", title: "עבודת הכנסת", description: "13 שעות." },
      { slug: "topic-j", title: "הרשות המבצעת – הממשלה", description: "15 שעות." },
      { slug: "topic-k", title: "הרשות השופטת", description: "16 שעות." },
      { slug: "topic-l", title: "נשיא המדינה", description: "6 שעות." },
      { slug: "topic-m", title: "פיקוח וביקורת על רשויות השלטון", description: "9 שעות." },
      { slug: "topic-n", title: "השלטון המקומי", description: "12 שעות." },
      { slug: "topic-o", title: "דת ומדינה", description: "14 שעות." },
      { slug: "topic-p", title: "החיים הרוחניים", description: "2 שעות." },
    ],
  },

  /* ============================ מנהל וכלכלה ============================ */
  {
    slug: "minhal",
    title: "מנהל וכלכלה",
    description:
      "מגמת ניהול עסקי (סמל מקצוע 17.00): בחינת בגרות חיצונית (70%) ומטלת ביצוע (30%), לפי תוכניות הלימודים של מנהל החינוך הטכנולוגי.",
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית (70%)",
        questionnaireCode: "839381",
        children: [
          {
            slug: "organization-intro",
            title: "מבוא לתורת הארגון",
            description: "סיווג ארגונים ומבנה הארגון.",
          },
          {
            slug: "leadership",
            title: "מנהיגות",
            description:
              "מנהיג ומנהל, סגנונות מנהיגות, כוח וסמכות, הפעלת עובדים וניהול צוותים.",
          },
          {
            slug: "decision-making",
            title: "קבלת החלטות",
            description: "אי-ודאות, תהליך קבלת ההחלטות וגישות (מודלים) לקבלת החלטות.",
          },
          {
            slug: "organizational-change",
            title: "שינוי ארגוני",
            description: "גורמי תמיכה והתנגדות, כלים להתמודדות, מודל הקרחון והשינוי כדרך חיים.",
          },
          {
            slug: "ethics",
            title: "אתיקה",
            description: "מושגי יסוד, אתיקה ארגונית, מנהיגות מתעמרת, אחריות סביבתית וחברתית.",
          },
          {
            slug: "economics-intro",
            title: "מבוא לכלכלה",
            description:
              "ביקוש והיצע, שיווי משקל, מסחר בין-לאומי, התערבות ממשלתית ומאקרו-כלכלה.",
          },
          {
            slug: "finance",
            title: "מימון",
            description: 'ריבית, ערך עתידי ונוכחי, ניתוח כדאיות השקעה (ענ"נ) והלוואות.',
          },
          {
            slug: "entrepreneurship",
            title: "יזמות",
            description: "ייחודיות, חקר שוק, חשיבה יצירתית, רתימה, יישום מיזם ושיווק.",
          },
        ],
      },
      {
        slug: "internal",
        title: "מטלת ביצוע – הערכה בית ספרית (30%)",
        questionnaireCode: "839283",
        description: "סמלים נוספים: 839282 / 839183.",
        children: [
          {
            slug: "business-literacy",
            title: "מבוא: מידענות ואוריינות עסקית-כלכלית",
            description: "תקציב, בנק ואמצעי תשלום.",
          },
          {
            slug: "organization",
            title: "הארגון",
            description: "סוגי ארגונים, חזון, ערכים ומטרות, מאפייני סביבה ארגונית.",
          },
          {
            slug: "environments",
            title: "סביבות הארגון",
            description: "סביבות המאקרו והמיקרו של הארגון.",
          },
          { slug: "accounting", title: "מבוא לחשבונאות", description: "החשבון והדוחות הכספיים." },
          {
            slug: "costing",
            title: "מבוא לתמחיר",
            description: "גורמי ייצור, עלויות, רווח ונקודת איזון.",
          },
          {
            slug: "marketing",
            title: "תורת השיווק",
            description: "תמהיל השיווק, SWOT והתוכנית השיווקית.",
          },
          {
            slug: "hr",
            title: "משאבי אנוש",
            description: "גיוס עובדים, יחסי עבודה, דיני עבודה וחוקי המגן.",
          },
        ],
      },
    ],
  },

  /* ============================ מקצועות ללא בגרות ============================ */
  {
    slug: "sicha",
    title: "שיחה",
    description: "אינו מקצוע בגרות רשמי — שיחת מוסר/השקפה פנימית, ללא סמל שאלון.",
  },
  {
    slug: "chevra",
    title: "חברה",
    description: "אינו מקצוע בגרות רשמי במגזר החרדי — ללא סמל שאלון.",
  },
  {
    slug: "teacher",
    title: "הרחבת ידע למורה",
    description: "חומרי העשרה למורות — אינו מקצוע בגרות לתלמידות.",
  },
];

/* ---------- upsert ---------- */

const stats = { inserted: 0, updated: 0 };
const keepIds = new Set<number>();

/** ניסיון חוזר לפעולות DB — הרשת לניאון נופלת לעיתים תחת עומס קריאות רצופות */
async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries) throw e;
      console.warn(`retry ${attempt}/${tries} (${label})…`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

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
  const [existing] = await withRetry(
    () => db.select({ id: categories.id }).from(categories).where(cond).limit(1),
    `select ${node.slug}`,
  );

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
    await withRetry(
      () => db.update(categories).set(values).where(eq(categories.id, existing.id)),
      `update ${node.slug}`,
    );
    id = existing.id;
    stats.updated++;
  } else {
    const [row] = await withRetry(
      () => db.insert(categories).values(values).returning({ id: categories.id }),
      `insert ${node.slug}`,
    );
    id = row.id;
    stats.inserted++;
  }
  keepIds.add(id);

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await upsertCategory(children[i], id, (i + 1) * 10);
  }
  return id;
}

/* ---------- prune: מחיקת קטגוריות ישנות שאינן בעץ (רק ללא חומרים) ---------- */

async function pruneStale(seededRootIds: number[]) {
  const allCats = await db
    .select({ id: categories.id, parentId: categories.parentId, title: categories.title })
    .from(categories);
  const byParent = new Map<number, { id: number; title: string }[]>();
  for (const c of allCats) {
    if (c.parentId === null) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push({ id: c.id, title: c.title });
    byParent.set(c.parentId, list);
  }
  const mats = await db.select({ categoryId: materials.categoryId }).from(materials);
  const hasMaterial = new Set(mats.map((m) => m.categoryId));

  const subtreeHasMaterials = (id: number): boolean => {
    if (hasMaterial.has(id)) return true;
    return (byParent.get(id) ?? []).some((c) => subtreeHasMaterials(c.id));
  };

  // איסוף למחיקה: עמוק-קודם, כדי שילדים יימחקו לפני הורים
  const toDelete: { id: number; title: string }[] = [];
  const collect = (id: number, title: string) => {
    for (const child of byParent.get(id) ?? []) collect(child.id, child.title);
    toDelete.push({ id, title });
  };
  const walk = (id: number) => {
    for (const child of byParent.get(id) ?? []) {
      if (keepIds.has(child.id)) {
        walk(child.id);
      } else if (subtreeHasMaterials(child.id)) {
        console.warn(`prune: skipping "${child.title}" (subtree has materials)`);
      } else {
        collect(child.id, child.title);
      }
    }
  };
  for (const rootId of seededRootIds) walk(rootId);

  for (const { id, title } of toDelete) {
    await withRetry(() => db.delete(categories).where(eq(categories.id, id)), `delete ${title}`);
    console.log(`prune: deleted "${title}"`);
  }
  return toDelete.length;
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
  const rootIds: number[] = [];
  for (let i = 0; i < TREE.length; i++) {
    const n = TREE[i];
    const id = await upsertCategory(n, null, (i + 1) * 10, {
      icon: SUBJECT_ICONS[n.slug] ?? "📁",
      color: PALETTE[i % PALETTE.length],
    });
    rootIds.push(id);
  }
  console.log(`Categories: ${stats.inserted} inserted, ${stats.updated} updated`);

  if (process.env.SEED_PRUNE === "1") {
    const n = await pruneStale(rootIds);
    console.log(`Pruned stale categories: ${n}`);
  }

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
