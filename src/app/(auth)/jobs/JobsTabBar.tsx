"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function JobsTabBar({
  offersCount,
  seekersCount,
}: {
  offersCount: number;
  seekersCount: number;
}) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeTab    = searchParams.get("tab") ?? "offers";

  function switchTab(tab: string) {
    router.push(`/jobs${tab === "offers" ? "" : "?tab=" + tab}`);
  }

  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      <button
        onClick={() => switchTab("offers")}
        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
          activeTab === "offers"
            ? "border-icc-violet text-icc-violet"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Offres <span className="ml-1.5 text-xs text-gray-400">({offersCount})</span>
      </button>
      <button
        onClick={() => switchTab("seekers")}
        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
          activeTab === "seekers"
            ? "border-icc-violet text-icc-violet"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        En recherche <span className="ml-1.5 text-xs text-gray-400">({seekersCount})</span>
      </button>
    </div>
  );
}
