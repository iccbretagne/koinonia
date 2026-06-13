"use client";

import { useState, useMemo } from "react";

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
  members: Member[];
  churchName: string;
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Membres</h1>
        {churchName && (
          <p className="text-sm text-gray-500 mt-0.5">{churchName}</p>
        )}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher par nom, email, département…"
        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-400 italic text-sm py-6 text-center">
          {query ? "Aucun résultat." : "Aucun membre trouvé."}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.map((member) => {
            const dept = member.departments[0]?.department;
            return (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-icc-violet/10 text-icc-violet flex items-center justify-center text-sm font-semibold shrink-0">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {member.firstName} {member.lastName}
                  </p>
                  {dept && (
                    <p className="text-xs text-gray-400 truncate">
                      {dept.ministry.name} · {dept.name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {member.email && (
                    <a
                      href={`mailto:${member.email}`}
                      className="text-gray-400 hover:text-icc-violet transition-colors"
                      title={member.email}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </a>
                  )}
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className="text-gray-400 hover:text-icc-violet transition-colors"
                      title={member.phone}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {filtered.length}{filtered.length !== members.length ? ` / ${members.length}` : ""} membre{members.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
