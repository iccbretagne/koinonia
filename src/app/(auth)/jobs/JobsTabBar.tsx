"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function JobsTabBar({
  offersCount,
  seekersCount,
  freelanceMissionsCount,
  freelanceProfilesCount,
}: {
  offersCount: number;
  seekersCount: number;
  freelanceMissionsCount: number;
  freelanceProfilesCount: number;
}) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeTab    = searchParams.get("tab") ?? "offers";

  function switchTab(tab: string) {
    router.push(`/jobs${tab === "offers" ? "" : "?tab=" + tab}`);
  }

  const tabs = [
    { id: "offers",    label: "Offres",      count: offersCount },
    { id: "seekers",   label: "En recherche", count: seekersCount },
    { id: "freelance", label: "Freelance",    count: freelanceMissionsCount + freelanceProfilesCount },
  ];

  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => switchTab(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === tab.id
              ? "border-icc-violet text-icc-violet"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label} <span className="ml-1.5 text-xs text-gray-400">({tab.count})</span>
        </button>
      ))}
    </div>
  );
}
