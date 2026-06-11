"use client";

import { useState } from "react";
import WelcomeDutyPoolClient from "./WelcomeDutyPoolClient";
import WelcomeDutyPlanningClient from "./WelcomeDutyPlanningClient";

type Tab = "pool" | "planning";

interface Props {
  churchId: string;
}

export default function WelcomeDutyShell({ churchId }: Props) {
  const [tab, setTab] = useState<Tab>("planning");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["planning", "pool"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-icc-violet text-icc-violet"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "planning" ? "Planning" : "Pool de familles"}
          </button>
        ))}
      </div>

      {tab === "planning" ? (
        <WelcomeDutyPlanningClient churchId={churchId} />
      ) : (
        <WelcomeDutyPoolClient />
      )}
    </div>
  );
}
