import type { Metadata } from "next";
import { Heebo, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AccessibilityWidget } from "@/components/accessibility-widget";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const frank = Frank_Ruhl_Libre({
  variable: "--font-frank",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
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
      className={`${heebo.variable} ${frank.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          דלגי לתוכן הראשי
        </a>
        <Header
          user={user ? { name: user.name, role: user.role, tier: user.tier } : null}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <AccessibilityWidget />
      </body>
    </html>
  );
}
