import type { ReactNode } from "react";

/** Coquille des pages publiques de la billetterie (spec 074) : bandeau, contenu, pied. */
export default function PublicShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken">
      <header className="bg-brand px-4 py-5">
        <div className="mx-auto max-w-xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-on-brand/60">{eyebrow}</p>
          <h1 className="text-xl font-bold text-on-brand">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-on-brand/80">{subtitle}</p>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
      <footer className="py-4 text-center text-xs text-ink-subtle">
        Propulsé par <span className="font-medium text-ink-muted">Koinonia</span>
      </footer>
    </div>
  );
}
