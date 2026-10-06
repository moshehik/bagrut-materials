import type { Metadata } from "next";
import { Assistant, Gveret_Levin, Rubik } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { DizzyButton } from "@/components/dizzy-button";
import { NutScrollHandle } from "@/components/nut-scroll-handle";
import { DownloadLoader } from "@/components/download-loader";
import { NutTooltip } from "@/components/nut-tooltip";
import { SiteNotices } from "@/components/site-notices";
import { GlobalBackButton } from "@/components/global-back-button";
import { Tracker } from "@/components/tracker";
import { Suspense } from "react";

const assistant = Assistant({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "600", "700", "800"],
});

const gveretLevin = Gveret_Levin({
  variable: "--font-gveret",
  subsets: ["hebrew", "latin"],
  weight: ["400"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["900"],
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
      className={`${assistant.variable} ${gveretLevin.variable} ${rubik.variable} h-full antialiased`}
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
        <DizzyButton />
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
