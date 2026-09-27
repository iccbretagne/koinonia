"use client";

import { useState } from "react";
import WelcomeDutyPoolClient from "./WelcomeDutyPoolClient";
import WelcomeDutyPlanningClient from "./WelcomeDutyPlanningClient";

type Tab = "pool" | "planning";

interface Props {
  readonly churchId: string;
}

export default function WelcomeDutyShell({ churchId }: Props) {
  const [tab, setTab] = useState<Tab>("planning");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {(["planning", "pool"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-brand text-brand-text"
                : "border-transparent text-ink-muted hover:text-ink-muted"
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
