import type { ReactNode } from "react";

/** מעטפת עיצובית משותפת לדפי התחברות/הרשמה */
export function AuthShell({
  icon,
  title,
  subtitle,
  children,
  aside,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] items-center">
        <section className="card p-6 sm:p-8 animate-fade-up order-2 lg:order-1">
          <div className="flex items-center gap-3 mb-6">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/30">
              {icon}
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>
          </div>
          {children}
        </section>
        <aside className="order-1 lg:order-2 animate-fade-up [animation-delay:120ms]">
          {aside}
        </aside>
      </div>
    </div>
  );
}
