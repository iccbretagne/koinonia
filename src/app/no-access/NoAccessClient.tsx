"use client";

import { useState, useEffect, useRef } from "react";

type Church = { id: string; name: string };

type MemberResult = {
  id: string;
  firstName: string;
  lastName: string;
  departments: {
    department: { name: string; ministry: { name: string } };
  }[];
};

type Ministry = {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
};

type RequestedRole =
  | "DEPARTMENT_HEAD"
  | "DEPUTY"
  | "MINISTER"
  | "DISCIPLE_MAKER"
  | "REPORTER"
  | null;

type Step = "identity" | "match" | "department" | "role" | "confirm" | "pending";

const ROLE_LABELS: Record<NonNullable<RequestedRole>, string> = {
  DEPARTMENT_HEAD: "Responsable de département",
  DEPUTY: "Adjoint de département",
  MINISTER: "Ministre",
  DISCIPLE_MAKER: "Faiseur de disciples",
  REPORTER: "Reporter (accès comptes rendus)",
};

const TRANSVERSE_ROLES: NonNullable<RequestedRole>[] = ["DISCIPLE_MAKER", "REPORTER"];

export default function NoAccessClient({
  churches,
  ministries,
}: {
  churches: Church[];
  ministries: Ministry[];
}) {
  const [step, setStep] = useState<Step>("identity");
  const [churchId, setChurchId] = useState(churches[0]?.id ?? "");

  // Étape 1 — identité
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // Étape 2 — correspondance
  const [results, setResults] = useState<MemberResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null);
  const [isNewStar, setIsNewStar] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Étape 3 — département
  const [selectedMinistryId, setSelectedMinistryId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");

  // Étape 4 — rôle
  const [requestedRole, setRequestedRole] = useState<RequestedRole>(null);

  // Étape 5 — notes
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-search quand prénom/nom changent (étape identity)
  useEffect(() => {
    const q = `${firstName} ${lastName}`.trim();
    if (q.length < 2) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/members/search?q=${encodeURIComponent(q)}&churchId=${churchId}`
        );
        const json = await res.json();
        setResults(Array.isArray(json) ? json : []);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [firstName, lastName, churchId]);

  // Ré-initialise le ministère quand on change d'église
  useEffect(() => {
    setSelectedMinistryId("");
    setSelectedDeptId("");
  }, [churchId]);

  const selectedMinistry = ministries.find((m) => m.id === selectedMinistryId);

  function goToMatch() {
    if (!firstName.trim() || !lastName.trim()) return;
    setStep("match");
  }

  function selectExisting(member: MemberResult) {
    setSelectedMember(member);
    setIsNewStar(false);
    // Pré-remplir le département depuis la fiche existante
    setSelectedMinistryId("");
    setSelectedDeptId("");
    setStep("role");
  }

  function selectNewStar() {
    setSelectedMember(null);
    setIsNewStar(true);
    setStep("department");
  }

  function selectNoStar() {
    setSelectedMember(null);
    setIsNewStar(false);
    setStep("role");
  }

  function goToRole() { setStep("role"); }
  function goToConfirm() { setStep("confirm"); }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      let body: Record<string, unknown>;

      if (!selectedMember && !isNewStar) {
        // Rôle transverse sans STAR
        body = {
          type: "no_star",
          churchId,
          requestedRole,
          notes: notes.trim() || undefined,
        };
      } else if (selectedMember) {
        body = {
          type: "existing",
          memberId: selectedMember.id,
          churchId,
          departmentId: selectedDeptId || undefined,
          ministryId: selectedMinistryId || undefined,
          requestedRole,
          notes: notes.trim() || undefined,
        };
      } else {
        body = {
          type: "new",
          firstName,
          lastName,
          phone: phone.trim() || undefined,
          churchId,
          departmentId: selectedDeptId || undefined,
          ministryId: selectedMinistryId || undefined,
          requestedRole,
          notes: notes.trim() || undefined,
        };
      }

      const res = await fetch("/api/member-link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de la soumission");
      setStep("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  if (step === "pending") {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Demande envoyée</h2>
        <p className="text-gray-600 text-sm">
          Un administrateur va examiner votre demande. Vous recevrez une confirmation dès qu&apos;elle sera traitée.
        </p>
        <p className="text-gray-400 text-xs mt-4">
          Vous pouvez fermer cette page ou vous déconnecter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sélecteur d'église (si plusieurs) */}
      {churches.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Église</label>
          <select
            value={churchId}
            onChange={(e) => { setChurchId(e.target.value); setSelectedMember(null); setResults([]); }}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
          >
            {churches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Étape 1 : Identité ─────────────────────────────────────────────────── */}
      {step === "identity" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Renseignez votre prénom et nom pour que nous puissions vous identifier dans notre base.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
          </div>
          {searching && <p className="text-xs text-gray-400">Recherche en cours...</p>}
          <button
            onClick={goToMatch}
            disabled={!firstName.trim() || !lastName.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continuer →
          </button>
        </div>
      )}

      {/* ── Étape 2 : Correspondance ───────────────────────────────────────────── */}
      {step === "match" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 font-medium">
            Êtes-vous déjà enregistré dans notre base ?
          </p>

          {results.length > 0 ? (
            <>
              <p className="text-xs text-gray-500">
                Nous avons trouvé {results.length} fiche{results.length > 1 ? "s" : ""} correspondante{results.length > 1 ? "s" : ""}. Cliquez sur la vôtre :
              </p>
              <div className="space-y-2">
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectExisting(m)}
                    className="w-full text-left px-4 py-3 rounded-lg border-2 border-gray-200 hover:border-icc-violet hover:bg-icc-violet/5 transition-colors"
                  >
                    <p className="text-sm font-semibold text-gray-900">{m.firstName} {m.lastName}</p>
                    {m.departments[0] && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {m.departments[0].department.ministry.name} / {m.departments[0].department.name}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400 mb-2">Aucune ne me correspond</p>
                <div className="flex gap-2">
                  <button
                    onClick={selectNewStar}
                    className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 border-2 border-gray-200 rounded-lg hover:border-icc-violet hover:bg-icc-violet/5 transition-colors"
                  >
                    Je suis un STAR non enregistré
                  </button>
                  <button
                    onClick={selectNoStar}
                    className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Je souhaite accéder à l&apos;application dans un autre rôle
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Aucune fiche trouvée pour <strong>{firstName} {lastName}</strong>.
              </p>
              <div className="space-y-2">
                <button
                  onClick={selectNewStar}
                  className="w-full px-4 py-3 text-sm font-medium text-left rounded-lg border-2 border-gray-200 hover:border-icc-violet hover:bg-icc-violet/5 transition-colors"
                >
                  <span className="font-semibold text-icc-violet">Je suis un STAR</span>
                  <p className="text-xs text-gray-500 mt-0.5">Je sers dans l&apos;église mais ma fiche n&apos;est pas encore créée</p>
                </button>
                <button
                  onClick={selectNoStar}
                  className="w-full px-4 py-3 text-sm font-medium text-left rounded-lg border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-700">Je souhaite accéder à l&apos;application dans un autre rôle</span>
                  <p className="text-xs text-gray-500 mt-0.5">Faiseur de disciples, Reporter...</p>
                </button>
              </div>
            </>
          )}

          <button onClick={() => setStep("identity")} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Modifier mon nom
          </button>
        </div>
      )}

      {/* ── Étape 3 : Département ──────────────────────────────────────────────── */}
      {step === "department" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 font-medium">Votre département principal</p>
          {isNewStar && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone (optionnel)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ministère</label>
            <select
              value={selectedMinistryId}
              onChange={(e) => { setSelectedMinistryId(e.target.value); setSelectedDeptId(""); }}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            >
              <option value="">-- Choisir un ministère --</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {selectedMinistry && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Département</label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              >
                <option value="">-- Choisir un département --</option>
                {selectedMinistry.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep("match")} className="px-4 py-2 text-sm text-gray-600 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              ← Retour
            </button>
            <button
              onClick={goToRole}
              disabled={!selectedDeptId}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continuer →
            </button>
          </div>
        </div>
      )}

      {/* ── Étape 4 : Rôle ────────────────────────────────────────────────────── */}
      {step === "role" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 font-medium">Quel rôle souhaitez-vous ?</p>

          {/* Rôle STAR standard */}
          {(selectedMember || isNewStar) && (
            <button
              onClick={() => { setRequestedRole(null); goToConfirm(); }}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                requestedRole === null
                  ? "border-icc-violet bg-icc-violet/5"
                  : "border-gray-200 hover:border-icc-violet hover:bg-icc-violet/5"
              }`}
            >
              <span className="text-sm font-semibold text-gray-900">Membre du département</span>
              <p className="text-xs text-gray-500 mt-0.5">Accès au planning de mon département</p>
            </button>
          )}

          {/* Rôles avec département */}
          {(selectedMember || isNewStar) && (
            <>
              {(["DEPARTMENT_HEAD", "DEPUTY", "MINISTER"] as NonNullable<RequestedRole>[]).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    setRequestedRole(role);
                    if (role === "MINISTER" && !selectedMinistryId) {
                      setStep("department");
                    } else {
                      goToConfirm();
                    }
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    requestedRole === role
                      ? "border-icc-violet bg-icc-violet/5"
                      : "border-gray-200 hover:border-icc-violet hover:bg-icc-violet/5"
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-900">{ROLE_LABELS[role]}</span>
                </button>
              ))}
              <div className="border-t border-gray-100 pt-1" />
            </>
          )}

          {/* Rôles transverses — uniquement pour les non-STAR */}
          {!selectedMember && !isNewStar && TRANSVERSE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setRequestedRole(role); goToConfirm(); }}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                requestedRole === role
                  ? "border-icc-violet bg-icc-violet/5"
                  : "border-gray-200 hover:border-icc-violet hover:bg-icc-violet/5"
              }`}
            >
              <span className="text-sm font-semibold text-gray-900">{ROLE_LABELS[role]}</span>
              {role === "DISCIPLE_MAKER" && (
                <p className="text-xs text-gray-500 mt-0.5">Suivi des disciples, accès discipolat</p>
              )}
              {role === "REPORTER" && (
                <p className="text-xs text-gray-500 mt-0.5">Consultation des comptes rendus et statistiques</p>
              )}
            </button>
          ))}

          <button
            onClick={() => setStep(isNewStar ? "department" : "match")}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Retour
          </button>
        </div>
      )}

      {/* ── Étape 5 : Confirmation ─────────────────────────────────────────────── */}
      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 font-medium">Récapitulatif de votre demande</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Nom</span>
              <span className="font-medium text-gray-900">
                {selectedMember
                  ? `${selectedMember.firstName} ${selectedMember.lastName}`
                  : `${firstName} ${lastName}`}
              </span>
            </div>
            {selectedMember && (
              <div className="flex justify-between">
                <span className="text-gray-500">Fiche STAR</span>
                <span className="text-green-600 font-medium">Existante</span>
              </div>
            )}
            {isNewStar && selectedDeptId && selectedMinistry && (
              <div className="flex justify-between">
                <span className="text-gray-500">Département</span>
                <span className="font-medium text-gray-900">
                  {selectedMinistry.name} / {selectedMinistry.departments.find((d) => d.id === selectedDeptId)?.name}
                </span>
              </div>
            )}
            {requestedRole && (
              <div className="flex justify-between">
                <span className="text-gray-500">Rôle demandé</span>
                <span className="font-medium text-icc-violet">{ROLE_LABELS[requestedRole]}</span>
              </div>
            )}
            {!requestedRole && (selectedMember || isNewStar) && (
              <div className="flex justify-between">
                <span className="text-gray-500">Rôle demandé</span>
                <span className="font-medium text-gray-900">Membre du département</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Remarques pour l&apos;administrateur <span className="text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex : je sers aussi dans le département Son, je remplace Marie Dupont..."
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
            />
          </div>

          {error && <p className="text-sm text-icc-rouge">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("role")}
              className="px-4 py-2 text-sm text-gray-600 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Retour
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Envoi..." : "Envoyer la demande"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
