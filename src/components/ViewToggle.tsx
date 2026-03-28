"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ViewToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "event";

  function setView(view: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setView("event")}
        className={`px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${
          currentView === "event"
            ? "bg-icc-violet text-white"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        Par evenement
      </button>
      <button
        onClick={() => setView("week")}
        className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${
          currentView === "week"
            ? "bg-icc-violet text-white"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        Semaine
      </button>
      <button
        onClick={() => setView("month")}
        className={`px-4 py-2 text-sm font-medium rounded-r-lg border-l border-gray-200 transition-colors ${
          currentView === "month"
            ? "bg-icc-violet text-white"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        Vue mensuelle
      </button>
    </div>
  );
}
