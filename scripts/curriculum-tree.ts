/**
 * הגדרת עץ תכנית הלימודים (TREE) — קובץ נתונים טהור, ללא תופעות לוואי, בטוח לייבוא.
 * נצרך ע"י scripts/seed.ts (זריעה) ו-scripts/verify-tree.ts (בדיקת תקינות).
 */

export type Node = {
  slug: string;
  title: string;
  questionnaireCode?: string;
  bundlePrice?: number;
  description?: string;
  /** לא נדרש יותר לבחינה (לפי מיקוד משרד החינוך לשנה הנוכחית) — מוצג במפה עם קו חוצה */
  excluded?: boolean;
  /** פרק שרק חלקו נדרש: מה הוצא מהמיקוד — מוצג במפה כריבוע "מה לא צריך" צמוד בלי רווח לריבוע הפרק */
  excludedNote?: string;
  /** כבר הוכן חומר בפועל (דף לתלמידה/למורה וכו') לצומת זה — מוצג במפה עם סימן וי */
  ready?: boolean;
  /** "sichot" = צומת עלה שמציג את מודול מאגר השיחות (שיחה/חברה/כישורי חיים) במקום עמוד חומרים רגיל */
  moduleType?: "sichot";
  children?: Node[];
};

/** שתי תיקיות מאגר השיחות המשותפות לשיחה/חברה/כישורי חיים */
const SICHOT_FOLDERS: Node[] = [
  { slug: "chagim", title: "חגים", moduleType: "sichot" },
  { slug: "aktualia-hashkafa", title: "אקטואליה והשקפה", moduleType: "sichot" },
];

/* --- עזרי פרקים בגימטריה --- */
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת"];
export function hebNum(n: number): string {
  let s = HUNDREDS[Math.floor(n / 100)];
  const r = n % 100;
  if (r === 15) s += "טו";
  else if (r === 16) s += "טז";
  else s += TENS[Math.floor(r / 10)] + ONES[r % 10];
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
}
/** פרק בודד */
export const perek = (n: number, suffix?: string): Node => ({
  slug: `perek-${n}`,
  title: `פרק ${hebNum(n)}${suffix ? ` (${suffix})` : ""}`,
});
/**
 * פרק עם קטעי מפרשים — תיאור בתחילית "מפרשים:" מדליק סימון נוצה במפה,
 * ולחיצה עליו פותחת בועת אליפסה עם שם המפרש והפסוק.
 */
export const perekM = (n: number, meforshim: string, suffix?: string): Node => ({
  ...perek(n, suffix),
  description: `מפרשים: ${meforshim}`,
});
/** טווח פרקים רצוף */
export const prakim = (from: number, to: number): Node[] => {
  const out: Node[] = [];
  for (let n = from; n <= to; n++) out.push(perek(n));
  return out;
};
/** רשימת פרקים לפי מספרים */
export const prakimOf = (...nums: number[]): Node[] => nums.map((n) => perek(n));
/**
 * מסמן צומת (ואת כל תת-הענף שלו) כלא נדרש יותר לבחינה, לפי מיקוד משרד החינוך לשנה הנוכחית.
 * מוצג במפה עם קו חוצה + סמל מספריים.
 */
export const notNeeded = (n: Node): Node => ({
  ...n,
  excluded: true,
  children: n.children?.map(notNeeded),
});
/**
 * פרק שרק חלקו נדרש לבחינה (המיקוד הוריד רק חלק ממנו): note = מה שלא נדרש.
 * מוצג במפה כשני ריבועים צמודים בלי רווח — ריבוע הפרק (מה שצריך) ומיד אחריו ריבוע "מה לא צריך".
 */
export const partlyNeeded = (n: Node, note: string): Node => ({ ...n, excludedNote: note });
/**
 * מסמן צומת (ואת כל תת-הענף שלו) כמי שכבר הוכן לו חומר בפועל.
 * מוצג במפה עם סימן וי. צומת שסומן מראש ב-notBuilt מדלג — הוא ותת-הענף שלו.
 */
export const ready = (n: Node): Node =>
  n.ready === false ? n : { ...n, ready: true, children: n.children?.map(ready) };
/**
 * חריג בתוך ענף שכולו מסומן ready: צומת שטרם הוכן לו חומר בפועל
 * (בד"כ פרק שהוצא מהמיקוד ולכן לא נבנה). לא יקבל וי גם כשהאב עטוף ב-ready.
 */
export const notBuilt = (n: Node): Node => ({ ...n, ready: false });
/** סימן בקיצור שולחן ערוך, עם פירוט הסעיפים הנלמדים */
export const siman = (n: number, seifim?: string): Node => ({
  slug: `siman-${n}`,
  title: `סימן ${hebNum(n)}`,
  description: seifim ? (seifim === "כולו" ? "הסימן כולו." : `סעיפים ${seifim}.`) : undefined,
});

/** הערה משותפת לתורה/נביא/כתובים */
const TANACH_NOTE =
  'בבגרות החרדית תורה, נביא וכתובים נבחנים יחד בשאלוני תנ"ך משותפים (הפיקוח על תנ"ך חינוך חרדי). כאן מוצג בכל מקצוע החלק שלו מכל שאלון, לפי תכניות הלימודים הרשמיות לתשפ"ו. הסמלים משותפים לשלושת המקצועות. פרקים המסומנים ✂ הוצאו ממיקוד משרד החינוך לתשפ"ז ואינם נדרשים לבחינה (שאלונים 3381, 3281 החיצוניים).';

/* ---- תנ"ך: שאלון חיצוני 3381 – חלק החומש (עיון בשמות) ---- */
const RASHI_NOTE = 'עם פירוש רש"י. פרקים עם קטעי מפרשים מסומנים בסמל נוצה.';
const SHEMOT_3381: Node[] = [
  {
    slug: "bo",
    title: "פרשת בא",
    description: RASHI_NOTE,
    children: [
      perek(10),
      perek(11),
      partlyNeeded(
        perekM(12, 'רמב"ן פסוק ב\' ("וטעם החדש הזה לכם ראש חדשים" עד "שנקרא לו לזיכרון גאולתנו")'),
        'רמב"ן פסוק מ\' (ב-5 יח"ל, עד "היה בן שבעים וחמש שנה"); ספורנו פסוק מ"ג',
      ),
      perekM(13, "ספורנו פסוק ב'", 'עד פסוק ט"ז'),
    ],
  },
  {
    slug: "beshalach",
    title: "פרשת בשלח",
    description: RASHI_NOTE,
    children: [
      notNeeded(perekM(13, 'ספורנו פסוק י"ז (ב-5 יח"ל)', 'מפסוק י"ז')),
      perek(14),
      perekM(15, 'רמב"ן פסוק כ"ז (עד "יותר משאר המקומות שעבדו בהם")'),
      perekM(16, 'רמב"ן פסוק ב\'; רשב"ם פסוק כ"ג ד"ה "ויאמר אליהם"'),
      perekM(17, 'רמב"ן פסוק א\' ד"ה "ואין מים לשתות העם"'),
    ],
  },
  {
    slug: "yitro",
    title: "פרשת יתרו",
    description: RASHI_NOTE,
    children: [
      perekM(18, 'ספורנו פסוק ט\'; רמב"ן פסוק ט"ו'),
      perek(19),
      perekM(20, "רשב\"ם פסוק ח'"),
    ],
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
  ready({
    slug: "vayera",
    title: "פרשת וירא",
    description: RASHI_NOTE,
    children: [
      perekM(18, "רמב\"ן פסוק ז'"),
      perekM(19, 'ספורנו פסוק ט"ז'),
      perek(20),
      perek(21),
      perekM(22, "רמב\"ן פסוק א'"),
    ],
  }),
  {
    slug: "chayei-sara",
    title: "פרשת חיי שרה",
    description: RASHI_NOTE,
    children: [
      ready(perek(23)),
      ready(perek(24)),
      ready(perekM(25, 'כלי יקר פסוק א\'; רמב"ן פסוק ח\'', 'עד פסוק י"ח')),
    ],
  },
  {
    slug: "toldot",
    title: "פרשת תולדות",
    description: RASHI_NOTE,
    children: [
      ready(perek(25, 'מפסוק י"ט')),
      ready(perekM(26, "רמב\"ן פסוק כ'")),
      ready(perekM(27, 'ספורנו פסוק ד\'; רמב"ן פסוק ל"ג')),
      ready(perekM(28, "רמב\"ן פסוק ה'", "עד פסוק ט'")),
    ],
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
  description: RASHI_NOTE,
  children: [
    perekM(47, 'רמב"ן פסוק כ"ט; רמב"ן פסוק ל"א', 'מפסוק כ"ח'),
    perekM(48, 'ספורנו פסוק י\' ד"ה "לא יוכל לראות"'),
    perekM(49, 'ספורנו פסוק י\' ד"ה "לא יסור שבט מיהודה"'),
    perek(50),
  ],
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
  perek(145),
  perek(146),
  perek(147),
  perek(148),
  perek(149),
  perek(150),
];

/** פרקי תהילים ביחידת הגבר 3281 */
const tehilimHagever: Node[] = [
  notBuilt(notNeeded(perek(49))),
  perek(51),
  perek(79),
  perek(81),
  perek(82),
  perek(90),
  perek(91),
  perekM(92, 'מלבי"ם פסוקים ה\'-ו\''),
  perek(93),
  perek(94),
  perek(95),
  perekM(100, "מלבי\"ם פסוקים א'-ב'"),
  perek(104),
  perekM(107, 'רד"ק פסוק י"ז'),
  perek(111),
  perek(112),
  perek(113),
  perek(114),
  perek(115),
  perekM(116, 'מלבי"ם פסוקים י"ב-י"ד'),
  perek(117),
  perekM(118, 'מלבי"ם פסוק כ"ד'),
  notBuilt(notNeeded(perek(139))),
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
  notNeeded(perek(44, 'פסוקים ט"ו-ל"א')),
];

/** פרקי ירמיה בשאלון החיצוני 3381 */
const yirmiyaPerakim: Node[] = [
  perek(1),
  perek(2),
  perek(7),
  perek(8, 'מפסוק י"ג'),
  perek(9),
  notNeeded(perek(16, 'מפסוק י"ט')),
  notNeeded(perek(17, 'עד פסוק י"ד')),
  perek(31),
];

/** פרקי ישעיה בשאלון החיצוני 3381 */
const yeshayaPerakim: Node[] = [
  perek(1),
  perek(2),
  perek(40),
  perek(41),
  notNeeded(perek(43)),
  notNeeded(perek(44)),
  perek(57, 'מפסוק י"ד'),
  perek(58),
  perek(60),
  perek(66),
];

/** שמואל א' – נביאים ראשונים, הערכה בית ספרית 3373/3573 */
const shmuelAlefPerakim: Node[] = [
  { slug: "perek-1-2", title: "פרקים א'-ב' – חנה ותפילתה" },
  {
    slug: "perek-3-12",
    title: 'פרקים ג\', ז\', ט\', י"ב – שמואל כנביא וכשופט',
    description:
      'מפרשים: רד"ק פרק ג\' פסוק ג\' ד"ה "ונר אלקים טרם יכבה"; רד"ק פרק ז\' פסוק י"ג',
  },
  { slug: "perek-8-12", title: 'פרקים ח\', י"ב – בקשת המלוכה ותגובת שמואל' },
  {
    slug: "perek-9-12",
    title: 'פרקים ט\'-י"ב – שאול: מעלותיו ומשיחתו למלך',
    description: "מפרשים: רד\"ק פרק י' פסוק ח'",
  },
  {
    slug: "perek-16-17",
    title: 'פרקים ט"ז-י"ז – דוד: מעלותיו ומשיחתו למלך',
    description: 'מפרשים: רד"ק פרק י"ז פסוק מ\' ד"ה "חמשה חלוקי אבנים"',
  },
  {
    slug: "perek-18-26",
    title: 'פרקים י"ח-כ"ד, כ"ו – שאול ויחסו לדוד',
    description: 'מפרשים: רד"ק פרק כ"ד פסוק ד\' ד"ה "ויכרת את כנף המעיל"',
  },
];
/** שמואל ב' – נביאים ראשונים, הערכה בית ספרית 3373/3573 */
const shmuelBetPerakim: Node[] = [
  {
    slug: "perek-1",
    title: "פרק א' – קינת דוד על שאול ויהונתן",
    description: 'מפרשים: רד"ק פסוק כ"ד',
  },
  { slug: "perek-5", title: "פרק ה' – המלכת דוד על כל ישראל" },
  {
    slug: "perek-6",
    title: "פרק ו' – העלאת ארון ה' לעיר דוד",
    description: 'מפרשים: רד"ק פסוק ו\' ד"ה "כי שמטו הבקר"',
  },
  {
    slug: "perek-14-18",
    title: 'פרקים י"ד-י"ח – מרד אבשלום',
    description: 'מפרשים: רד"ק פרק י"ד פסוק כ"ה',
  },
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
      siman(14, 'א\' (עד "אפילו במקום הפסק"), ב\' (החל מ"ויאמר כל פסוקי דזמרא"), ג\'-ה\''),
      siman(16, "כולו"),
      siman(17, "א'-ו', ח'-ט'"),
      siman(18, 'א\'-ח\', ט\' (עד "ירוק לימנו"), י\'-י"ב, י"ד-ט"ז, י"ח-כ"א'),
      siman(19, "א'-ה', ו'-ח', י'-י\"ב, י\"ד"),
      siman(68, "א'-ה'. בתכנית 3 יח\"ל הסימן מופיע ברשימת ברכות"),
      siman(69, "א'-ד'. בתכנית 3 יח\"ל הסימן מופיע ברשימת ברכות"),
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
        description: "לפי הנספח: סימנים א'-י\"ג, ט\"ו, י\"ז (סעיפים נבחרים).",
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
          "לפי הנספח: סימנים כ\"א-כ\"ב, כ\"ו-ל\"ט (סעיפים נבחרים). הסימנים הנכללים משתנים לפי מחזור שנת השמיטה.",
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

/* --- לשון: שני תחומי הלשון שביניהם בוחרים.
 * בית הספר מחליט באיזה מהם נבחנים חיצונית ובאיזה פנימית,
 * לכן שניהם מופיעים גם תחת "בגרות חיצונית" וגם תחת "בגרות פנימית". --- */
const LASHON_TZUROT: Node = {
  slug: "tzurot",
  title: "מערכת הצורות",
  description: "בחירה: אחד מהשניים בלבד, לפי קביעת בית הספר – לחיצה על הריבוע פותחת את הפירוט שלו.",
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
    {
      slug: "darchei-tzura",
      title: "דרכי תצורה",
      children: [
        { slug: "shoresh-mishkal", title: "שורש ומשקל" },
        { slug: "basis-vetzoran-sofi", title: "בסיס וצורן סופי" },
        { slug: "tzoran-gzira-vs-nutiya", title: "צורן גזירה וצורן נטיה" },
        { slug: "helem-sheila-notrikon", title: "הלחם, שאילה מלעז ונוטריקון" },
      ],
    },
    { slug: "beinoni", title: "בינוני" },
    {
      slug: "shem-mispar",
      title: "שם המספר",
      children: [
        { slug: "mispar-mone", title: "מספר מונה" },
        { slug: "mispar-sodar", title: "מספר סודר" },
        { slug: "mispar-stami", title: "מספר סתמי" },
        { slug: "mone-meyuda", title: "מונה מיודע" },
      ],
    },
  ],
};
const LASHON_TACHBIR: Node = {
  slug: "tachbir",
  title: "תחביר",
  description: "בחירה: אחד מהשניים בלבד, לפי קביעת בית הספר – לחיצה על הריבוע פותחת את הפירוט שלו.",
  children: [
    { slug: "mishpat-pashut", title: "משפט פשוט" },
    { slug: "mishpat-murkav", title: "משפט מורכב" },
    { slug: "mishpat-kolel", title: "משפט כולל (חלקים כוללים)" },
    { slug: "mishpat-ichuy", title: "משפט איחוי" },
  ],
};


export const TREE: Node[] = [
  /* ============================ תורה ============================ */
  // כל התנ"ך (תורה/נביא/כתובים) הוכן במלואו — כל הענף מסומן בוי (2026-09-22)
  ready({
    slug: "torah",
    title: "תורה",
    description: TANACH_NOTE,
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        description: "שאלון 3381 חיצוני (40%), 3373 בית ספרי (30%), 3383 בית ספרי (30%).",
        children: [
          ready({
            slug: "external",
            title: "בגרות חיצונית – עיון בשמות",
            questionnaireCode: "3381",
            description:
              '40% מציון תנ"ך 3 יח"ל (שאלון משותף ל-5 יח"ל). השאלון כולל גם נביאים אחרונים ותהלים — ראו נביא וכתובים.',
            children: SHEMOT_3381,
          }),
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
              ready({
                slug: "school-based-electives",
                title: "הערכה בית ספרית – חלופות לבחירה",
                questionnaireCode: "3383",
                description:
                  "30% מהציון. בוחרים 2 חלופות: אחת מבין א'/ב' ואחת מבין ג'/ד' (חלופות ג'-ד' הן כתובים — ראו שם).",
                children: [
                  ready({
                    slug: "chalufa-a",
                    title: "חלופה א' – עיון בראשית ודברים",
                    children: [VAYECHI, VEZOT_HABRACHA],
                  }),
                  ready({
                    slug: "chalufa-b",
                    title: "חלופה ב' – עיון במדבר",
                    description: 'בחירה של 2 פרשות מתוך בהעלותך / שלח / קורח, עם פירוש רש"י.',
                    children: BAMIDBAR_CHALUFA,
                  }),
                ],
              }),
            ],
          },
        ],
      },
      ready({
        slug: "5-units",
        title: "בגרות 5 יחידות",
        description:
          "שאלון 3381 חיצוני (20%), 3573 בית ספרי (20%), 3583 בית ספרי (20%), יחידת הגבר 3281 חיצונית (40%).",
        children: [
          {
            slug: "same-as-3-units",
            title: "החומר המשותף עם 3 יחידות",
            description:
              'השאלון החיצוני 3381 (כאן 20%) והערכה הבית ספרית – עיון בראשית (3573, 20%) הם אותו חומר לימוד — לחיצה קופצת לפירוט המלא תחת בגרות 3 יחידות. ב-3573 נוספת תוכחת יהושע (פרק כ"ד) — ראו נביא.',
          },
          {
            slug: "school-based-electives",
            title: "הערכה בית ספרית – חלופות לבחירה",
            questionnaireCode: "3583",
            description:
              "20% מהציון. בוחרים 3 חלופות מתוך א'-ד' (חלופה ד' היא כתובים — ראו שם).",
            children: [
                  ready({
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
                  }),
                  ready({
                    slug: "chalufa-b",
                    title: "חלופה ב' – חומש ויקרא",
                    description:
                      'עיון בפרשיות אחרי מות, קדושים, אמור עם רש"י וקטעי רמב"ן וספורנו; בקיאות במקרא וברש"י בספר ויקרא.',
                    children: [
                      {
                        slug: "acharei-mot",
                        title: "פרשת אחרי מות",
                        children: [
                          perek(16),
                          perekM(17, 'רמב"ן פסוק ב\' (עד "כי אז יתיר להם בשר תאווה")'),
                          perek(18),
                        ],
                      },
                      {
                        slug: "kedoshim",
                        title: "פרשת קדושים",
                        children: [
                          perekM(19, 'ספורנו פסוק ט\'; רמב"ן פסוק י"ד (החל מ"ועל דרך הפשט")'),
                          perek(20),
                        ],
                      },
                      {
                        slug: "emor",
                        title: "פרשת אמור",
                        children: [
                          perek(21),
                          perek(22),
                          perekM(23, 'רמב"ן פסוק ב\' (עד "מיד ולדורות"); ספורנו פסוקים ל"ו, ל"ט'),
                          perek(24),
                        ],
                      },
                      {
                        slug: "bekiut-vayikra",
                        title: "בקיאות בספר ויקרא",
                        description: 'התמצאות במקרא וברש"י (פירוש אחד ברש"י).',
                      },
                    ],
                  }),
                  ready({
                    slug: "chalufa-c",
                    title: "חלופה ג' – עיון במדבר",
                    description: 'בחירה של 2 פרשות מתוך בהעלותך / שלח / קורח, עם פירוש רש"י.',
                    children: BAMIDBAR_CHALUFA,
                  }),
            ],
          },
          {
            slug: "unit-hagever",
            title: "יחידת הגבר – בחינה חיצונית",
            questionnaireCode: "3281",
            description:
              '40% מציון תנ"ך 5 יח"ל. כוללת גם מלכים, ישעיה, תרי עשר ותהלים — ראו נביא וכתובים.',
            children: [
              ready({
                slug: "bereishit-iyun",
                title: "עיון בראשית",
                description: 'פרשות בראשית ולך לך עם פירוש רש"י וקטעי רמב"ן וספורנו נבחרים.',
                children: [
                  {
                    slug: "parashat-bereishit",
                    title: "פרשת בראשית",
                    children: [
                      perekM(1, 'רמב"ן ד"ה "בראשית" (הראשון, עד "הגוי אשר לפניהם"); רמב"ן פסוק כ"ט'),
                      perekM(2, 'רמב"ן פסוק י"ז ד"ה "ביום אכלך ממנו"; ספורנו פסוק י"ח'),
                      perek(3),
                      perekM(4, 'רמב"ן פסוק י"ג (עד "רק בשמירת עליון עליו")'),
                      notNeeded(perek(5)),
                      notNeeded(perek(6, "עד פסוק ח'")),
                    ],
                  },
                  {
                    slug: "lech-lecha",
                    title: "פרשת לך לך",
                    children: [
                      perekM(12, 'רמב"ן פסוק ו\' (עד "לעובדו בפרהסיה")'),
                      perek(13),
                      perek(14),
                      perekM(15, 'ספורנו פסוק ו\'; רמב"ן פסוק י"ד ד"ה "וגם את הגוי"'),
                      perek(16),
                      perek(17),
                    ],
                  },
                ],
              }),
              {
                slug: "devarim-iyun",
                title: "עיון דברים",
                description:
                  'פרשות דברים, ואתחנן, ראה עם פירוש רש"י, הקדמת הרמב"ן לחומש דברים, וקטעי רמב"ן, ספורנו, כלי יקר ורשב"ם נבחרים.',
                children: [
                  ready({
                    slug: "hakdamat-haramban",
                    title: 'הקדמת הרמב"ן על חומש דברים',
                  }),
                  ready({
                    slug: "devarim",
                    title: "פרשת דברים",
                    children: [perekM(1, 'רמב"ן פסוק כ"ה'), perek(2), perek(3, 'עד פסוק כ"ב')],
                  }),
                  {
                    slug: "vaetchanan",
                    title: "פרשת ואתחנן",
                    children: [
                      notNeeded(perekM(3, 'כלי יקר פסוק כ"ד', 'מפסוק כ"ג')),
                      ready(perek(4)),
                      notNeeded(perek(5)),
                      ready(perek(6)),
                      ready(perek(7, 'עד פסוק י"א')),
                    ],
                  },
                  ready({
                    slug: "reeh",
                    title: "פרשת ראה",
                    children: [
                      perekM(11, 'ספורנו פסוק כ"ו', 'מפסוק כ"ו'),
                      perekM(12, "רמב\"ן פסוק כ'"),
                      perek(13),
                      perekM(14, "ספורנו פסוק א'"),
                      perekM(15, 'רמב"ן פסוק י"א ד"ה "כי לא יחדל אביון"'),
                      perek(16, 'עד פסוק י"ז'),
                    ],
                  }),
                ],
              },
            ],
          },
        ],
      }),
    ],
  }),

  /* ============================ נביא ============================ */
  ready({
    slug: "navi",
    title: "נביא",
    description: TANACH_NOTE,
    children: [
      {
        slug: "external",
        title: 'שאלון חיצוני 3 יח"ל – נביאים אחרונים',
        questionnaireCode: "3381",
        description:
          '40% מהציון ב-3 יח"ל / 20% ב-5 יח"ל (שאלון תנ"ך משותף). יש ללמוד ע"פ רש"י או מצודות באופן שכל הפסוק מפורש.',
        children: [
          ready({ slug: "yechezkel", title: "יחזקאל", children: yechezkelPerakim }),
          ready({ slug: "yirmiya", title: "ירמיה", children: yirmiyaPerakim }),
          ready({ slug: "yeshaya", title: "ישעיה", children: yeshayaPerakim }),
        ],
      },
      {
        slug: "school-based",
        title: 'הערכה בית ספרית – נביאים ראשונים (משותף ל-3 ו-5 יח"ל)',
        questionnaireCode: "3373",
        description:
          'אין הערכה בית ספרית נפרדת ל-5 יח"ל — זהו אותו חומר בשני המסלולים, רק בשאלון ובמשקל שונים: 3 יח"ל שאלון 3373 (30%), 5 יח"ל שאלון 3573 (20%). כולל גם עיון בראשית — ראו תורה. בנוסף לרש"י/מצודות נלמדים קטעי פירוש רד"ק.',
        children: [
          ready({
            slug: "yehoshua",
            title: "יהושע",
            description: 'נושאים עם קטעי רד"ק מסומנים בסמל נוצה.',
            children: [
              {
                slug: "nisim-yarden",
                title: "הניסים במעבר הירדן – פרקים ג'-ד'",
                description: "מפרשים: רד\"ק פרק ד' פסוק י\"ט",
              },
              { slug: "maal-achan", title: "מעל עכן ותוצאותיו – פרקים ז'-ח'" },
              { slug: "milchemet-yericho", title: "מלחמת יריחו – פרק ו'" },
              { slug: "milchemet-haai", title: "מלחמת העי – פרק ח'" },
              { slug: "shemesh-begivon", title: "שמש בגבעון דום – פרק י'" },
              {
                slug: "tochechat-yehoshua",
                title: 'תוכחת יהושע לפני פטירתו – פרק כ"ד (בתכנית 5 יח"ל)',
                description: 'מפרשים: רד"ק פרק כ"ד פסוק א\' (בתכנית 5 יח"ל)',
              },
            ],
          }),
          ready({
            slug: "shoftim",
            title: "שופטים",
            description: 'נושאים עם קטעי רד"ק מסומנים בסמל נוצה.',
            children: [
              { slug: "ehud", title: "אהוד בן גרא – פרק ג'" },
              {
                slug: "dvora",
                title: "דבורה הנביאה וברק בן אבינועם – פרקים ד'-ה'",
                description: "מפרשים: רד\"ק פרק ה' פסוק ו'",
              },
              {
                slug: "gidon",
                title: "גדעון – פרקים ו'-ז'",
                description: 'מפרשים: רד"ק פרק ו\' פסוק ל"ט',
              },
              {
                slug: "yiftach",
                title: 'יפתח הגלעדי ונדרו – פרקים י"א-י"ב',
                description: 'מפרשים: רד"ק פרק י"ב פסוק ח\'',
              },
              {
                slug: "shimshon",
                title: 'שמשון הגיבור ומעשיו – פרקים י"ג-ט"ז',
                description: 'מפרשים: רד"ק פרק י"ג פסוק ד\' ד"ה "ואל תשתי יין ושכר"',
              },
            ],
          }),
          ready({
            slug: "shmuel-a",
            title: "שמואל א'",
            description: 'נושאים עם קטעי רד"ק מסומנים בסמל נוצה.',
            children: shmuelAlefPerakim,
          }),
          ready({
            slug: "shmuel-b",
            title: "שמואל ב'",
            description: 'נושאים עם קטעי רד"ק מסומנים בסמל נוצה.',
            children: shmuelBetPerakim,
          }),
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
          ready({
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
          }),
          ready({
            slug: "melachim-b",
            title: "מלכים ב'",
            children: [
              { slug: "perek-4", title: "פרק ד' (פסוקים א'-ל\"ז)" },
              { slug: "perek-4-5", title: "פרק ד' מ\"ב – פרק ה' י\"ט" },
              { slug: "perek-7", title: "פרק ז' (פסוקים ג'-כ')" },
              { slug: "perek-11", title: "פרק י\"א (פסוקים א'-י\"ז)" },
              { slug: "perek-18", title: "פרק י\"ח (פסוקים א'-ז')" },
            ],
          }),
          ready({
            slug: "yeshaya-hagever",
            title: "ישעיה – פרקי הגבר",
            children: [perek(5), notNeeded(perek(6)), perek(11), perek(12), ...prakim(51, 56)],
          }),
          {
            slug: "trei-asar",
            title: "תרי עשר",
            description: 'יש ללמוד ע"פ רש"י או מצודות באופן שכל הפסוק מפורש.',
            children: [
              ready({
                slug: "hoshea",
                title: "הושע",
                children: [perek(2), perek(12, 'מפסוק י"ג'), perek(13), perek(14)],
              }),
              ready(
                notNeeded({
                  slug: "yoel",
                  title: "יואל",
                  children: [perek(1), perek(2, 'מפסוק ט"ו')],
                }),
              ),
              ready(notNeeded({ slug: "amos", title: "עמוס", children: prakimOf(2, 3, 9) })),
              ready({ slug: "ovadia", title: "עובדיה", children: [perek(1)] }),
              ready({ slug: "yona", title: "יונה", children: prakim(1, 4) }),
              ready({
                slug: "micha",
                title: "מיכה",
                children: [perek(4), perek(5), perek(6, "עד פסוק ח'")],
              }),
              ready({
                slug: "zecharia",
                title: "זכריה",
                children: [perek(2, 'מפסוק י"ד'), perek(3), perek(4, "עד פסוק ז'"), perek(14)],
              }),
              ready({ slug: "malachi", title: "מלאכי", children: [perek(3)] }),
            ],
          },
        ],
      },
    ],
  }),

  /* ============================ כתובים ============================ */
  ready({
    slug: "ktuvim",
    title: "כתובים",
    description: TANACH_NOTE,
    children: [
      {
        slug: "tehilim",
        title: 'תהלים – שאלון חיצוני 3 יח"ל',
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
            children: [
              ready(perekM(1, "מדרש קהלת רבה")),
              ready(perekM(3, "מדרש קהלת רבה")),
              ready(perekM(7, "מדרש קהלת רבה")),
              ready(perekM(12, "מדרש קהלת רבה")),
            ],
          },
          { slug: "mishlei", title: "משלי", children: prakimOf(1, 3, 31) },
          {
            slug: "ezra-nechemia",
            title: "עזרא ונחמיה",
            description:
              'בהיקף של 10 פרקים לפחות ע"פ בחירת ביה"ס. הוכנו 12 פרקים, ובית הספר בוחר מהם לפחות 10.',
            children: [
              { slug: "ezra", title: "עזרא", children: prakimOf(1, 3, 7, 9) },
              { slug: "nechemia", title: "נחמיה", children: prakimOf(1, 2, 4, 5, 6, 8, 9, 13) },
            ],
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
  }),

  /* ============================ לשון ============================ */
  {
    slug: "lashon",
    title: "לשון",
    description:
      'שאלון חיצוני 75281 (70% מהציון – הבנת הנקרא, הבעה ולשון; מופיע בלוח הבגרויות תשפ"ו) והערכה בית ספרית (30%). בית הספר בוחר מראש באיזה תחום נבחנים חיצונית ובאיזה פנימית — מערכת הצורות או תחביר. רוב בתי הספר נבחנים חיצונית במערכת הצורות ופנימית בתחביר, ויש הבוחרים הפוך.',
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "75281",
        description:
          "70% מהציון: הבנת הנקרא והבעה, ולשון – לפי בחירת בית הספר: מערכת הצורות או תחביר.",
        children: [
          LASHON_TZUROT,
          LASHON_TACHBIR,
          { slug: "havanat-hanikra", title: "הבנת הנקרא" },
          { slug: "hava'a", title: "הבעה" },
        ],
      },
      {
        slug: "internal",
        title: "בגרות פנימית",
        description:
          "הערכה בית ספרית (30%): התחום שלא נבחנים בו חיצונית – מערכת הצורות או תחביר, וכן תלקיט.",
        children: [
          { slug: "mosgey-yesod", title: "מושגים בסיסיים בלשון" },
          LASHON_TZUROT,
          LASHON_TACHBIR,
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
                children: [
                  { slug: "echad-meele", title: "אחד מאלה – הרב דוד זריצקי" },
                  { slug: "shnei-tzayarim", title: "שני ציירים – רבי נחמן מברסלב" },
                  { slug: "tvuat-hashigaon", title: "תבואת השיגעון – רבי נחמן מברסלב" },
                  { slug: "vegilu-biraada", title: "וגילו ברעדה – א. כי טוב" },
                  { slug: "zug-naalaim", title: "מעשה בזוג נעליים – הרב דוד זריצקי" },
                  { slug: "hashem-hameir", title: "השם המאיר החוזה ובעל העגלה – וולדאן" },
                  { slug: "sipur-al-sipur", title: "סיפור על סיפור – א. חיות" },
                ],
              },
              {
                slug: "novela-metugam",
                title: "נובלה וסיפור מתורגם",
                children: [
                  { slug: "voldya", title: "וולדיה נכסף להתפלל – הרב דוד זריצקי" },
                  { slug: "mahu-kachol", title: "מהו כחול? – ראלף ל. פיין" },
                  { slug: "hameshorer", title: "המשורר – א.ו. גונזלאס" },
                  { slug: "haisha-im-hapara", title: "האשה עם הפרה – י.פ. ינסן" },
                ],
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
                children: [
                  { slug: "bitul", title: "ביטול – צ. יאיר" },
                  { slug: "hatmuna-vehamisgeret", title: "התמונה והמסגרת – צ. יאיר" },
                  { slug: "aniyuti-veoshrech", title: "עניותי ועושרך – צ. יאיר" },
                  { slug: "baal-tshuva", title: "בעל תשובה – מ. אלעי" },
                  { slug: "mi-sheshav", title: "מי ששב – מ. אלעי" },
                  { slug: "honaa", title: "הונאה – ה. תראל" },
                  { slug: "yetzer-halev", title: "יצר הלב – מ. אלעי" },
                  { slug: "rachel", title: "רחל – א. מרגלית" },
                  { slug: "tfilat-hameshorer", title: "תפילת המשורר – ר. בת חיים" },
                  { slug: "heara", title: "הארה – ר. לינטופ" },
                ],
              },
              {
                slug: "shira-alegorit",
                title: "שירה אלגורית",
                children: [
                  { slug: "adama", title: "אדמה – ה. תראל" },
                  { slug: "haruach-hazo", title: "הרוח הזו – ה. תראל" },
                  { slug: "kerachem-av", title: "כרחם אב – א. מרגלית" },
                  { slug: "sulamot", title: "סולמות – ה. תראל" },
                  { slug: "erga", title: "ערגה – ה. תראל" },
                  { slug: "tzror", title: "צרור – צ. יאיר" },
                  { slug: "mamlechet-dimyon", title: "ממלכת דמיון – ר. בת חיים" },
                ],
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
                description: "הבנת המחזה כסיפור ובמציאות החיים.",
                children: [
                  { slug: "patshegen", title: "פתשגן ונפשות החיזיון" },
                  { slug: "chelek-1", title: "חלק ראשון – דיבורים ב'-ה'" },
                  { slug: "chelek-2", title: "חלק שני – דיבורים א', ד'" },
                  { slug: "chelek-3", title: "חלק שלישי – דיבור ג'" },
                ],
              },
              {
                slug: "playtonim",
                title: "רשימות פלייטונים",
                children: [
                  { slug: "krav-hablima", title: "קרב הבלימה – א. מרגלית" },
                  { slug: "haetmol", title: "האתמול – הרב ד. זריצקי" },
                  { slug: "halayla", title: "הלילה – הרב ד. זריצקי" },
                ],
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
                children: [
                  { slug: "beintaim", title: "בינתיים – צ. יאיר" },
                  { slug: "hazman", title: "הזמן – א. מרגלית" },
                  { slug: "cheshbon-nefesh", title: "חשבון נפש – א. מרגלית" },
                ],
              },
              {
                slug: "shoah",
                title: "יצירות בנושא השואה",
                children: [
                  { slug: "chaim-shami", title: "סיפור: חיים שמי – הרב משה פראגר" },
                  { slug: "hamavriach-hakatan", title: "שיר המבריח הקטן – הנריקה לאזוברט" },
                  { slug: "bar-mitzvat-haben", title: "בר מצוות הבן – ח. ברונשטיין" },
                  { slug: "kachvan", title: "קחוון במחנה ריכוז – ח. ברונשטיין" },
                  { slug: "raav", title: "רעב – ה. נלקן" },
                  { slug: "chalon-beit-aba", title: "חלון בית אבא – א. מירסקי" },
                ],
              },
              {
                slug: "meshalim",
                title: "משלים עבריים ומתורגמים",
                children: [
                  { slug: "shnei-yeladim", title: "שני ילדים משחקים – הרב דוד זריצקי" },
                  { slug: "hashlichut", title: "השליחות – הרב י. כהן" },
                  { slug: "par-veshor", title: "פר ושור – רבי ברכיה הנקדן" },
                  { slug: "parosh-vegamal", title: "פרעוש וגמל – רבי ברכיה הנקדן" },
                  { slug: "hasofer-vehashoded", title: "הסופר והשודד – קרילוב" },
                  { slug: "hachavit", title: "החבית – קרילוב" },
                ],
              },
              {
                slug: "sefer-nivchar",
                title: "קריאה מונחית – ספר אחד מבין המבחר",
                children: [
                  { slug: "aba-beshaa-shtaim", title: "אבא בשעה שתיים – רחל שור" },
                  { slug: "adam-sheyesh-lo-shaa", title: "אדם שיש לו שעה – חיה הרצברג" },
                  { slug: "baasher-telchi", title: "באשר תלך – מ. קציר" },
                  { slug: "galut-beafarim", title: "גלות באפרים ירוקים – י. גרינפלד" },
                  { slug: "duet", title: "דואט – דבורי רנד" },
                  { slug: "hadod-hatov", title: "הדוד הטוב של רולי – ר. טננהולד" },
                  { slug: "hakol-laadon-hakol", title: "הכל לאדון הכל – ר. שיין" },
                  { slug: "haruach-shegavra", title: "הרוח שגברה על הדרקון – פ. בייניש" },
                  { slug: "chatum-baesh", title: "חתום באש – דבורה רוזן" },
                  { slug: "yalda-nof", title: "ילדה נוף – רותי קפלר" },
                  { slug: "lev-shel-kerach", title: "לב של קרח – מיה קינן" },
                  { slug: "lehishaer-yehudi", title: "להישאר יהודי – זילבר" },
                  { slug: "nichoach-pirchei-hasheleg", title: "ניחוח פרחי השלג – ר.ל. קליין" },
                  { slug: "korman", title: "קורמן – מסע הגאולה – זכריה הופמן" },
                ],
              },
            ],
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
    ],
  },

  /* ============================ היסטוריה ============================ */
  {
    slug: "history",
    title: "היסטוריה",
    description:
      'תולדות עם ישראל לחינוך החרדי, חטיבה עליונה (תשפ"ו) — 2 יח"ל. החלוקה הראשונה היא לפי דרך ההיבחנות, כפי שחילק הפיקוח החרדי את נושאי הלימוד: בחינה חיצונית (שאלון 30281 – 70% מהציון) והערכה בית ספרית (שאלון 30283 – 30% מהציון).',
    children: [
      {
        slug: "external",
        title: "בגרות חיצונית",
        questionnaireCode: "30281",
        description:
          '70% מהציון (התוכנית ל-2 יח"ל). הבחינה בנויה משלושה פרקים: שאלות תלויות קטע, שאלות נושאים – סוגיות נבחרות בתולדות עם ישראל, ושאלות קצרות על מושגים מתוכנית הלימודים כולה.',
        children: [
          {
            slug: "movements-east",
            title: "תנועות ושיטות בעם ישראל במזרח אירופה",
            children: [
              {
                slug: "chasidut",
                title: "תנועת החסידות",
                description:
                  'מצב היהודים ערב התנועה, הבעש"ט, יסודות ועקרונות, מפיצי החסידות ושושלת חסידית אחת.',
              },
              {
                slug: "hagra",
                title: 'הגר"א – דרכו, מורשתו ותלמידיו',
                description:
                  "רבי אברהם בנו, רבי חיים מוולוז'ין, רבי מנחם מנדל משקלוב ורבי ישראל משקלוב.",
              },
              {
                slug: "yeshivot",
                title: "עולם הישיבות החדשות",
                description:
                  'וולוז\'ין אם הישיבות, אישיה וסגירתה; מיר, טלז, סלבודקה ופונוביז\' עד שנת תש"י.',
              },
              {
                slug: "musar",
                title: "תנועת המוסר",
                description: "מהות התנועה והרקע להקמתה; ר' ישראל מסלנט; קלם, נובהרדוק וסלבודקה.",
              },
            ],
          },
          {
            slug: "tfutzot",
            title: "יהדות התפוצות",
            children: [
              {
                slug: "islam-lands",
                title: "יהדות ארצות האסלאם",
                description:
                  "תימן, עירק ומרוקו: מצב מדיני, כלכלי ורוחני; גדולי ישראל ופעולותיהם; חכם באשי וכתר ארם צובא.",
              },
              {
                slug: "usa",
                title: "יהדות ארצות הברית",
                description:
                  'התפתחות המרכז היהודי, חצרות האדמו"רים, עולם הישיבות, בית יעקב וארגוני העזרה.',
              },
              {
                slug: "antisemitism",
                title: "אנטישמיות מודרנית",
                description:
                  "הגדרת המושג ומאפייניו; אנטישמיות פוליטית, עלילות דם, משפט בייליס, משפט דרייפוס והפרוטוקולים.",
              },
            ],
          },
          {
            slug: "churban",
            title: "חורבן יהדות אירופה",
            description: "25 שעות. (בתוכנית הלימודים נלמד כחלק מנושא יהדות התפוצות.)",
            children: [
              { slug: "nazi-germany", title: 'המשטר הנאצי בגרמניה והיהודים עד תרצ"ט' },
              {
                slug: "ww2",
                title: "מלחמת העולם השנייה והפתרון הסופי",
                description:
                  "הגטאות, הרצח ההמוני, מחנות הריכוז וההשמדה, יהודי צפון אפריקה והונגריה.",
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
                slug: "free-world",
                title: "עמדת העולם החופשי ביחס להצלת היהודים",
                description:
                  "עמדת מדינות הברית, עמדת המנהיגות הציונית ומאמצי העזרה וההצלה של היהדות החרדית.",
              },
              {
                slug: "after",
                title: "העולם היהודי אחרי החורבן",
                description: "מחנות העקורים, כיווני ההגירה ושיקום היהדות החרדית.",
              },
            ],
          },
          {
            slug: "eretz-israel-old-new",
            title: "ארץ ישראל – ארץ הקודש – ישן מול חדש",
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
                description:
                  'ה"כוללים" וכספי החלוקה, משה מונטפיורי, מוסדות החינוך והמאבק במיסיון.',
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
            slug: "mandate-period",
            title: "ארץ ישראל תחת שלטון המנדט הבריטי",
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
            ],
          },
          {
            slug: "state-of-israel",
            title: "מדינת ישראל – מהכרזת המדינה עד לאחר מלחמת יום הכיפורים",
            description: "20 שעות.",
            children: [
              {
                slug: "independence-war",
                title: 'מלחמת השחרור – תש"ח',
                description:
                  'מההצבעה באו"ם עד הכרזת העצמאות, ומהכרזת המדינה עד הסכמי שביתת הנשק.',
              },
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
      {
        slug: "internal",
        title: "בגרות פנימית – הערכה בית ספרית",
        questionnaireCode: "30283",
        description:
          "30% מהציון. לתלמידות אקסטרניות ולנבחנות משנה יש במקומה בחינה חיצונית – שאלון 30282.",
        children: [
          {
            slug: "west-europe",
            title: "היהודים במערב אירופה ובמרכזה",
            children: [
              {
                slug: "emancipation",
                title: "מצב היהודים והאמנציפציה במזרח אירופה ובמערבה",
                description:
                  "תהליך האמנציפציה והשפעתו, הקשר להשכלה ולמהפכה הצרפתית, והדגמה בשתי מדינות.",
              },
              {
                slug: "haskala",
                title: "ההשכלה, חכמת ישראל והרפורמה",
                description:
                  'מנדלסון ותלמידיו, "חכמת ישראל", כתב הסובלנות, שינויי הרפורמים וועידותיהם, התבוללות ונישואי תערובת.',
              },
              {
                slug: "gdolei-israel",
                title: 'מאבק גדולי ישראל: החת"ם סופר והרש"ר הירש',
                description: "דרכם ופעילותם והפרדת הקהילות בהונגריה ובגרמניה.",
              },
            ],
          },
          {
            slug: "movements-19th",
            title: "תנועות וזרמים במאה ה-19 ובתחילת המאה ה-20",
            children: [
              {
                slug: "russia",
                title: "יהדות רוסיה",
                description:
                  "שנאת ישראל בתקופת הצארים, ההגירה ההמונית, והיהודים תחת השלטון הקומוניסטי.",
              },
              {
                slug: "zionism",
                title: "הציונות",
                description: "התפתחות התנועה, תוכנית באזל והזרמים.",
              },
              {
                slug: "charedi-org",
                title: "התארגנות היהדות החרדית באירופה",
                description:
                  'ארגונים מקומיים, אגודת ישראל והכנסיות הגדולות, החינוך החרדי בפולין ותנועת "בית יעקב".',
              },
            ],
          },
          {
            slug: "toward-statehood",
            title: "ארץ ישראל – ממלחמת העולם השנייה ועד הקמת המדינה",
            children: [
              {
                slug: "cooperation-or-struggle",
                title: "הדילמה של הישוב: שיתוף פעולה או מאבק בבריטים",
                description:
                  'הפלמ"ח, כ"ג יורדי הסירה, הצנחנים והבריגדה; ההעפלה, לח"י והכרזת המרד של האצ"ל.',
              },
              {
                slug: "political-1945-1948",
                title: "הפעילות המדינית לקראת העצמאות (1945–1948)",
                description:
                  'מדיניות בווין והמשך הספר הלבן השלישי, ועדת החקירה האנגלו-אמריקאית, אונסקו"פ וכ"ט בנובמבר.',
              },
              {
                slug: "struggle-escalation",
                title: "החרפת המאבק בבריטים (1945–1948)",
                description: "ההעפלה, ההתיישבות, תנועת המרי העברי ופעילות המחתרות.",
              },
            ],
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
            children: [
              { slug: "sivug-irgunim", title: "סיווג ארגונים" },
              { slug: "mivne-hairgun", title: "מבנה הארגון והעקרונות שהוא מושתת עליהם" },
            ],
          },
          {
            slug: "leadership",
            title: "מנהיגות",
            children: [
              { slug: "manhig-umenahel", title: "מנהיג ומנהל: הבדלים ודמיון" },
              { slug: "signonot", title: "סגנונות מנהיגות" },
              { slug: "heksherim", title: "מנהיגות בהקשרים ארגוניים שונים" },
              { slug: "mekorot", title: "מקורות למנהיגות" },
              { slug: "koach-samchut", title: "כוח, סמכות והשפעה" },
              { slug: "hafalat-ovdim", title: "הפעלת עובדים" },
              { slug: "nihul-tzvatim", title: "ניהול צוותים" },
            ],
          },
          {
            slug: "decision-making",
            title: "קבלת החלטות",
            children: [
              { slug: "mahi-hachlata", title: "מהי החלטה?" },
              { slug: "i-vadaut", title: "אי-ודאות" },
              { slug: "tahalich", title: "תהליך קבלת החלטות" },
              { slug: "gishot", title: "גישות (מודלים) לקבלת החלטות" },
            ],
          },
          {
            slug: "organizational-change",
            title: "שינוי ארגוני",
            children: [
              { slug: "reka", title: "רקע לשינוי ארגוני" },
              { slug: "tmicha", title: "גורמי תמיכה ומאיצי שינוי" },
              { slug: "hitnagdut", title: "גורמי התנגדות ומעכבי שינוי" },
              { slug: "kelim", title: "כלים להתמודדות עם התנגדות לשינוי" },
              { slug: "model-hakarchon", title: "תיאוריות של שינוי ארגוני (מודל הקרחון)" },
              { slug: "derech-chaim", title: "השינוי כדרך חיים ארגונית" },
            ],
          },
          {
            slug: "ethics",
            title: "אתיקה",
            children: [
              { slug: "hagdara", title: "אתיקה – הגדרה וחשיבות" },
              { slug: "musagei-yesod", title: "מושגי יסוד באתיקה" },
              { slug: "etika-irgunit", title: "אתיקה ארגונית ותוכנית האתיקה" },
              { slug: "hitnahagut-etit", title: "התנהגות אתית של ארגון" },
              { slug: "manhigut-mitamer", title: "מנהיגות אתית – מנהיגות מתעמרת" },
              { slug: "achrayut-svivatit", title: "אחריות סביבתית בארגונים" },
              { slug: "achrayut-chevratit", title: "אחריות חברתית תאגידית" },
            ],
          },
          {
            slug: "economics-intro",
            title: "מבוא לכלכלה",
            children: [
              { slug: "mavo", title: "מבוא ומושגים בסיסיים בכלכלה" },
              { slug: "bikush-veheytzea", title: "ביקוש והיצע של מוצר" },
              { slug: "shivui-mishkal", title: "שיווי משקל בשוק המוצר" },
              { slug: "meshek-patuach", title: "משק פתוח – מסחר בין-לאומי במוצר" },
              { slug: "hitarvut-memshaltit", title: "התערבות ממשלתית" },
              { slug: "macro", title: "מאקרו-כלכלה: התוצר, תקציב הממשלה ומדיניות פיסקלית" },
            ],
          },
          {
            slug: "finance",
            title: "מימון",
            children: [
              { slug: "ribit", title: "ריבית" },
              { slug: "erech-atidi", title: "ערך עתידי" },
              { slug: "erech-nochechi", title: "ערך נוכחי" },
              { slug: "kedaiyut", title: 'ניתוח כדאיות השקעה (ענ"נ)' },
              { slug: "halvaot", title: "הלוואות (לוח סילוקין פשוט)" },
            ],
          },
          {
            slug: "entrepreneurship",
            title: "יזמות",
            children: [
              { slug: "yichudiyut", title: "ייחודיות ותשוקה" },
              { slug: "achdut", title: "אחדות ועבודת צוות" },
              { slug: "hakshava", title: "הקשבה: חקר שוק וקהל יעד" },
              { slug: "chashiva-yetziratit", title: "חשיבה יצירתית ובחירת הרעיון" },
              { slug: "retima", title: "רתימה: משאבים ופיץ'" },
              { slug: "kabalat-hachlatot", title: "קבלת החלטות במיזם" },
              { slug: "yisum", title: "יישום המיזם" },
              { slug: "shivuk", title: "שיווק" },
            ],
          },
        ],
      },
      {
        slug: "internal",
        title: "מטלת ביצוע – הערכה בית ספרית (30%)",
        questionnaireCode: "839283",
        children: [
          {
            slug: "business-literacy",
            title: "מבוא: מידענות ואוריינות עסקית-כלכלית",
            children: [
              { slug: "oryanut", title: "אוריינות עסקית-כלכלית" },
              { slug: "meida", title: "מידע ומידענות" },
              { slug: "taktziv-bank", title: "תקציב, בנק ואמצעי תשלום" },
            ],
          },
          {
            slug: "organization",
            title: "הארגון",
            children: [
              { slug: "mahu-irgun", title: "מהו ארגון?" },
              { slug: "sugei-irgunim", title: "סוגי ארגונים" },
              { slug: "chazon", title: "חזון, ערכים ומטרות ארגוניות" },
              { slug: "sviva-irgunit", title: "מאפייני סביבה ארגונית" },
            ],
          },
          {
            slug: "environments",
            title: "סביבות הארגון",
            children: [
              { slug: "macro", title: "סביבות המאקרו של הארגון" },
              { slug: "micro", title: "סביבות המיקרו של הארגון" },
            ],
          },
          {
            slug: "accounting",
            title: "מבוא לחשבונאות",
            children: [
              { slug: "mahut", title: "מקצוע החשבונאות – מהותו ותפקידו" },
              { slug: "hacheshbon", title: "החשבון" },
              { slug: "dochot", title: "דוחות כספיים: רווח והפסד והמאזן" },
            ],
          },
          {
            slug: "costing",
            title: "מבוא לתמחיר",
            children: [
              { slug: "gormei-yitzur", title: "גורמי ייצור" },
              { slug: "sivug-aluyot", title: "סיווג עלויות (הוצאות) הייצור" },
              { slug: "hachnasot-hotzaot", title: "הכנסות והוצאות" },
              { slug: "revach", title: "חישובי רווח / הפסד" },
              { slug: "nekudat-izun", title: "מודל נקודת איזון" },
            ],
          },
          {
            slug: "marketing",
            title: "תורת השיווק",
            children: [
              { slug: "mahu-shivuk", title: "מהו שיווק?" },
              { slug: "tamhil", title: "תמהיל השיווק" },
              { slug: "tacharut", title: "פני התחרות ומודל SWOT" },
              { slug: "tochnit-shivukit", title: "התוכנית השיווקית" },
            ],
          },
          {
            slug: "hr",
            title: "משאבי אנוש",
            children: [
              { slug: "hon-enoshi", title: "ההון האנושי" },
              { slug: "giyus", title: "גיוס עובד לארגון" },
              { slug: "yachasei-avoda", title: "יחסי עבודה ודיני עבודה" },
              { slug: "chukei-magen", title: "חוקי המגן" },
              { slug: "chukei-avoda", title: "חוקי עבודה נבחרים" },
            ],
          },
        ],
      },
    ],
  },

  /* ============================ חינוך פיננסי ============================ */
  {
    slug: "chinuch-pinansi",
    title: "חינוך פיננסי",
    description: 'לפי תוכנית הלימודים של משרד החינוך (pop.education.gov.il), ארבעה צירי תוכן.',
    children: [
      {
        slug: "tzarchanut",
        title: "ציר ראשון: צרכנות מודעת וקבלת החלטות פיננסיות",
        description:
          "ציר זה עוסק בפיתוח יכולתם של התלמידים לקבל החלטות צרכניות מושכלות ואחראיות, תוך הבנת הגורמים המשפיעים על החלטות כלכליות, ובהם שיקולים רציונליים ורגשיים, השפעות חברתיות, מנגנוני שיווק וזכויות צרכניות. הציר מטפח מודעות צרכנית, אחריות אישית והבנה של ההשלכות הכלכליות, החברתיות והסביבתיות של החלטות צרכניות.",
        children: [
          {
            slug: "grade-9",
            title: "נושאי הלימוד בכיתה ט׳",
            children: [
              { slug: "decision-processes", title: "תהליכי קבלת החלטות – הבחנה בין החלטות רציונליות לרגשיות והשפעת לחץ חברתי" },
              { slug: "happiness-on-shelf", title: "אושר על המדף - איך מוכרים לנו אושר ואיך קונים את הקונים?" },
              { slug: "consumer-rights", title: "זכויות צרכנים" },
              { slug: "digital-security", title: "אבטחת מידע במרחב הדיגיטלי והגנה מפני הונאות צרכניות" },
              { slug: "environmental-cost", title: "המחיר הסביבתי של הצריכה", description: "נושא רשות." },
            ],
          },
          {
            slug: "grade-10",
            title: "נושאי הלימוד בכיתה י׳",
            children: [
              { slug: "smart-goals", title: "הצבת מטרות ויעדים - הכרת מודל SMART" },
              { slug: "personal-budget", title: "בניית תקציב אישי ככלי לניהול פיננסי אחראי" },
            ],
          },
        ],
      },
      {
        slug: "banking",
        title: "ציר שני: עולם הכסף והבנקאות",
        description:
          "ציר זה עוסק בהבנת מהות הכסף, תפקידיו, התפתחותו והשימושים בו, ובהיכרות עם המערכת הבנקאית ותפקידה בכלכלה המודרנית. הציר מקנה לתלמידים ידע וכלים להבנת מנגנונים פיננסיים מרכזיים ולניהול מושכל של משאבים פיננסיים.",
        children: [
          {
            slug: "grade-9",
            title: "נושאי הלימוד בכיתה ט׳",
            children: [
              { slug: "money-convention", title: "כסף כמוסכמה חברתית" },
              { slug: "payment-methods", title: "סוגי אמצעי תשלום ומאפייניהם" },
              { slug: "price-determination", title: "איך נקבעים המחירים בשוק תחרותי?" },
              {
                slug: "inflation",
                title: "כוח הקנייה של הכסף, מדד מחירים לצרכן, אינפלציה ודרכי התמודדות איתה ברמת המיקרו (פרט)",
              },
            ],
          },
          {
            slug: "grade-10",
            title: "נושאי הלימוד בכיתה י׳",
            children: [
              { slug: "commercial-bank", title: "הבנק המסחרי - תפקידי הבנק המסחרי ושירותיו" },
              {
                slug: "bank-account-terms",
                title: "מושגים מרכזיים בניהול חשבון בנק – עמלות, תעודת זהות בנקאית. קריאה והבנה של תדפיס בנק",
              },
              { slug: "credit-products", title: "מוצרי אשראי - אשראי מתגלגל, מסגרת אשראי, דירוג אשראי" },
              {
                slug: "central-bank",
                title: "תפקיד הבנק המרכזי: שמירה על יציבות מחירים וקביעת הריבית במשק והשפעת הריבית על הכלכלה",
              },
            ],
          },
        ],
      },
      {
        slug: "job-market",
        title: "ציר שלישי: שוק העבודה בעולם משתנה",
        description:
          "ציר זה עוסק בהבנת מבנה שוק העבודה, השינויים המתרחשים בו והשלכותיהם על הפרט. הציר מקנה לתלמידים ידע על זכויות עובדים, מבנה השכר, ותכנון עתידי בעולם עבודה דינמי ומשתנה.",
        children: [
          {
            slug: "grade-9",
            title: "נושאי הלימוד בכיתה ט׳",
            children: [{ slug: "youth-employment-laws", title: "חוקי העסקת נוער וזכויות עובדים" }],
          },
          {
            slug: "grade-10",
            title: "נושאי הלימוד בכיתה י׳",
            children: [
              { slug: "labor-market-features", title: "מאפייני שוק העבודה והשינויים בו" },
              {
                slug: "payslip",
                title: "קריאה והבנה של תלוש שכר: שכר ברוטו/נטו, מיסים ישירים, נקודות זיכוי",
              },
              {
                slug: "employee-vs-self-employed",
                title: "עובד שכיר מול עצמאי",
                description: "נושא רשות.",
              },
              {
                slug: "state-role-labor",
                title: "תפקיד המדינה בשוק העבודה ועבודה מאורגנת",
                description: "נושא רשות.",
              },
              {
                slug: "tech-career-impact",
                title: "השפעת התפתחויות טכנולוגיות, ובכללן בינה מלאכותית, על אחריות אישית בניהול קריירה",
              },
              { slug: "pension-basics", title: "מושגי יסוד בפנסיה ותכנון פיננסי לטווח ארוך" },
            ],
          },
        ],
      },
      {
        slug: "savings-investments",
        title: "ציר רביעי: חיסכון והשקעות – בין סיכוי לסיכון",
        description:
          "ציר זה עוסק בהבנת עקרונות החיסכון וההשקעה, תוך פיתוח יכולת להעריך סיכונים והזדמנויות. הציר מקנה לתלמידים ידע בסיסי על שוק ההון, סוגי השקעות שונים והגורמים המשפיעים על קבלת החלטות השקעה.",
        children: [
          {
            slug: "grade-9",
            title: "נושאי הלימוד בכיתה ט׳",
            children: [
              { slug: "time-value-of-money", title: "ערך הזמן של הכסף - מושג הריבית ותפקידיה בחיי הפרט" },
              { slug: "importance-of-saving", title: "חשיבות החיסכון והקשר בין חיסכון לתכנון עתידי" },
              { slug: "behavioral-saving", title: "השפעת גורמים פסיכולוגיים והתנהגותיים על החלטות חיסכון" },
            ],
          },
          {
            slug: "grade-10",
            title: "נושאי הלימוד בכיתה י׳",
            children: [
              { slug: "risk-return", title: "הקשר בין סיכון לתשואה והשפעתו על החלטות השקעה" },
              { slug: "capital-market-intro", title: "מבוא לשוק ההון – מניות, אגרות חוב ומדדים" },
              { slug: "investment-channels", title: "אפיקי השקעה שונים – נדל״ן, מטבע חוץ והון אנושי" },
              { slug: "investment-fraud", title: "זיהוי סיכונים והונאות בעולם ההשקעות" },
            ],
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
    children: SICHOT_FOLDERS,
  },
  {
    slug: "chevra",
    title: "חברה",
    description: "אינו מקצוע בגרות רשמי במגזר החרדי — ללא סמל שאלון.",
    children: SICHOT_FOLDERS,
  },
  {
    slug: "kishurei-chaim",
    title: "כישורי חיים",
    description: "אינו מקצוע בגרות רשמי — ללא סמל שאלון.",
    children: SICHOT_FOLDERS,
  },
  {
    slug: "teacher",
    title: "הרחבת ידע למורה",
    description: "חומרי העשרה למורות — אינו מקצוע בגרות לתלמידות.",
  },
];
