import type { Metadata } from "next";
import { Gveret_Levin } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { NutScrollHandle } from "@/components/nut-scroll-handle";
import { DownloadLoader } from "@/components/download-loader";
import { NutTooltip } from "@/components/nut-tooltip";
import { SiteNotices } from "@/components/site-notices";
import { GlobalBackButton } from "@/components/global-back-button";
import { Tracker } from "@/components/tracker";
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

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${asparagos.variable} ${gveretLevin.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          דלגי לתוכן הראשי
        </a>
        <Header
          user={user ? { name: user.name, role: user.role } : null}
        />
        <main id="main" className="flex-1">
          <GlobalBackButton />
          <SiteNotices>{children}</SiteNotices>
        </main>
        <Footer />
        <AccessibilityWidget />
        <NutScrollHandle />
        <DownloadLoader />
        <NutTooltip />
        <Suspense fallback={null}>
          <Tracker />
        </Suspense>
      </body>
    </html>
  );
}
