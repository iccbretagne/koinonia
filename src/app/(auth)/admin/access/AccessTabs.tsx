"use client";

import { useState, type ReactNode } from "react";

type Tab = "people" | "roles" | "requests";

interface Props {
  readonly peopleTab: ReactNode;
  readonly rolesTab: ReactNode;
  readonly requestsTab: ReactNode;
  readonly requestCount: number;
}

const TAB_LABELS: Record<Tab, string> = {
  people: "Personnes",
  roles: "Par rôle",
  requests: "Demandes",
};

export default function AccessTabs({ peopleTab, rolesTab, requestsTab, requestCount }: Props) {
  const [tab, setTab] = useState<Tab>(requestCount > 0 ? "requests" : "people");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {(["people", "roles", "requests"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors relative whitespace-nowrap shrink-0 ${
              tab === t
                ? "border-brand text-brand-text"
                : "border-transparent text-ink-muted hover:text-ink-muted"
            }`}
          >
            {TAB_LABELS[t]}
            {t === "requests" && requestCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-on-brand bg-brand rounded-full">
                {requestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={tab === "people" ? "" : "hidden"}>{peopleTab}</div>
      <div className={tab === "roles" ? "" : "hidden"}>{rolesTab}</div>
      <div className={tab === "requests" ? "" : "hidden"}>{requestsTab}</div>
    </div>
  );
}
