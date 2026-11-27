"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Role } from "@/generated/prisma/client";
import { ROLE_SHORT_LABELS } from "@/lib/roles";
import { EmptyState, SearchInput, StatusChip } from "@/components/ui";

interface Person {
  id: string;
  name: string;
  email: string;
  image: string | null;
  roles: string[];
  inheritedCount: number;
}

interface Props {
  readonly people: Person[];
}

function Avatar({ person }: { readonly person: Person }) {
  if (person.image) {
    return <Image src={person.image} alt={person.name} width={36} height={36} className="rounded-full shrink-0" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-xs font-semibold text-brand-text shrink-0">
      {person.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function PeopleList({ people }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.email.toLowerCase().includes(search.toLowerCase())
      )
    : people;

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher une personne par nom ou email…"
        aria-label="Rechercher une personne"
      />

      {filtered.length === 0 && (
        <EmptyState size="sm" title="Aucune personne trouvée" description="Essayez un autre nom ou une autre adresse email." />
      )}

      {filtered.map((person) => (
        <Link
          key={person.id}
          href={`/admin/access/users/${person.id}`}
          className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Avatar person={person} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{person.name}</p>
            <p className="truncate text-[13px] leading-[18px] text-ink-muted">{person.email}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 max-w-[50%]">
            {person.roles.map((role) => (
              <StatusChip key={role} tone="brand">
                {ROLE_SHORT_LABELS[role as Role] ?? role}
              </StatusChip>
            ))}
            {person.inheritedCount > 0 && (
              <StatusChip>
                +{person.inheritedCount} hérité{person.inheritedCount > 1 ? "s" : ""}
              </StatusChip>
            )}
            {person.roles.length === 0 && person.inheritedCount === 0 && (
              <span className="text-[13px] text-ink-muted">Aucun accès</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
