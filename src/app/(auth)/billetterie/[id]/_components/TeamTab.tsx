"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { ROLES, ROLE_LABEL } from "@/modules/ticketing/schemas";
import type { TicketingRole } from "@/generated/prisma/enums";
import { useApi } from "../../use-api";

interface RoleRow {
  userId: string;
  role: TicketingRole;
  name: string | null;
  email: string;
}

/** Équipe : rôles d'événement attribués à des comptes de l'église (STAR compris), cumulables. */
export default function TeamTab({
  eventId,
  roles,
  accounts,
}: {
  readonly eventId: string;
  readonly roles: RoleRow[];
  readonly accounts: { id: string; name: string | null; email: string }[];
}) {
  const { call, busy } = useApi();
  const [list, setList] = useState(roles.map((r) => ({ userId: r.userId, role: r.role })));
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<TicketingRole>("RECEPTION");
  const names = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name ?? a.email]));
    for (const r of roles) map.set(r.userId, r.name ?? r.email);
    return map;
  }, [accounts, roles]);

  const dirty = JSON.stringify(list) !== JSON.stringify(roles.map((r) => ({ userId: r.userId, role: r.role })));

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-ink-muted">
        Les rôles ne valent que pour cet événement et s&apos;arrêtent à sa clôture. L&apos;administration de l&apos;église (Admin, Secrétaire) est
        organisatrice d&apos;office.
      </p>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {list.map((r, i) => (
          <li key={`${r.userId}:${r.role}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-ink">
              {names.get(r.userId) ?? r.userId} — <strong>{ROLE_LABEL[r.role]}</strong>
            </span>
            <Button type="button" size="sm" variant="ghost" aria-label="Retirer ce rôle" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-3 text-[15px] text-ink-muted">Aucun rôle attribué.</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Select
            label="Compte"
            value={userId}
            placeholder="Choisir une personne"
            options={accounts.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.email})` : a.email }))}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <Select label="Rôle" value={role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} onChange={(e) => setRole(e.target.value as TicketingRole)} />
        <Button
          type="button"
          variant="secondary"
          disabled={!userId || list.some((r) => r.userId === userId && r.role === role)}
          onClick={() => setList((l) => [...l, { userId, role }])}
        >
          Ajouter
        </Button>
      </div>
      <Button type="button" disabled={busy || !dirty} onClick={() => call(`/api/ticketing/events/${eventId}/roles`, "PUT", { roles: list }, "Rôles enregistrés")}>
        {busy ? "Enregistrement…" : "Enregistrer les rôles"}
      </Button>
    </div>
  );
}
