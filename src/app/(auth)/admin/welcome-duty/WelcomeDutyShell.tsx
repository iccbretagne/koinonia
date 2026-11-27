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
      <div role="tablist" aria-label="Service d'accueil" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {(["planning", "pool"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold leading-5 transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              tab === t ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink"
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
