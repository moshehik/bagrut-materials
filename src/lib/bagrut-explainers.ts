/**
 * הסברים מובנים לכל בגרות בתרשים הזרימה (מפת הבגרות) — מוצגים בחלונית "הסבר" בסגנון המסלולים והקופונים.
 * המשקלים, סמלי השאלון והתכנים נלקחו מתיאורי העץ ב-scripts/curriculum-tree.ts; כשמשנים שם — לעדכן גם כאן.
 * המפתח הוא שרשרת ה-slug של הצומת בעץ, מופרדת ב-"/" (למשל "torah" או "math/3-units").
 */

export type PartKind = "external" | "school" | "task" | "oral" | "module" | "topic";

export type ExplainPart = {
  kind: PartKind;
  /** שם הרכיב בציון, קצר וברור */
  name: string;
  /** סמל שאלון (מוצג בצד הכרטיס) */
  code?: string;
  /** נתח באחוזים — משמש לפס ההמחשה; חסר = לא מוצג בפס */
  pct?: number;
  /** מה שכתוב בצד הכרטיס (למשל "40%" או "3 יח"ל") */
  weight: string;
  /** מה זה כולל, במשפט או שניים */
  covers: string;
  /** נתיבי slug מלאים (מהשורש) של הצמתים בעץ שמרכיבים את הפירוט המלא של מה ללמד בשאלון הזה */
  paths?: string[];
};

export type ExplainGroup = {
  /** כותרת קבוצה (למשל "במסלול 3 יחידות") — חסרה כשיש קבוצה אחת */
  label?: string;
  /** משפט הסבר קצר מתחת לכותרת */
  hint?: string;
  parts: ExplainPart[];
};

export type Explainer = {
  title: string;
  /** שורת תקציר: מספר יחידות · מבנה הציון */
  subtitle: string;
  groups: ExplainGroup[];
  /** סמלי שאלון להצגה על הכפתור — ברירת מחדל: כל הסמלים שבקופונים */
  codes?: string[];
  /** הסבר כללי שנבנה אוטומטית מתיאור הצומת בעץ (ולא הסבר בגרות מפורט) */
  generic?: boolean;
  /** "איך זה עובד בפועל" — צעדים קצרים */
  steps?: string[];
  /** "שימו לב" */
  notes?: string[];
};

export const KIND_LABEL: Record<PartKind, string> = {
  external: "בחינה חיצונית",
  school: "הערכה בית ספרית",
  task: "מטלת ביצוע",
  oral: "בחינה בעל פה",
  module: "מודול",
  topic: "נושא",
};


/** כל פריט = שורה (כרטיס) נפרדת בחלונית "שימו לב" */
const TANACH_SHARED_NOTES = [
  "תורה, נביא וכתובים הם מקצוע אחד בבגרות: תנ״ך.",
  "כל שאלון (בחינה) בודק חלקים מהתורה, מהנביא ומהכתובים יחד.",
  "במפה, בכל מקצוע מופיע רק החלק שלו מכל שאלון.",
  "המשקל שבכל כרטיס הוא של השאלון כולו, לא רק של החלק הזה.",
];

/* ------------------------------ תנ"ך ------------------------------ */

const TORAH_3: ExplainGroup = {
  label: "במסלול 3 יחידות לימוד",
  parts: [
    {
      kind: "external",
      name: "עיון בשמות",
      code: "3381",
      pct: 40,
      weight: "40%",
      covers:
        "חלק התורה: פרשות בא, בשלח, יתרו ומשפטים (מפרק כ״ד), עם רש״י וקטעי מפרשים.\nנבחנים בו יחד גם נביאים אחרונים ותהלים – הם מופיעים תחת נביא וכתובים.",
    },
    {
      kind: "school",
      name: "עיון בראשית",
      code: "3373",
      pct: 30,
      weight: "30%",
      covers: "חלק התורה: פרשות וירא, חיי שרה ותולדות עם רש״י.\nנבחנים בו יחד גם נביאים ראשונים – הם מופיעים תחת נביא.",
    },
    {
      kind: "school",
      name: "חלופות לבחירה",
      code: "3383",
      pct: 30,
      weight: "30%",
      covers: "בוחרים 2 חלופות: אחת מבין חלופה א׳ או ב׳ (חומש), ואחת מבין חלופה ג׳ או ד׳ (כתובים).",
    },
  ],
};

const TORAH_5: ExplainGroup = {
  label: "במסלול 5 יחידות לימוד",
  parts: [
    {
      kind: "external",
      name: "עיון בשמות",
      code: "3381",
      pct: 20,
      weight: "20%",
      covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 40% מהציון.",
    },
    {
      kind: "school",
      name: "עיון בראשית",
      code: "3573",
      pct: 20,
      weight: "20%",
      covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 30% מהציון.",
    },
    {
      kind: "school",
      name: "חלופות לבחירה",
      code: "3583",
      pct: 20,
      weight: "20%",
      covers: "בוחרים 3 חלופות מתוך א׳-ד׳.\nחלופה ד׳ היא כתובים.",
    },
    {
      kind: "external",
      name: "יחידת הגבר",
      code: "3281",
      pct: 40,
      weight: "40%",
      covers:
        "חלק התורה: עיון בראשית ועיון דברים.\nבנוסף: קטע שלא נלמד מתוך ספר שמות.\nלבחינה מצטיידים בחומש שמות.",
    },
  ],
};

const NAVI: Explainer = {
  title: "נביא",
  subtitle: "חלק הנביא בבגרות תנ״ך: נביאים אחרונים בבחינה חיצונית, נביאים ראשונים בהערכה בית ספרית.",
  groups: [
    {
      label: "במסלול 3 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "נביאים אחרונים",
          code: "3381",
          pct: 40,
          weight: "40%",
          covers: "פרקים נבחרים מיחזקאל, ירמיה וישעיה.\nלומדים לפי רש״י או מצודות, כך שכל פסוק מפורש.",
        },
        {
          kind: "school",
          name: "נביאים ראשונים",
          code: "3373",
          pct: 30,
          weight: "30%",
          covers:
            "בית הספר בוחר 2 ספרים מתוך 4: יהושע, שופטים, שמואל א׳ ושמואל ב׳.\nבנוסף לרש״י ומצודות נלמדים קטעי רד״ק.\nכולל גם בקיאות בנביא.",
        },
      ],
    },
    {
      label: "במסלול 5 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "נביאים אחרונים",
          code: "3381",
          pct: 20,
          weight: "20%",
          covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 40% מהציון.",
        },
        {
          kind: "school",
          name: "נביאים ראשונים",
          code: "3573",
          pct: 20,
          weight: "20%",
          covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 30% מהציון.",
        },
        {
          kind: "external",
          name: "יחידת הגבר – עיון בנביאים",
          code: "3281",
          pct: 40,
          weight: "40%",
          covers: "מלכים א׳, מלכים ב׳, פרקי הגבר בישעיה ותרי עשר.",
        },
      ],
    },
  ],
  steps: [
    "בוחרים במפה את השאלון של המסלול: 3 או 5 יחידות לימוד.",
    "כל שאלון נפתח לספרים ולפרקים שבו.",
  ],
  notes: TANACH_SHARED_NOTES,
};

const KTUVIM: Explainer = {
  title: "כתובים",
  subtitle: "חלק הכתובים בבגרות תנ״ך: תהלים בבחינה חיצונית, חלופות כתובים בהערכה בית ספרית.",
  groups: [
    {
      label: "במסלול 3 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "תהלים",
          code: "3381",
          pct: 40,
          weight: "40%",
          covers: "21 פרקי תהלים.\nלומדים לפי רש״י או מצודות, כך שכל פסוק מפורש.",
        },
        {
          kind: "school",
          name: "חלופות כתובים",
          code: "3383",
          pct: 30,
          weight: "30%",
          covers: "חלופה ג׳: רות, אסתר וקהלת.\nחלופה ד׳: עזרא-נחמיה ומשלי.",
        },
      ],
    },
    {
      label: "במסלול 5 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "תהלים",
          code: "3381",
          pct: 20,
          weight: "20%",
          covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 40% מהציון.",
        },
        {
          kind: "school",
          name: "חלופות לבחירה – חלופה ד׳ היא כתובים",
          code: "3583",
          pct: 20,
          weight: "20%",
          covers: "בשאלון בוחרים 3 חלופות.\nחלופה ד׳ (הכתובים): רות, אסתר, משלי, קהלת ועזרא-נחמיה.",
        },
        {
          kind: "external",
          name: "תהלים – יחידת הגבר",
          code: "3281",
          pct: 40,
          weight: "40%",
          covers:
            "23 פרקי תהלים. השאלון משותף לתורה ולנביא.\nבנוסף לרש״י ומצודות נלמדים קטעי מפרשים: מלבי״ם צ״ב ה׳-ו׳, ק׳ א׳-ב׳, קט״ז י״ב-י״ד, קי״ח כ״ד, ורד״ק ק״ז י״ז.",
        },
      ],
    },
  ],
  notes: TANACH_SHARED_NOTES,
};

/* ------------------------------ לשון ------------------------------ */

function lashon(title: string, focus: string): Explainer {
  return {
    title,
    subtitle: "בגרות אחת בלשון: 70% בחינה חיצונית ו-30% הערכה בית ספרית.",
    groups: [
      {
        parts: [
          {
            kind: "external",
            name: "שאלון חיצוני",
            code: "75281",
            pct: 70,
            weight: "70%",
            covers: "בחינה של משרד החינוך.\nכוללת הבנת הנקרא, הבעה ולשון.",
          },
          {
            kind: "school",
            name: "הערכה בית ספרית",
            code: "75283",
            pct: 30,
            weight: "30%",
            covers: "הערכה שבית הספר עורך.\nזהו החלק של בית הספר בציון הלשון.",
          },
        ],
      },
    ],
    steps: [
      "הלשון מחולקת באתר לשלושה מקצועות: מערכת הצורות, תחביר, והבעה והבנה.",
      "הבעה והבנה נבחנות בשני השאלונים: החיצוני והבית ספרי.",
      "בית הספר קובע מראש איזו מערכת נבחנת בחיצוני ואיזו בבית ספרי: צורות או תחביר.",
      "שתי המערכות נלמדות.",
      focus,
    ],
  };
}

/* ------------------------------ יהדות ודינים ------------------------------ */

const YAHADUT_DINIM_NOTES = [
  "מחשבת ישראל ודינים הם מקצוע אחד בבגרות: יהדות.",
  "באתר הוא מחולק לשני מקצועות: מחשבת ישראל (השקפה ומוסר) ודינים (הלכה).",
  "כל השאלונים מצטרפים לציון בגרות אחד, ולכן סמלי השאלון משותפים.",
  "כאן מוצג רק החלק של המקצוע הזה.",
];

const YAHADUT: Explainer = {
  title: "מחשבת ישראל",
  subtitle: "החלק של ההשקפה והמוסר בבגרות יהדות.",
  groups: [
    {
      label: "במסלול 3 יחידות לימוד",
      parts: [
        {
          kind: "school",
          name: "הערכה בית ספרית – מחשבה ומוסר",
          code: "4373",
          pct: 30,
          weight: "30%",
          covers: "פרקי אבות, רמב״ם, רמב״ן, ספר החינוך, ספרי מוסר ומחשבה.",
        },
      ],
    },
    {
      label: "במסלול 5 יחידות לימוד",
      parts: [
        {
          kind: "school",
          name: "הערכה בית ספרית – מחשבה ומוסר",
          code: "4573",
          pct: 20,
          weight: "20%",
          covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 30% מהציון.",
        },
        {
          kind: "external",
          name: "יחידת הגבר – בחינה חיצונית",
          code: "4281",
          pct: 40,
          weight: "40%",
          covers:
            "ספר החינוך, הכוזרי, הרמב״ם, הרמב״ן, מסילת ישרים, מהר״ל, מכתב מאליהו, החזון איש, נתיבות שלום ועוד.",
        },
      ],
    },
  ],
  notes: [
    "שאלון 4381 חיצוני בדינים נחשב לשני המקצועות יחד.",
    "הוא מהווה 40% מהציון במסלול 3 יחידות לימוד, ו-20% במסלול 5 יחידות לימוד.",
    ...YAHADUT_DINIM_NOTES,
  ],
};

const DINIM: Explainer = {
  title: "דינים",
  subtitle: "החלק של ההלכה בבגרות יהדות.",
  groups: [
    {
      label: "במסלול 3 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "בחינה חיצונית",
          code: "4381",
          pct: 40,
          weight: "40%",
          covers: "שבת, תפילה, ברכות, יום טוב, כשרות, מצוות בין אדם לחברו ומצוות שונות.",
        },
        {
          kind: "school",
          name: "הערכה בית ספרית",
          code: "4383",
          pct: 30,
          weight: "30%",
          covers: "הלכה מורחבת: שבת, חגים ומצוות התלויות בארץ.",
        },
      ],
    },
    {
      label: "במסלול 5 יחידות לימוד",
      parts: [
        {
          kind: "external",
          name: "בחינה חיצונית",
          code: "4381",
          pct: 20,
          weight: "20%",
          covers: "זה אותו שאלון שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 40% מהציון.",
        },
        {
          kind: "school",
          name: "הערכה בית ספרית",
          code: "4583",
          pct: 20,
          weight: "20%",
          covers: "זה אותו חומר שלומדים במסלול 3 יחידות.\nההבדל היחיד: כאן הוא שווה 20% מהציון, ובמסלול 3 יחידות הוא שווה 30% מהציון.",
        },
      ],
    },
  ],
  notes: [
    'שאלון 4381 החיצוני נלמד לפי "יסודות ועיקרים בהלכות שבת" (מכון אור מאיר) וקיצור שולחן ערוך.',
    ...YAHADUT_DINIM_NOTES,
  ],
};

/* ------------------------------ שאר המקצועות ------------------------------ */

const MATH_NOTE_CUMULATIVE = "כל בחינה בודקת גם את החומר של השנים הקודמות.";

const MATH_3: Explainer = {
  title: "מתמטיקה – 3 יחידות",
  subtitle: "3 יחידות לימוד: שלוש בחינות חיצוניות של משרד החינוך, אחת בכל שנה.",
  groups: [
    {
      parts: [
        {
          kind: "external",
          name: "שאלון ראשון – כיתה י׳",
          code: "35172",
          pct: 25,
          weight: "25%",
          covers: "הבסיס: קריאת נתונים, משוואות, סטטיסטיקה והסתברות, היקפים ושטחים.",
        },
        {
          kind: "external",
          name: "שאלון א׳ – כיתה י״א",
          code: "35371",
          pct: 35,
          weight: "35%",
          covers: "גדילה ודעיכה מעריכית, משוואות ריבועיות, דמיון משולשים וטריגונומטריה.",
        },
        {
          kind: "external",
          name: "שאלון ב׳ – כיתה י״ב",
          code: "35372",
          pct: 40,
          weight: "40%",
          covers: "התפלגות נורמלית, תכנון לינארי, נפחים ושטחי פנים.",
        },
      ],
    },
  ],
  steps: [
    "בכל שאלון התוכן מחולק לשלושה אשכולות: מדע וחברה, פיננסי-כלכלי, והתמצאות במישור ובמרחב.",
    "לוחצים במפה על השאלון כדי לראות את הנושאים של כל אשכול.",
  ],
  notes: [MATH_NOTE_CUMULATIVE],
};

const MATH_4: Explainer = {
  title: "מתמטיקה – 4 יחידות",
  subtitle: "4 יחידות לימוד: שתי בחינות חיצוניות של משרד החינוך.",
  groups: [
    {
      parts: [
        {
          kind: "external",
          name: "שאלון א׳ – כיתה י״א",
          code: "35471",
          pct: 65,
          weight: "65%",
          covers: "חומר כיתה י׳ וכיתה י״א.",
        },
        {
          kind: "external",
          name: "שאלון ב׳ – כיתה י״ב",
          code: "35472",
          pct: 35,
          weight: "35%",
          covers: "וקטורים, בדיקת השערות, גדילה ודעיכה, סדרות וחשבון דיפרנציאלי ואינטגרלי מעריכי-לוגריתמי.",
        },
      ],
    },
  ],
  notes: [MATH_NOTE_CUMULATIVE, "פירוט הנושאים בשאלון ב׳ הוא כללי. המפרט המחייב אצל המורה."],
};

const MATH_5: Explainer = {
  title: "מתמטיקה – 5 יחידות",
  subtitle: "5 יחידות לימוד: שתי בחינות חיצוניות של משרד החינוך.",
  groups: [
    {
      parts: [
        {
          kind: "external",
          name: "שאלון א׳ – כיתה י״א",
          code: "35571",
          pct: 60,
          weight: "60%",
          covers: "חומר כיתה י׳ וכיתה י״א.\nהסתברות, סדרות, אינדוקציה, גאומטריה, טריגונומטריה, וחשבון דיפרנציאלי ואינטגרלי.",
        },
        {
          kind: "external",
          name: "שאלון ב׳ – כיתה י״ב",
          code: "35572",
          pct: 40,
          weight: "40%",
          covers:
            "עונים על 2 שאלות מתוך 3: וקטורים, גאומטריה אנליטית ומספרים מרוכבים.\nבנוסף פרק בחשבון דיפרנציאלי ואינטגרלי של פונקציות מעריכיות ולוגריתמיות.",
        },
      ],
    },
  ],
  notes: [MATH_NOTE_CUMULATIVE],
};

const MATH: Explainer = {
  title: "מתמטיקה",
  subtitle: "שלושה מסלולים: 3, 4 או 5 יחידות לימוד. כל הבחינות חיצוניות, של משרד החינוך.",
  groups: [
    ...MATH_3.groups.map((g) => ({ ...g, label: "3 יחידות לימוד" })),
    ...MATH_4.groups.map((g) => ({ ...g, label: "4 יחידות לימוד" })),
    ...MATH_5.groups.map((g) => ({ ...g, label: "5 יחידות לימוד" })),
  ],
  notes: ["לחצי על הכפתור ״הסבר״ ליד כל מסלול כדי לראות אותו לבד."],
};

export const EXPLAINERS: Record<string, Explainer> = {
  torah: {
    title: "תורה",
    subtitle: "חלק התורה בבגרות תנ״ך: מסלול 3 או 5 יחידות לימוד.",
    groups: [TORAH_3, TORAH_5],
    notes: TANACH_SHARED_NOTES,
  },
  "torah/3-units": {
    title: "תורה – 3 יחידות",
    subtitle: "3 יחידות לימוד: בחינה חיצונית אחת ושתי הערכות בית ספריות.",
    groups: [{ parts: TORAH_3.parts }],
  },
  "torah/5-units": {
    title: "תורה – 5 יחידות",
    subtitle: "5 יחידות לימוד: שתי בחינות חיצוניות ושתי הערכות בית ספריות.",
    groups: [{ parts: TORAH_5.parts }],
    notes: ["שאלון 3381 החיצוני ושאלון 3573 (עיון בראשית) הם אותו חומר כמו במסלול 3 יחידות לימוד."],
  },
  navi: NAVI,
  ktuvim: KTUVIM,

  "lashon-tzurot": lashon(
    "לשון – מערכת הצורות",
    "במערכת הצורות לומדים: מושגי יסוד, חלקי דיבר, בניינים, גזרות, דרכי תצורה, בינוני ושם המספר.",
  ),
  "lashon-tachbir": lashon(
    "לשון – תחביר",
    "בתחביר לומדים: משפט פשוט, מורכב, כולל ואיחוי, דרכי מסירה, פיסוק תקין ומבני מודליות והדגשה.",
  ),
  "lashon-havaa": lashon(
    "לשון – הבעה והבנה",
    "בהבעה והבנה לומדים: הבנת הנקרא, הבעה ותלקיט.",
  ),

  sifrut: {
    title: "ספרות",
    subtitle: "2 יחידות לימוד: 70% בחינה חיצונית ו-30% הערכה בית ספרית.",
    groups: [
      {
        parts: [
          {
            kind: "external",
            name: "בגרות חיצונית",
            code: "10281",
            pct: 70,
            weight: "70%",
            covers: "בחינה של משרד החינוך.\nפיוט, שירת ימי הביניים, פרוזה (סיפורת), שירה חדשה, מחזה ופלייטונים.",
          },
          {
            kind: "school",
            name: "הערכה בית ספרית",
            code: "10283",
            pct: 30,
            weight: "30%",
            covers: "הערכה שבית הספר עורך.\nשירה חדשה בנושא הזמן, יצירות על השואה, משלים, וקריאה מונחית בספר אחד מתוך מבחר.",
          },
        ],
      },
    ],
  },

  english: {
    title: "אנגלית",
    codes: ["16381", "16384", "16382", "16484", "16471", "16584", "16582"],
    subtitle: "הבחינה באנגלית מחולקת למודולים, וכל מודול הוא מבחן נפרד. כמה יחידות לימוד לומדים – תלוי באילו מודולים נבחנים.",
    groups: [
      {
        label: "איזה מודולים לכל רמה",
        hint: "מודול אחד משותף לכל שתי רמות סמוכות (C בין 3 ל-4, E בין 4 ל-5). לכל מודול יש מספר שאלון משלו.",
        parts: [
          { kind: "module", name: "3 יחידות לימוד", weight: "מודולים A, B, C", covers: "מודול A (שאלון 16381).\nמודול B (שאלון 16384).\nמודול C (שאלון 16382)." },
          { kind: "module", name: "4 יחידות לימוד", weight: "מודולים C, D, E", covers: "מודול C (שאלון 16382).\nמודול D (שאלון 16484).\nמודול E (שאלון 16471, כולל אוצר מילים)." },
          { kind: "module", name: "5 יחידות לימוד", weight: "מודולים E, F, G", covers: "מודול E (שאלון 16471).\nמודול F (שאלון 16584).\nמודול G (שאלון 16582)." },
        ],
      },
      {
        label: "בנוסף לכולם",
        parts: [
          {
            kind: "oral",
            name: "בחינה בעל פה",
            weight: "כ-20%",
            covers: "מרכיב חובה בציון, בנוסף למודולים הכתובים." + String.fromCharCode(10) + "מספר השאלון תלוי ברמה ובמסלול: בדרך כלל 16385 (3 יחידות), 16485 או 16487 (4 יחידות), 16585–16587 (5 יחידות).",
          },
        ],
      },
    ],
  },

  yahadut: YAHADUT,
  dinim: DINIM,

  math: MATH,
  "math/3-units": MATH_3,
  "math/4-units": MATH_4,
  "math/5-units": MATH_5,

  history: {
    title: "היסטוריה – תולדות עם ישראל",
    subtitle: "2 יחידות לימוד: 70% בחינה חיצונית ו-30% הערכה בית ספרית.",
    groups: [
      {
        parts: [
          {
            kind: "external",
            name: "בגרות חיצונית",
            code: "30281",
            pct: 70,
            weight: "70%",
            covers:
              "בחינה של משרד החינוך, בשלושה פרקים:\nשאלות תלויות קטע.\nשאלות נושאים (סוגיות נבחרות).\nשאלות קצרות על מושגים מכל התכנית.",
          },
          {
            kind: "school",
            name: "הערכה בית ספרית",
            code: "30283",
            pct: 30,
            weight: "30%",
            covers: "הערכה שבית הספר עורך.\nהיהודים במערב אירופה, תנועות וזרמים במאה ה-19, וארץ ישראל עד הקמת המדינה.",
          },
        ],
      },
    ],
    notes: ["לתלמידות אקסטרניות ולנבחנות משנה יש במקום ההערכה הבית ספרית בחינה חיצונית: שאלון 30282."],
  },

  ezrachut: {
    title: "אזרחות",
    subtitle: "2 יחידות לימוד: שני מתווים (דרכי היבחנות), לפי הכיתה.",
    groups: [
      {
        label: "התכנית הגמישה",
        hint: "חובה במקצוע אחד לפחות מכיתה י׳.\nבית הספר בוחר אשכול אחד לבחינה חיצונית, והשני למשימות ביצוע.",
        parts: [
          {
            kind: "external",
            name: "אשכול אחד – בחינה חיצונית",
            code: "71215 / 71225",
            pct: 35,
            weight: "35%",
            covers: "דמוקרטיה, דת ומדינה (שאלון 71215), או רשויות השלטון, חוק פיקוח ובקרה (שאלון 71225).",
          },
          {
            kind: "task",
            name: "האשכול השני – שתי משימות ביצוע",
            code: "71221+71222 / 71211+71212",
            pct: 35,
            weight: "35%",
            covers: "שתי משימות מבוקרות בנושאי האשכול.\nמשימה 1 – 17%, משימה 2 – 18%.",
          },
          {
            kind: "school",
            name: "הערכה בית ספרית או חלופית",
            pct: 30,
            weight: "30%",
            covers: "הערכה בית ספרית או חלופית, לפי בחירת בית הספר.",
          },
        ],
      },
      {
        label: "המתווה הוותיק",
        hint: "נהוג בכיתות י״א-י״ב.",
        parts: [
          {
            kind: "external",
            name: "בגרות חיצונית על כל התוכן",
            code: "071-271",
            pct: 70,
            weight: "70%",
            covers: "בחינה של משרד החינוך.\nבכיתה י״ב החלוקה היא 80% (שאלון 071-264) ו-20% (שאלון 071-283).",
          },
          {
            kind: "task",
            name: "מטלת ביצוע",
            code: "071-273",
            pct: 30,
            weight: "30%",
            covers: "מטלת ביצוע שבית הספר עורך.",
          },
        ],
      },
    ],
    notes: ["נושאי היסוד משותפים לכל התלמידות.", "הם אינם חלק מהאשכולות הנבחנים בתכנית הגמישה."],
  },

  minhal: {
    title: "מנהל וכלכלה",
    subtitle: "מגמת ניהול עסקי: 70% בחינה חיצונית ו-30% מטלת ביצוע.",
    groups: [
      {
        parts: [
          { kind: "external", name: "בחינת בגרות חיצונית", code: "839381", pct: 70, weight: "70%", covers: "בחינה של משרד החינוך.\nלפי תוכניות הלימודים של מנהל החינוך הטכנולוגי." },
          { kind: "task", name: "מטלת ביצוע", code: "839283", pct: 30, weight: "30%", covers: "מטלת ביצוע שבית הספר עורך (הערכה בית ספרית)." },
        ],
      },
    ],
  },
};

/** סמלי השאלון של הבגרות, בלי כפילויות */
export function codesOf(e: Explainer): string[] {
  if (e.codes) return e.codes;
  const out: string[] = [];
  for (const g of e.groups)
    for (const p of g.parts)
      for (const c of (p.code ?? "").split(/[\s/+]+/))
        if (/\d/.test(c) && !out.includes(c)) out.push(c);
  return out;
}

/**
 * איזה חלק בעץ הוא "מה ללמד" בכל שאלון — לפי המקצוע-שורש וסמל השאלון (או שם הרכיב כשאין סמל).
 * לחיצה על כרטיס רכיב בחלונית פותחת את הפירוט המלא מתוך העץ עצמו, כך שהוא תמיד מעודכן.
 */
const PATHS: Record<string, string[]> = {
  "torah|3381": ["torah/3-units/external"],
  "torah|3373": ["torah/3-units/internal/school-based"],
  "torah|3573": ["torah/3-units/internal/school-based"],
  "torah|3383": ["torah/3-units/internal/school-based-electives"],
  "torah|3583": ["torah/5-units/school-based-electives"],
  "torah|3281": ["torah/5-units/unit-hagever"],
  "navi|3381": ["navi/external"],
  "navi|3373": ["navi/school-based"],
  "navi|3573": ["navi/school-based"],
  "navi|3281": ["navi/unit-hagever"],
  "ktuvim|3381": ["ktuvim/tehilim"],
  "ktuvim|3383": ["ktuvim/chalufot"],
  "ktuvim|3583": ["ktuvim/chalufot"],
  "ktuvim|3281": ["ktuvim/tehilim-hagever"],
  "lashon-tzurot|75281": ["lashon-tzurot"],
  "lashon-tzurot|75283": ["lashon-tzurot"],
  "lashon-tachbir|75281": ["lashon-tachbir"],
  "lashon-tachbir|75283": ["lashon-tachbir"],
  "lashon-havaa|75281": ["lashon-havaa"],
  "lashon-havaa|75283": ["lashon-havaa"],
  "sifrut|10281": ["sifrut/external"],
  "sifrut|10283": ["sifrut/internal/school-based"],
  "english|3 יחידות לימוד": ["english/module-a", "english/module-b", "english/module-c"],
  "english|4 יחידות לימוד": ["english/module-c", "english/module-d", "english/module-e", "english/module-e-vocab"],
  "english|5 יחידות לימוד": ["english/module-e", "english/module-e-vocab", "english/module-f", "english/module-g"],
  "english|בחינה בעל פה": ["english/oral-exam"],
  "yahadut|4373": ["yahadut/internal/school-based-3"],
  "yahadut|4573": ["yahadut/internal/school-based-5"],
  "yahadut|4281": ["yahadut/unit-hagever"],
  "dinim|4381": ["dinim/external"],
  "dinim|4383": ["dinim/internal/school-based-3"],
  "dinim|4583": ["dinim/internal/school-based-5"],
  "math|35172": ["math/3-units/school-based"],
  "math|35371": ["math/3-units/exam-a"],
  "math|35372": ["math/3-units/exam-b"],
  "math|35471": ["math/4-units/exam-a"],
  "math|35472": ["math/4-units/exam-b"],
  "math|35571": ["math/5-units/exam-a"],
  "math|35572": ["math/5-units/exam-b"],
  "history|30281": ["history/external"],
  "history|30283": ["history/internal"],
  "ezrachut|71215 / 71225": ["ezrachut/cluster-democracy", "ezrachut/cluster-authorities"],
  "ezrachut|71221+71222 / 71211+71212": ["ezrachut/cluster-democracy", "ezrachut/cluster-authorities"],
  "ezrachut|071-271": ["ezrachut/foundations", "ezrachut/cluster-democracy", "ezrachut/cluster-authorities"],
  "minhal|839381": ["minhal/external"],
  "minhal|839283": ["minhal/internal"],
};

const withPaths = new Map<string, Explainer>();

/**
 * מקצועות שההסבר שלהם מפוצל לחלונות הפנימיים: כל צומת-שאלון (למשל "torah/3-units/external") מקבל
 * הסבר רק על החלק שלו, והכפתור מופיע רק שם — לא גם בחלון החיצוני. מקצועות שהחלק שלהם אינו צומת בודד
 * (אנגלית, אזרחות, לשון) נשארים עם הסבר אחד בחלון הראשי.
 */
const SPLIT_ROOTS = new Set(["torah", "navi", "ktuvim", "sifrut", "history", "yahadut", "dinim", "minhal", "math"]);

let derived: Map<string, Explainer> | null = null;
function buildDerived(): Map<string, Explainer> {
  const out = new Map<string, Explainer>();
  for (const [key, base] of Object.entries(EXPLAINERS)) {
    const root = key.split("/")[0];
    if (!SPLIT_ROOTS.has(root)) continue;
    // הסבר ביניים (למשל torah/3-units) הוא תת-קבוצה של הסבר השורש — לא מפצלים אותו פעמיים
    if (key.includes("/") && EXPLAINERS[key.split("/").slice(0, -1).join("/")]) continue;
    for (const g of base.groups) {
      for (const p of g.parts) {
        const paths = PATHS[`${root}|${p.code ?? p.name}`];
        if (!paths || paths.length !== 1) continue;
        let e = out.get(paths[0]);
        if (!e) {
          e = {
            title: base.title,
            subtitle: `${KIND_LABEL[p.kind]}${p.code ? ` · שאלון ${p.code}` : ""}`,
            groups: [],
            notes: base.notes,
          };
          out.set(paths[0], e);
        }
        let grp = e.groups.find((x) => x.label === g.label);
        if (!grp) {
          grp = { label: g.label, parts: [] };
          e.groups.push(grp);
        }
        grp.parts.push({ ...p, paths });
      }
    }
  }
  // כותרת: שם המקצוע + שם הרכיב (+ המסלול, כשהחלון שייך למסלול אחד בלבד); כשיש קבוצה אחת — בלי כותרת קבוצה
  for (const e of out.values()) {
    const first = e.groups[0];
    const part = first.parts[0];
    const track = e.groups.length === 1 && first.label ? ` (${first.label.replace(/^במסלול /, "")})` : "";
    e.title = `${e.title}${track} – ${part.name}`;
    if (e.groups.length === 1) first.label = undefined;
  }
  return out;
}

/** הסבר לצומת לפי שרשרת ה-slug שלו בעץ (או undefined אם אין לו הסבר) */
export function getExplainer(chainSlugs: string[]): Explainer | undefined {
  const key = chainSlugs.join("/");
  const root = chainSlugs[0];
  if (SPLIT_ROOTS.has(root)) {
    derived ??= buildDerived();
    return derived.get(key);
  }
  const base = EXPLAINERS[key];
  if (!base) return undefined;
  const cached = withPaths.get(key);
  if (cached) return cached;
  const full: Explainer = {
    ...base,
    groups: base.groups.map((g) => ({
      ...g,
      parts: g.parts.map((p) => ({ ...p, paths: PATHS[`${root}|${p.code ?? p.name}`] })),
    })),
  };
  withPaths.set(key, full);
  return full;
}

/** נתוני צומת בעץ, כפי שנחוצים לבניית הסבר כללי */
export type GenericNodeInfo = {
  title: string;
  description: string;
  code?: string | null;
  /** כותרות האבות, מהשורש עד האב הישיר — לשורת התקציר */
  ancestorTitles: string[];
  /** נתיבי slug מלאים של הבנים הישירים — הפירוט "מה ללמד" */
  childPaths: string[];
};

/**
 * הסבר לצומת שאין לו הסבר בגרות מפורט: מציג את התיאור שלו בצורה מסודרת, ובלחיצה — את כל מה שמתחתיו.
 * כך אין בתרשים מלל חופשי מתחת לריבועים — הכול נמצא מאחורי כפתור "הסבר".
 */
export function buildGenericExplainer(n: GenericNodeInfo): Explainer {
  const pct = n.description.match(/(d{1,3})%/)?.[1];
  const kind: PartKind = /חיצונ/.test(n.title)
    ? "external"
    : /בית ספרית|פנימית|הערכה/.test(n.title)
      ? "school"
      : "topic";
  return {
    title: n.title,
    subtitle: n.ancestorTitles.join(" › "),
    generic: true,
    groups: [
      {
        parts: [
          {
            kind,
            name: n.title,
            code: n.code ?? undefined,
            weight: pct ? `${pct}%` : "",
            covers: n.description,
            paths: n.childPaths,
          },
        ],
      },
    ],
  };
}

/**
 * ניסוח פשוט וברור לחלונות שמסבירים נושא (ולא בגרות מפורטת): שורה לכל משפט.
 * המפתח הוא נתיב ה-slug של הצומת בעץ.
 */
export const GENERIC_TEXT: Record<string, string[]> = {
  torah: [
    "תנ״ך היא בגרות אחת, בשלושה חלקים: תורה, נביא וכתובים.",
    "כאן החלק של התורה. הנביאים נמצאים בתיקיית ״נביא״ והכתובים בתיקיית ״כתובים״.",
    "בחרי מסלול – 3 או 5 יחידות – ופתחי אותו.",
  ],
  "torah/3-units": [
    "במסלול 3 יחידות יש שלושה שאלונים בתורה:",
    "3381 – בחינה חיצונית, 40% מהציון.",
    "3373 – הערכה בית ספרית, 30% מהציון.",
    "3383 – הערכה בית ספרית, 30% מהציון.",
    "פתחי שאלון כדי לראות מה לומדים בו.",
  ],
  "torah/5-units": [
    "במסלול 5 יחידות יש ארבעה שאלונים בתורה:",
    "3381 – בחינה חיצונית, 20% מהציון.",
    "3573 – הערכה בית ספרית, 20% מהציון.",
    "3583 – הערכה בית ספרית, 20% מהציון.",
    "3281 (יחידת הגבר) – בחינה חיצונית, 40% מהציון.",
    "פתחי שאלון כדי לראות מה לומדים בו.",
  ],
  navi: [
    "נביא הוא אחד משלושת חלקי בגרות תנ״ך.",
    "יש בו נביאים אחרונים (בחינה חיצונית), נביאים ראשונים (הערכה בית ספרית) ויחידת הגבר ל-5 יחידות.",
    "פתחי כל חלק כדי לראות מה לומדים בו.",
  ],
  ktuvim: [
    "כתובים הוא אחד משלושת חלקי בגרות תנ״ך.",
    "יש בו תהלים (בחינה חיצונית), חלופות כתובים (הערכה בית ספרית) ותהלים – יחידת הגבר ל-5 יחידות.",
    "פתחי כל חלק כדי לראות מה לומדים בו.",
  ],
  sifrut: [
    "ספרות – 2 יחידות.",
    "בחינה חיצונית – 70% מהציון (שאלון 10281).",
    "הערכה בית ספרית – 30% מהציון (שאלון 10283).",
    "פתחי כל חלק כדי לראות אילו יצירות לומדים.",
  ],
  yahadut: [
    "יהדות ודינים היא בגרות אחת, שבאתר מחולקת לשני מקצועות.",
    "כאן מחשבת ישראל (השקפה ומוסר). ההלכה נמצאת בתיקיית ״דינים״.",
    "שני המקצועות נבחנים באותם שאלונים.",
  ],
  "yahadut/internal": [
    "הערכה בית ספרית במחשבת ישראל.",
    "נלמדים: פרקי אבות, רמב״ם, רמב״ן, ספר החינוך וספרי מוסר ומחשבה.",
  ],
  "dinim/internal": [
    "הערכה בית ספרית בדינים.",
    "נלמדת הלכה מורחבת: שבת, חגים ומצוות התלויות בארץ.",
  ],
  math: [
    "מתמטיקה נבחנת בבחינות חיצוניות בלבד.",
    "יש שלושה מסלולים: 3, 4 או 5 יחידות.",
    "פתחי מסלול כדי לראות את השאלונים שלו.",
  ],
  "math/3-units": [
    "שלוש בחינות חיצוניות, אחת בכל שנה:",
    "כיתה י׳ – 25% (שאלון 35172).",
    "כיתה י״א – 35% (שאלון 35371).",
    "כיתה י״ב – 40% (שאלון 35372).",
    "כל בחינה בודקת גם את החומר של השנים הקודמות.",
  ],
  history: [
    "תולדות עם ישראל – 2 יחידות.",
    "בחינה חיצונית – 70% מהציון (שאלון 30281).",
    "הערכה בית ספרית – 30% מהציון (שאלון 30283).",
    "פתחי כל חלק כדי לראות את הנושאים.",
  ],
  minhal: [
    "מגמת ניהול עסקי (סמל מקצוע 17.00).",
    "בחינת בגרות חיצונית – 70% מהציון.",
    "מטלת ביצוע – 30% מהציון.",
  ],
  "chinuch-pinansi": [
    "חינוך פיננסי לפי תוכנית הלימודים של משרד החינוך.",
    "יש ארבעה צירי תוכן. פתחי כל ציר כדי לקרוא עליו.",
  ],
  sicha: ["שיחת מוסר והשקפה פנימית.", "זה לא מקצוע בגרות רשמי, ואין לו סמל שאלון."],
  chevra: ["זה לא מקצוע בגרות רשמי.", "אין לו סמל שאלון."],
  "kishurei-chaim": ["זה לא מקצוע בגרות רשמי.", "אין לו סמל שאלון."],
};
