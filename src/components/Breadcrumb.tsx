"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface BreadcrumbProps {
  departments?: { id: string; name: string }[];
}

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

function buildBreadcrumb(pathname: string, deptName?: string): BreadcrumbSegment[] {
  // Static route mappings
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard?")) {
    const segments: BreadcrumbSegment[] = [{ label: "Départements", href: deptName ? "/dashboard" : undefined }];
    if (deptName) {
      segments.push({ label: deptName });
    }
    return segments;
  }

  if (pathname === "/events") {
    return [{ label: "Événements" }];
  }

  // /events/[id]/star-view
  if (/^\/events\/[^/]+\/star-view$/.test(pathname)) {
    return [
      { label: "Événements", href: "/events" },
      { label: "Planning des STAR" },
    ];
  }

  // /events/[id] (event detail)
  if (/^\/events\/[^/]+$/.test(pathname)) {
    return [
      { label: "Événements", href: "/events" },
      { label: "Détail" },
    ];
  }

  // Admin routes
  if (pathname.startsWith("/admin")) {
    const segments: BreadcrumbSegment[] = [{ label: "Administration", href: "/admin/members" }];

    if (pathname === "/admin/members") {
      segments.push({ label: "STAR" });
    } else if (pathname === "/admin/events") {
      segments.push({ label: "Événements" });
    } else if (/^\/admin\/events\/[^/]+$/.test(pathname)) {
      segments.push({ label: "Événements", href: "/admin/events" });
      segments.push({ label: "Détail" });
    } else if (pathname === "/admin/churches") {
      segments.push({ label: "Églises" });
    } else if (/^\/admin\/churches\/[^/]+$/.test(pathname)) {
      segments.push({ label: "Églises", href: "/admin/churches" });
      segments.push({ label: "Détail" });
    } else if (pathname === "/admin/users") {
      segments.push({ label: "Utilisateurs" });
    } else if (pathname === "/admin/ministries") {
      segments.push({ label: "Ministères" });
    } else if (pathname === "/admin/departments") {
      segments.push({ label: "Départements" });
    }

    return segments;
  }

  return [];
}

function ChevronSeparator() {
  return (
    <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function Breadcrumb({ departments = [] }: BreadcrumbProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deptId = searchParams.get("dept");
  const deptName = deptId ? departments.find((d) => d.id === deptId)?.name : undefined;
  const segments = buildBreadcrumb(pathname, deptName);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Fil d'Ariane" className="mb-3 md:mb-4">
      <ol className="flex items-center gap-1.5 text-xs md:text-sm">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={`${segment.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronSeparator />}
              {isLast || !segment.href ? (
                <span className="text-gray-700 font-medium">{segment.label}</span>
              ) : (
                <Link href={segment.href} className="text-icc-violet hover:underline">
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
