import type { NextConfig } from "next";

const securityHeaders = [
  // מונע הטמעת האתר (כולל ניהול ותשלום) בתוך iframe של אתר זר
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // קישורי איפוס/אימות נושאים טוקן ב-URL - לא מדליפים אותו לאתרים אחרים
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 100],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
