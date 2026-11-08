import type { Metadata } from "next";
import { Bellefair, Gveret_Levin } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_NAME } from "@/lib/constants";
import { OG_IMAGE_PATH, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_TITLE, siteOrigin } from "@/lib/seo";
import { getCurrentUser } from "@/lib/session";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { NetfreeDetector } from "@/components/netfree-detector";
import { NutScrollHandle } from "@/components/nut-scroll-handle";
import { DownloadLoader } from "@/components/download-loader";
import { NutTooltip } from "@/components/nut-tooltip";
import { SiteNotices } from "@/components/site-notices";
import { GlobalBackButton } from "@/components/global-back-button";
import { Tracker } from "@/components/tracker";
import { SiteTour } from "@/components/site-tour";
import { Suspense } from "react";

// הכתב המרובע של האתר (גוף, תפריטים, כותרות מודגשות, חותמות) - אותו גופן כמו באתר "אימון פונקציונלי בבית".
// משקלים: 200-300 Light, 400-500 Regular, 600-700 Bold, 800-900 Black. כתב היד נשאר גברת לוין.
const asparagos = localFont({
  variable: "--font-asparagos",
  display: "swap",
  src: [
    { path: "./fonts/AsparagosLight.ttf", weight: "200 300" },
    { path: "./fonts/AsparagosRegular.ttf", weight: "400 500" },
    { path: "./fonts/AsparagosBold.ttf", weight: "600 700" },
    { path: "./fonts/AsparagosBlack.ttf", weight: "800 900" },
  ],
});

const gveretLevin = Gveret_Levin({
  variable: "--font-gveret",
  subsets: ["hebrew", "latin"],
  weight: ["400"],
});

// כתב "רנסנס" לכותרות שיעורי השיחות (Bellefair: עברית + לטינית בהשראת כתב הרנסנס, מוגש מהדומיין שלנו דרך next/font)
const bellefair = Bellefair({
  variable: "--font-renaissance",
  subsets: ["hebrew", "latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  // metadataBase: כל כתובת יחסית בשדות מטא (canonical, תמונת שיתוף) נבנית ממנה. מקור אחד: siteOrigin() (ר' lib/seo.ts)
  metadataBase: new URL(siteOrigin()),
  title: { default: SEO_DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: SEO_DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: SITE_NAME,
    title: SEO_DEFAULT_TITLE,
    description: SEO_DEFAULT_DESCRIPTION,
    images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image", title: SEO_DEFAULT_TITLE, description: SEO_DEFAULT_DESCRIPTION, images: [OG_IMAGE_PATH] },
  // אימות בעלות ב-Google Search Console (שיטת תגית HTML): מגדירים GOOGLE_SITE_VERIFICATION ב-Vercel – התגית מופיעה לבד
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${asparagos.variable} ${gveretLevin.variable} ${bellefair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          דלגי לתוכן הראשי
        </a>
        <Header
          user={user ? { id: user.id, name: user.name, role: user.role } : null}
        />
        <main id="main" className="flex-1">
          <GlobalBackButton />
          <SiteNotices>{children}</SiteNotices>
        </main>
        <Footer />
        <AccessibilityWidget />
        <NetfreeDetector />
        <NutScrollHandle />
        <DownloadLoader />
        <NutTooltip />
        <Suspense fallback={null}>
          <Tracker />
        </Suspense>
        <Suspense fallback={null}>
          <SiteTour />
        </Suspense>
      </body>
    </html>
  );
}
