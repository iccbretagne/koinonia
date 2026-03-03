"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function DashboardActions() {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "event";
  const dept = searchParams.get("dept");

  function buildHref(view: string) {
    const params = new URLSearchParams();
    if (dept) params.set("dept", dept);
    params.set("view", view);
    return `/dashboard?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap gap-2 md:gap-3">
      <Link
        href={buildHref("event")}
        className={`inline-flex items-center gap-2 px-3 py-2 md:px-4 text-sm font-medium rounded-lg border transition-colors ${
          currentView === "event"
            ? "bg-icc-violet text-white border-icc-violet"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Planification
      </Link>
      <Link
        href={buildHref("month")}
        className={`inline-flex items-center gap-2 px-3 py-2 md:px-4 text-sm font-medium rounded-lg border transition-colors ${
          currentView === "month"
            ? "bg-icc-violet text-white border-icc-violet"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Vue planning
      </Link>
    </div>
  );
}
