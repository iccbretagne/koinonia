"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

interface Filters {
  q: string;
  speaker: string;
  series: string;
  type: string;
  from: string;
  to: string;
  sort: string;
}

const SORT_OPTIONS = [
  { value: "recent", label: "Plus récent" },
  { value: "oldest", label: "Plus ancien" },
  { value: "speaker", label: "Orateur (A→Z)" },
];

const DEBOUNCE_MS = 300;

export default function LibraryFiltersClient({
  speakers,
  seriesOptions,
  typeOptions,
  current,
}: {
  speakers: string[];
  seriesOptions: string[];
  typeOptions: { value: string; label: string }[];
  current: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);
  const [mobileOpen, setMobileOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCount = [current.q, current.speaker, current.series, current.type, current.from, current.to].filter(Boolean).length;

  function pushParams(next: Partial<Filters>) {
    const merged: Filters = { ...current, q, ...next };
    const params = new URLSearchParams(searchParams.toString());
    for (const key of Object.keys(merged) as (keyof Filters)[]) {
      const value = merged[key];
      const isDefault = !value || (key === "sort" && value === "recent");
      if (isDefault) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Recherche libre débouncée à 300 ms (plan.md) — pas de requête à chaque frappe.
  useEffect(() => {
    if (q === current.q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q }), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const speakerOptions = useMemo(() => speakers.map((s) => ({ value: s, label: s })), [speakers]);
  const seriesSelectOptions = useMemo(() => seriesOptions.map((s) => ({ value: s, label: s })), [seriesOptions]);

  return (
    <div className="mb-4">
      <div className="md:hidden mb-3">
        <Button variant="secondary" size="sm" onClick={() => setMobileOpen((o) => !o)}>
          Filtrer{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </div>

      <div className={`${mobileOpen ? "grid" : "hidden"} md:grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 mb-2`}>
        <Input
          label="Recherche"
          placeholder="Titre du culte…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          label="Orateur"
          placeholder="Tous"
          options={speakerOptions}
          value={current.speaker}
          onChange={(e) => pushParams({ speaker: e.target.value })}
        />
        <Select
          label="Série"
          placeholder="Toutes"
          options={seriesSelectOptions}
          value={current.series}
          onChange={(e) => pushParams({ series: e.target.value })}
        />
        <Select
          label="Type"
          placeholder="Tous"
          options={typeOptions}
          value={current.type}
          onChange={(e) => pushParams({ type: e.target.value })}
        />
        <Input
          label="Du"
          type="date"
          value={current.from}
          onChange={(e) => pushParams({ from: e.target.value })}
        />
        <Input
          label="Au"
          type="date"
          value={current.to}
          onChange={(e) => pushParams({ to: e.target.value })}
        />
      </div>

      <div className={`${mobileOpen ? "flex" : "hidden"} md:flex items-center gap-3`}>
        <Select
          label="Trier par"
          options={SORT_OPTIONS}
          value={current.sort}
          onChange={(e) => pushParams({ sort: e.target.value })}
          className="max-w-xs"
        />
      </div>
    </div>
  );
}
