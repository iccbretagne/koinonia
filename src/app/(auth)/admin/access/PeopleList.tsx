"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Role } from "@/generated/prisma/client";
import { ROLE_SHORT_LABELS } from "@/lib/roles";

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
    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0">
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
    <div className="space-y-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher une personne par nom ou email..."
        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
      />

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 italic text-center py-8">Aucune personne trouvée.</p>
      )}

      {filtered.map((person) => (
        <Link
          key={person.id}
          href={`/admin/access/users/${person.id}`}
          className="flex items-center gap-3 bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 hover:border-icc-violet/30 transition-colors"
        >
          <Avatar person={person} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
            <p className="text-xs text-gray-400 truncate">{person.email}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 max-w-[50%]">
            {person.roles.map((role) => (
              <span
                key={role}
                className="text-xs bg-icc-violet/10 text-icc-violet border border-icc-violet/20 px-2 py-0.5 rounded-full font-medium"
              >
                {ROLE_SHORT_LABELS[role as Role] ?? role}
              </span>
            ))}
            {person.inheritedCount > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">
                +{person.inheritedCount} hérité{person.inheritedCount > 1 ? "s" : ""}
              </span>
            )}
            {person.roles.length === 0 && person.inheritedCount === 0 && (
              <span className="text-xs text-gray-400 italic">Aucun accès</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
