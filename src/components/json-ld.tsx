import { jsonLdString } from "@/lib/seo";

/** נתונים מובנים לגוגל (JSON-LD). רכיב שרת: מוזרק ל-HTML הראשוני, בלי JavaScript בצד הלקוח */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
