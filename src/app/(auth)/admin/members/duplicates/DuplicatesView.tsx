"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

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
  groups: Group[];
  churchId: string;
}

const REASON_LABEL: Record<Group["reason"], string> = {
  same_name: "Même nom",
  same_email: "Même email",
  both: "Même nom + email",
};

const REASON_COLOR: Record<Group["reason"], string> = {
  same_name: "bg-yellow-100 text-yellow-800",
  same_email: "bg-orange-100 text-orange-800",
  both: "bg-red-100 text-red-800",
};

function MemberCard({ member, isSource, label }: { member: MemberSummary; isSource: boolean; label: string }) {
  return (
    <div className={`border-2 rounded-lg p-4 ${isSource ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isSource ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"}`}>
          {label}
        </span>
        {member.userLink && (
          <span className="text-xs bg-icc-violet text-white px-2 py-0.5 rounded">Compte lié</span>
        )}
      </div>
      <p className="font-semibold text-gray-900">{member.firstName} {member.lastName}</p>
      {member.email && <p className="text-sm text-gray-600">{member.email}</p>}
      {member.phone && <p className="text-sm text-gray-600">{member.phone}</p>}
      {member.userLink && <p className="text-xs text-gray-500 mt-1">Compte : {member.userLink.name ?? member.userLink.email}</p>}
      <div className="mt-2 space-y-0.5">
        {member.departments.map((d) => (
          <span key={d.id} className={`inline-block text-xs px-2 py-0.5 rounded mr-1 ${d.isPrimary ? "bg-icc-violet text-white" : "bg-gray-200 text-gray-700"}`}>
            {d.ministryName} › {d.name}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        <span>{member.counts.plannings} planning(s)</span>
        <span>{member.counts.disciples} discipolat(s)</span>
        <span>{member.counts.disciplesMade} disciple(s)</span>
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
  label: string;
  sourceValue: T;
  targetValue: T;
  choice: FieldChoice<T>;
  onChange: (c: FieldChoice<T>) => void;
}) {
  const same = sourceValue === targetValue;
  if (same) {
    return (
      <div className="text-sm text-gray-700">
        <span className="font-medium text-gray-500">{label} :</span> {sourceValue ?? <em className="text-gray-400">vide</em>}
      </div>
    );
  }
  return (
    <div className="border rounded p-2 bg-white">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer mb-1">
        <input type="radio" checked={choice.from === "source"} onChange={() => onChange({ value: sourceValue, from: "source" })} />
        <span className="text-sm text-red-700">{sourceValue ?? <em className="text-gray-400">vide</em>} <span className="text-xs text-gray-400">(à supprimer)</span></span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="radio" checked={choice.from === "target"} onChange={() => onChange({ value: targetValue, from: "target" })} />
        <span className="text-sm text-green-700">{targetValue ?? <em className="text-gray-400">vide</em>} <span className="text-xs text-gray-400">(à conserver)</span></span>
      </label>
    </div>
  );
}

function MergeModal({
  group,
  onClose,
  onMerged,
}: {
  group: Group;
  onClose: () => void;
  onMerged: () => void;
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
        <div className="grid grid-cols-2 gap-3">
          <MemberCard member={source} isSource label="Sera supprimé" />
          <MemberCard member={target} isSource={false} label="Sera conservé" />
        </div>

        <button
          type="button"
          onClick={swap}
          className="text-xs text-icc-violet hover:underline"
        >
          ⇄ Inverser source et cible
        </button>

        {/* Résolution des champs */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Champs à conserver</p>
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
          <div className="border rounded p-3 bg-yellow-50">
            <p className="text-sm font-semibold text-yellow-800 mb-2">Les deux ont un compte Google lié — lequel conserver ?</p>
            <label className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="radio"
                checked={keepUserId === source.userLink!.userId}
                onChange={() => setKeepUserId(source.userLink!.userId)}
              />
              <span className="text-sm text-red-700">{source.userLink!.name ?? source.userLink!.email} <span className="text-xs text-gray-400">(source)</span></span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={keepUserId === target.userLink!.userId}
                onChange={() => setKeepUserId(target.userLink!.userId)}
              />
              <span className="text-sm text-green-700">{target.userLink!.name ?? target.userLink!.email} <span className="text-xs text-gray-400">(cible)</span></span>
            </label>
          </div>
        )}

        {/* Départements fusionnés */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Départements après fusion (union)</p>
          {[
            ...new Map(
              [...source.departments, ...target.departments].map((d) => [d.id, d])
            ).values(),
          ].map((d) => (
            <span key={d.id} className="inline-block text-xs px-2 py-0.5 rounded mr-1 mb-1 bg-gray-200 text-gray-700">
              {d.ministryName} › {d.name}
            </span>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
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

export default function DuplicatesView({ groups, churchId }: Props) {
  const router = useRouter();
  const [mergeGroup, setMergeGroup] = useState<Group | null>(null);
  const [assigningStars, setAssigningStars] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assigned: number; total: number } | null>(null);

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
    <div className="space-y-6">
      {/* Bulk STAR assign */}
      <div className="border-2 rounded-lg p-4 bg-icc-violet/5 border-icc-violet/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-gray-800">Assigner le rôle STAR aux membres liés sans accès</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Attribue automatiquement le rôle STAR (accès planning en lecture) à tous les membres avec un compte Google lié mais aucun rôle.
            </p>
          </div>
          <Button onClick={assignStarRoles} disabled={assigningStars}>
            {assigningStars ? "En cours…" : "Assigner les rôles STAR"}
          </Button>
        </div>
        {assignResult && (
          <p className="text-sm text-green-700 mt-2">
            {assignResult.assigned} rôle(s) STAR assigné(s) sur {assignResult.total} compte(s) lié(s).
          </p>
        )}
      </div>

      {/* Liste doublons */}
      {groups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Aucun doublon détecté</p>
          <p className="text-sm mt-1">Tous les membres ont des noms et emails uniques.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{groups.length} groupe(s) de doublons potentiels détecté(s)</p>
          {groups.map((group, i) => (
            <div key={i} className="border-2 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded ${REASON_COLOR[group.reason]}`}>
                  {REASON_LABEL[group.reason]}
                </span>
                <Button
                  onClick={() => setMergeGroup(group)}
                  className="text-sm"
                >
                  Fusionner
                </Button>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${group.members.length}, minmax(0, 1fr))` }}>
                {group.members.map((m) => (
                  <div key={m.id} className="border rounded p-3 bg-gray-50">
                    <p className="font-semibold text-gray-900">{m.firstName} {m.lastName}</p>
                    {m.email && <p className="text-sm text-gray-600">{m.email}</p>}
                    {m.phone && <p className="text-sm text-gray-600">{m.phone}</p>}
                    {m.userLink && (
                      <p className="text-xs text-icc-violet mt-1">Compte : {m.userLink.name ?? m.userLink.email}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.departments.map((d) => (
                        <span key={d.id} className={`text-xs px-1.5 py-0.5 rounded ${d.isPrimary ? "bg-icc-violet text-white" : "bg-gray-200 text-gray-600"}`}>
                          {d.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {m.counts.plannings} planning · {m.counts.disciples + m.counts.disciplesMade} discipolat
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
