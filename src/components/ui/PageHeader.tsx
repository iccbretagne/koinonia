import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Surtitre en capitales (espace ou section parente : « Administration »). */
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  /** Une phrase en `ink-muted`. */
  readonly description?: ReactNode;
  /** Action principale (un seul `Button` primary) et actions secondaires, à droite sur desktop. */
  readonly actions?: ReactNode;
  /** Sous le titre : onglets (`Tabs`), filtres. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * En-tête de page (docs/design-system/components/PageHeader.md) : un seul titre par écran,
 * `title-lg` (22px) sur mobile et `title-xl` (28px) à partir de 768px. Composant serveur : aucun
 * état. L'espacement avec le contenu suivant est laissé à la page (`gap`, ou `className="mb-6"`).
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow && (
            <p className="mb-1 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[22px] font-bold leading-7 tracking-[-0.015em] text-balance text-ink md:text-[28px] md:leading-[34px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-[680px] text-[15px] leading-[22px] text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
