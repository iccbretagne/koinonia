"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buildBreadcrumb, type NavSpace } from "@/lib/navigation";

interface BreadcrumbProps {
  readonly spaces: readonly NavSpace[];
  readonly className?: string;
}

/**
 * Fil d'Ariane de la barre supérieure desktop (docs/design-system/guidelines/10-navigation.md) :
 * espace › page › sous-page, déduit de la navigation du rôle. dernier segment en `ink`, les
 * autres en `ink-muted` cliquables.
 */
export default function Breadcrumb({ spaces, className = "" }: BreadcrumbProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = buildBreadcrumb(spaces, pathname, searchParams.get("dept"));

  if (segments.length === 0) return <div className={className} />;

  return (
    <nav aria-label="Fil d'Ariane" className={`min-w-0 ${className}`}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={`${segment.label}-${index}`} className={`flex items-center gap-1.5 ${isLast ? "min-w-0" : "shrink-0"}`}>
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.75} />}
              {isLast || !segment.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={`truncate ${isLast ? "font-semibold text-ink" : "text-ink-muted"}`}
                >
                  {segment.label}
                </span>
              ) : (
                <Link
                  href={segment.href}
                  className="rounded-chip text-ink-muted transition-colors duration-120 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {segment.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
