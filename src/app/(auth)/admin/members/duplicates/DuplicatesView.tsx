"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, X } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Modal, RadioGroup, SearchInput, StatusChip, type StatusTone } from "@/components/ui";

type MemberSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  departments: { id: string; name: string; ministryName: string; isPrimary: boolean }[];
  userLink: { userId: string; name: string | null; email: string } | null;
  counts: { plannings: number; disciples: number; disciplesMade: number };
};

type Group = {
  reason: "same_name" | "same_email" | "both";
  members: MemberSummary[];
};

interface Props {
  readonly groups: Group[];
  readonly allMembers: MemberSummary[];
  readonly churchId: string;
  /** access:manage — attribuer le rôle STAR en masse, distinct de members:manage (spec 054/#583). */
  readonly canAssignStarRoles: boolean;
}

const REASON_LABEL: Record<Group["reason"], string> = {
  same_name: "Même nom",
  same_email: "Même email",
  both: "Même nom + email",
};

const REASON_TONE: Record<Group["reason"], StatusTone> = {
  same_name: "warning",
  same_email: "warning",
  both: "danger",
};

/** « 1 planning », « 3 plannings ». */
function count(n: number, singular: string, plural: string) {
  return `${n} ${n > 1 ? plural : singular}`;
}

function MemberCard({ member, isSource, label }: { readonly member: MemberSummary; readonly isSource: boolean; readonly label: string }) {
  return (
    <div className={`min-w-0 rounded-card border p-4 ${isSource ? "border-danger/30 bg-danger-soft" : "border-success/30 bg-success-soft"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <StatusChip tone={isSource ? "danger" : "success"}>{label}</StatusChip>
        {member.userLink && <StatusChip tone="brand">Compte lié</StatusChip>}
      </div>
      <p className="truncate font-semibold text-ink" title={`${member.firstName} ${member.lastName}`}>{member.firstName} {member.lastName}</p>
      {member.email && <p className="truncate text-sm text-ink-muted" title={member.email}>{member.email}</p>}
      {member.phone && <p className="truncate text-sm text-ink-muted" title={member.phone}>{member.phone}</p>}
      {member.userLink && <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">Compte : {member.userLink.name ?? member.userLink.email}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {member.departments.map((d) => (
          <StatusChip key={d.id} tone={d.isPrimary ? "brand" : "neutral"}>
            {d.ministryName} › {d.name}
          </StatusChip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 text-[13px] leading-[18px] text-ink-muted">
        <span>{count(member.counts.plannings, "planning", "plannings")}</span>
        <span>{count(member.counts.disciples, "discipolat", "discipolats")}</span>
        <span>{count(member.counts.disciplesMade, "disciple", "disciples")}</span>
      </div>
    </div>
  );
}

type FieldChoice<T> = { value: T; from: "source" | "target" | "manual" };

function FieldPicker<T extends string | null>({
  label,
  sourceValue,
  targetValue,
  choice,
  onChange,
}: {
  readonly label: string;
  readonly sourceValue: T;
  readonly targetValue: T;
  readonly choice: FieldChoice<T>;
  readonly onChange: (c: FieldChoice<T>) => void;
}) {
  const same = sourceValue === targetValue;
  if (same) {
    return (
      <div className="text-[15px] leading-[22px] text-ink">
        <span className="font-semibold">{label} :</span> {sourceValue ?? <span className="text-ink-muted">vide</span>}
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-control border border-line bg-surface px-3 pt-2">
      <RadioGroup
        legend={label}
        value={choice.from === "manual" ? "" : choice.from}
        onChange={(from) => onChange({ value: from === "source" ? sourceValue : targetValue, from })}
        options={[
          { value: "source", label: sourceValue ?? <span className="text-ink-muted">vide</span>, description: "Fiche supprimée" },
          { value: "target", label: targetValue ?? <span className="text-ink-muted">vide</span>, description: "Fiche conservée" },
        ]}
      />
    </div>
  );
}

function MergeModal({
  group,
  onClose,
  onMerged,
}: {
  readonly group: Group;
  readonly onClose: () => void;
  readonly onMerged: () => void;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = group.members[sourceIndex];
  const target = group.members[sourceIndex === 0 ? 1 : 0];

  const [firstName, setFirstName] = useState<FieldChoice<string>>({
    value: target.firstName,
    from: "target",
  });
  const [lastName, setLastName] = useState<FieldChoice<string>>({
    value: target.lastName,
    from: "target",
  });
  const [email, setEmail] = useState<FieldChoice<string | null>>({
    value: target.email,
    from: "target",
  });
  const [phone, setPhone] = useState<FieldChoice<string | null>>({
    value: target.phone,
    from: "target",
  });
  const [keepUserId, setKeepUserId] = useState<string | null>(
    target.userLink?.userId ?? source.userLink?.userId ?? null
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bothHaveLink = !!(source.userLink && target.userLink);

  // Reset choices when source/target swap
  function swap() {
    setSourceIndex((i) => (i === 0 ? 1 : 0));
    setFirstName({ value: source.firstName, from: "target" });
    setLastName({ value: source.lastName, from: "target" });
    setEmail({ value: source.email, from: "target" });
    setPhone({ value: source.phone, from: "target" });
    setKeepUserId(source.userLink?.userId ?? target.userLink?.userId ?? null);
  }

  async function confirm() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/members/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          targetId: target.id,
          resolution: {
            firstName: firstName.value,
            lastName: lastName.value,
            email: email.value,
            phone: phone.value,
            keepUserId: bothHaveLink ? keepUserId : null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur inconnue");
      onMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Fusionner deux membres">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Cartes source/target */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MemberCard member={source} isSource label="Sera supprimé" />
          <MemberCard member={target} isSource={false} label="Sera conservé" />
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={swap}>
          <ArrowLeftRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Inverser source et cible
        </Button>

        {/* Résolution des champs */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Champs à conserver</p>
          <FieldPicker
            label="Prénom"
            sourceValue={source.firstName}
            targetValue={target.firstName}
            choice={firstName}
            onChange={setFirstName}
          />
          <FieldPicker
            label="Nom"
            sourceValue={source.lastName}
            targetValue={target.lastName}
            choice={lastName}
            onChange={setLastName}
          />
          <FieldPicker
            label="Email"
            sourceValue={source.email}
            targetValue={target.email}
            choice={email}
            onChange={setEmail}
          />
          <FieldPicker
            label="Téléphone"
            sourceValue={source.phone}
            targetValue={target.phone}
            choice={phone}
            onChange={setPhone}
          />
        </div>

        {/* Conflit de compte lié */}
        {bothHaveLink && (
          <Alert tone="warning" title="Les deux ont un compte Google lié — lequel conserver ?">
            <RadioGroup
              legend="Compte Google à conserver"
              hideLegend
              value={keepUserId ?? ""}
              onChange={setKeepUserId}
              options={[
                { value: source.userLink!.userId, label: source.userLink!.name ?? source.userLink!.email, description: "Source" },
                { value: target.userLink!.userId, label: target.userLink!.name ?? target.userLink!.email, description: "Cible" },
              ]}
            />
          </Alert>
        )}

        {/* Départements fusionnés */}
        <div className="flex flex-wrap gap-1 rounded-control border border-line p-3">
          <p className="mb-1 w-full text-sm font-semibold text-ink">Départements après fusion (union)</p>
          {[
            ...new Map(
              [...source.departments, ...target.departments].map((d) => [d.id, d])
            ).values(),
          ].map((d) => (
            <StatusChip key={d.id}>
              {d.ministryName} › {d.name}
            </StatusChip>
          ))}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
      </div>

      <div className="mt-4 flex justify-end gap-3 border-t border-line pt-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button variant="danger" onClick={confirm} disabled={loading}>
          {loading ? "Fusion en cours…" : "Confirmer la fusion"}
        </Button>
      </div>
    </Modal>
  );
}

function MemberPicker({
  label,
  members,
  selectedId,
  excludeId,
  onSelect,
}: {
  readonly label: string;
  readonly members: MemberSummary[];
  readonly selectedId: string;
  readonly excludeId: string;
  readonly onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((m) => {
    if (m.id === excludeId) return false;
    const q = search.toLowerCase();
    return (
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.email?.toLowerCase().includes(q) ?? false)
    );
  });
  const selected = members.find((m) => m.id === selectedId);

  return (
    <div className="min-w-0 rounded-card border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <SearchInput
        aria-label={`${label} : rechercher par nom ou email`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par nom ou email…"
        className="mb-2"
      />
      {selected && !search && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-control bg-brand-soft py-1 pl-3 pr-1">
          <span className="min-w-0 truncate text-[15px] font-semibold text-brand-text" title={[`${selected.firstName} ${selected.lastName}`, selected.email && `(${selected.email})`].filter(Boolean).join(" ")}>
            {selected.firstName} {selected.lastName}
            {selected.email && <span className="ml-1 text-[13px] leading-[18px] text-ink-muted">({selected.email})</span>}
          </span>
          <IconButton icon={X} aria-label={`Retirer ${selected.firstName} ${selected.lastName}`} onClick={() => onSelect("")} />
        </div>
      )}
      {(search || !selectedId) && (
        <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-[13px] leading-[18px] text-ink-muted">Aucun résultat</li>
          )}
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => { onSelect(m.id); setSearch(""); }}
                aria-pressed={m.id === selectedId}
                className={`min-h-11 w-full px-3 py-2 text-left text-[15px] text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${m.id === selectedId ? "bg-brand-soft font-semibold" : ""}`}
              >
                {m.firstName} {m.lastName}
                {m.email && <span className="ml-1 text-[13px] leading-[18px] text-ink-muted">· {m.email}</span>}
                {m.userLink && <span className="ml-1 text-[13px] leading-[18px] text-ink-muted">· compte lié</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DuplicatesView({ groups, allMembers, churchId, canAssignStarRoles }: Props) {
  const router = useRouter();
  const [mergeGroup, setMergeGroup] = useState<Group | null>(null);
  const [assigningStars, setAssigningStars] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assigned: number; total: number } | null>(null);

  const [manualSourceId, setManualSourceId] = useState("");
  const [manualTargetId, setManualTargetId] = useState("");

  function openManualMerge() {
    const source = allMembers.find((m) => m.id === manualSourceId);
    const target = allMembers.find((m) => m.id === manualTargetId);
    if (!source || !target) return;
    setMergeGroup({ reason: "same_name", members: [source, target] });
  }

  async function assignStarRoles() {
    setAssigningStars(true);
    try {
      const res = await fetch("/api/admin/members/assign-star-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId }),
      });
      const json = await res.json();
      if (res.ok) setAssignResult(json);
    } finally {
      setAssigningStars(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Bulk STAR assign */}
      {canAssignStarRoles && (
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Assigner le rôle STAR aux membres liés sans accès</h2>
            <p className="mt-0.5 text-[15px] leading-[22px] text-ink-muted">
              Attribue automatiquement le rôle STAR (accès planning en lecture) à tous les membres avec un compte Google lié mais aucun rôle.
            </p>
          </div>
          <Button variant="secondary" onClick={assignStarRoles} disabled={assigningStars}>
            {assigningStars ? "Attribution…" : "Assigner les rôles STAR"}
          </Button>
        </div>
        {assignResult && (
          <Alert tone="success" className="mt-3">
            {assignResult.assigned > 1 ? `${assignResult.assigned} rôles STAR assignés` : `${assignResult.assigned} rôle STAR assigné`}
            {" "}sur {count(assignResult.total, "compte lié", "comptes liés")}.
          </Alert>
        )}
      </section>
      )}

      {/* Fusion manuelle */}
      <section>
        <h2 className="mb-1 font-display text-[17px] font-semibold leading-6 text-ink">Fusion manuelle</h2>
        <p className="mb-4 text-[15px] leading-[22px] text-ink-muted">
          Sélectionnez deux membres à fusionner, même s&apos;ils ne sont pas détectés automatiquement comme doublons.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MemberPicker
            label="Membre à supprimer"
            members={allMembers}
            selectedId={manualSourceId}
            excludeId={manualTargetId}
            onSelect={setManualSourceId}
          />
          <MemberPicker
            label="Membre à conserver"
            members={allMembers}
            selectedId={manualTargetId}
            excludeId={manualSourceId}
            onSelect={setManualTargetId}
          />
        </div>
        {manualSourceId && manualTargetId && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={openManualMerge}>
              Fusionner ces deux membres
            </Button>
          </div>
        )}
      </section>

      {/* Liste doublons */}
      {groups.length === 0 ? (
        <EmptyState title="Aucun doublon détecté" description="Tous les membres ont des noms et emails uniques." />
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
            {groups.length > 1
              ? `${groups.length} groupes de doublons potentiels détectés`
              : "1 groupe de doublons potentiels détecté"}
          </h2>
          {groups.map((group) => (
            <div key={group.members.map((m) => m.id).join("-")} className="rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <StatusChip tone={REASON_TONE[group.reason]}>{REASON_LABEL[group.reason]}</StatusChip>
                <Button variant="secondary" size="sm" onClick={() => setMergeGroup(group)}>
                  Fusionner
                </Button>
              </div>
              {/* Nombre de membres variable par groupe (rarement > 2) : `auto-fit` passe à une
                  colonne dès que la largeur d'une carte manquerait, sans dépendre d'un point de
                  rupture fixe qui déborderait à 390px pour un groupe à 3+ membres. */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {group.members.map((m) => (
                  <div key={m.id} className="min-w-0 rounded-control border border-line p-3">
                    <p className="truncate font-semibold text-ink" title={`${m.firstName} ${m.lastName}`}>{m.firstName} {m.lastName}</p>
                    {m.email && <p className="truncate text-sm text-ink-muted" title={m.email}>{m.email}</p>}
                    {m.phone && <p className="truncate text-sm text-ink-muted" title={m.phone}>{m.phone}</p>}
                    {m.userLink && (
                      <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">Compte : {m.userLink.name ?? m.userLink.email}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.departments.map((d) => (
                        <StatusChip key={d.id} tone={d.isPrimary ? "brand" : "neutral"}>
                          {d.name}
                        </StatusChip>
                      ))}
                    </div>
                    <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
                      {count(m.counts.plannings, "planning", "plannings")} · {count(m.counts.disciples + m.counts.disciplesMade, "discipolat", "discipolats")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {mergeGroup && (
        <MergeModal
          group={mergeGroup}
          onClose={() => setMergeGroup(null)}
          onMerged={() => {
            setMergeGroup(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
