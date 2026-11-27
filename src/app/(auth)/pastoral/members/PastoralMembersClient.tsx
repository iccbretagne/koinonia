"use client";

import { useState, useMemo } from "react";
import { Mail, Phone, Users } from "lucide-react";
import { EmptyState, PageHeader, SearchInput, iconButtonClasses } from "@/components/ui";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  departments: {
    department: { name: string; ministry: { name: string } };
  }[];
}

export default function PastoralMembersClient({
  members,
  churchName,
}: {
  readonly members: Member[];
  readonly churchName: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const full = `${m.firstName} ${m.lastName}`.toLowerCase();
      const dept = m.departments[0]?.department;
      return (
        full.includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        dept?.name.toLowerCase().includes(q) ||
        dept?.ministry.name.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PageHeader title="Membres" description={churchName || undefined} />

      <SearchInput
        aria-label="Rechercher un membre"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher par nom, email, département…"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          size="sm"
          title={query ? "Aucun résultat" : "Aucun membre trouvé"}
          description={query ? "Essayez un autre nom, email ou département." : undefined}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {filtered.map((member) => {
            const dept = member.departments[0]?.department;
            const fullName = `${member.firstName} ${member.lastName}`;
            return (
              <li key={member.id} className="flex items-center gap-3 px-4 py-2">
                <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{fullName}</p>
                  {dept && (
                    <p className="truncate text-xs text-ink-muted">
                      {dept.ministry.name} · {dept.name}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {member.email && (
                    <a
                      href={`mailto:${member.email}`}
                      className={iconButtonClasses()}
                      aria-label={`Écrire à ${fullName} (${member.email})`}
                      title={member.email}
                    >
                      <Mail aria-hidden="true" className="size-5" strokeWidth={1.75} />
                    </a>
                  )}
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className={iconButtonClasses()}
                      aria-label={`Appeler ${fullName} (${member.phone})`}
                      title={member.phone}
                    >
                      <Phone aria-hidden="true" className="size-5" strokeWidth={1.75} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-muted">
        {filtered.length !== members.length
          ? `${filtered.length} / ${members.length} membre${members.length > 1 ? "s" : ""}`
          : `${members.length} membre${members.length > 1 ? "s" : ""}`}
      </p>
    </div>
  );
}
