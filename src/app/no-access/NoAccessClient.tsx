"use client";

import { useState, useEffect, useRef, useId } from "react";
import { ROLE_LABELS as ROLE_LABELS_BASE } from "@/lib/roles";

type Church = { id: string; name: string };

type MemberResult = {
  id: string;
  firstName: string;
  lastName: string;
  matchStrength?: "strong" | "possible";
  departments: {
    department: { name: string; ministry: { name: string } };
  }[];
};

type Ministry = {
  id: string;
  name: string;
  churchId: string;
  departments: { id: string; name: string }[];
};

type RequestedRole =
  | "DEPARTMENT_HEAD"
  | "DEPUTY"
  | "MINISTER"
  | "DISCIPLE_MAKER"
  | "REPORTER"
  | null;

type Candidate = {
  memberId: string;
  firstName: string;
  lastName: string;
  churchId: string;
  churchName: string;
  department: string;
};

type Step = "reconcile" | "identity" | "match" | "department" | "role" | "confirm" | "pending";

// DEPUTY n'est pas un rôle d'église (Role) — c'est un attribut (isDeputy) d'un DEPARTMENT_HEAD —
// d'où ce libellé propre, les autres venant de la source unique `@/lib/roles` (spec 054).
const ROLE_LABELS: Record<NonNullable<RequestedRole>, string> = {
  DEPARTMENT_HEAD: ROLE_LABELS_BASE.DEPARTMENT_HEAD,
  DEPUTY: "Adjoint de département",
  MINISTER: ROLE_LABELS_BASE.MINISTER,
  DISCIPLE_MAKER: ROLE_LABELS_BASE.DISCIPLE_MAKER,
  REPORTER: ROLE_LABELS_BASE.REPORTER,
};

const TRANSVERSE_ROLES: NonNullable<RequestedRole>[] = ["DISCIPLE_MAKER", "REPORTER"];

export default function NoAccessClient({
  churches,
  ministries,
}: {
  readonly churches: Church[];
  readonly ministries: Ministry[];
}) {
  const id = useId();
  const [step, setStep] = useState<Step>("identity");
  const [churchId, setChurchId] = useState(churches[0]?.id ?? "");

  // Étape 0 — réconciliation par email (P2)
  const [bootLoading, setBootLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Étape 1 — identité
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // Étape 2 — correspondance
  const [results, setResults] = useState<MemberResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null);
  const [isNewStar, setIsNewStar] = useState(false);
  // Cran de vérification anti-doublon avant « aucune ne me correspond »
  const [noMatchStage, setNoMatchStage] = useState<"hidden" | "confirming" | "options">("hidden");
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

  // Réconciliation par email au chargement de l'assistant (P2)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/onboarding/candidates");
        const json = await res.json();
        const found: Candidate[] = res.ok && Array.isArray(json?.candidates) ? json.candidates : [];
        if (cancelled) return;
        setCandidates(found);
        if (found.length > 0) setStep("reconcile");
      } catch {
        // En cas d'échec, on retombe sur le parcours par nom
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmCandidate(candidate: Candidate) {
    setLinkError(null);
    setLinking(true);
    try {
      const res = await fetch("/api/member-user-links/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: candidate.memberId, churchId: candidate.churchId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de la liaison");
      // Rechargement complet VOLONTAIRE : la session serveur (strategie DB) doit relire les
      // roles fraichement accordes. `router.push()` conserverait le cache client et l'utilisateur
      // arriverait sur un dashboard calcule avec ses anciens droits.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Une erreur est survenue");
      setLinking(false);
    }
  }

  function skipReconcile() {
    setLinkError(null);
    setStep("identity");
  }

  // Auto-search quand prénom/nom changent (étape identity)
  useEffect(() => {
    const q = `${firstName} ${lastName}`.trim();
    // Toute nouvelle recherche réinitialise le cran de vérification anti-doublon
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de l'état local au changement de dépendance
    setNoMatchStage("hidden");
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de l'état local au changement de dépendance
    setSelectedMinistryId("");
    setSelectedDeptId("");
  }, [churchId]);

  const churchMinistries = ministries.filter((m) => m.churchId === churchId);
  const selectedMinistry = churchMinistries.find((m) => m.id === selectedMinistryId);

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

  if (bootLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  // ── Étape 0 : Réconciliation par email ─────────────────────────────────────
  if (step === "reconcile") {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">Cette fiche vous correspond-elle ?</p>
          <p className="mt-1 text-xs text-ink-muted">
            Une fiche enregistrée avec votre adresse email a été trouvée. Confirmez pour lier votre
            compte directement.
          </p>
        </div>

        <div className="space-y-2">
          {candidates.map((c) => (
            <div
              key={`${c.memberId}-${c.churchId}`}
              className="rounded-lg border border-line px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">
                {c.firstName} {c.lastName}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {c.churchName} · {c.department}
              </p>
              <button
                onClick={() => confirmCandidate(c)}
                disabled={linking}
                className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linking ? "Liaison en cours..." : "Confirmer, c'est moi"}
              </button>
            </div>
          ))}
        </div>

        {linkError && <p className="text-sm text-danger">{linkError}</p>}

        <button
          onClick={skipReconcile}
          disabled={linking}
          className="text-sm text-ink-subtle transition-colors hover:text-ink-muted disabled:opacity-50"
        >
          Aucune de ces fiches ne me correspond →
        </button>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">Demande envoyée</h2>
        <p className="text-ink-muted text-sm">
          Un administrateur va examiner votre demande. Vous recevrez une confirmation dès qu&apos;elle sera traitée.
        </p>
        <p className="text-ink-subtle text-xs mt-4">
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
          <label htmlFor={`${id}-f1`} className="block text-xs font-medium text-ink-muted mb-1">Église</label>
          <select id={`${id}-f1`}
            value={churchId}
            onChange={(e) => { setChurchId(e.target.value); setSelectedMember(null); setResults([]); }}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
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
          <p className="text-sm text-ink-muted">
            Renseignez votre prénom et nom pour que nous puissions vous identifier dans notre base.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-f2`} className="block text-xs font-medium text-ink-muted mb-1">Prénom</label>
              <input id={`${id}-f2`}
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor={`${id}-f3`} className="block text-xs font-medium text-ink-muted mb-1">Nom</label>
              <input id={`${id}-f3`}
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
              />
            </div>
          </div>
          {searching && <p className="text-xs text-ink-subtle">Recherche en cours...</p>}
          <button
            onClick={goToMatch}
            disabled={!firstName.trim() || !lastName.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium text-on-brand bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continuer →
          </button>
        </div>
      )}

      {/* ── Étape 2 : Correspondance ───────────────────────────────────────────── */}
      {step === "match" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted font-medium">
            Êtes-vous déjà enregistré dans notre base ?
          </p>

          {results.length > 0 ? (
            <>
              <p className="text-xs text-ink-muted">
                Nous avons trouvé {results.length} fiche{results.length > 1 ? "s" : ""} à votre nom. Laquelle est la vôtre ?
              </p>
              <div className="space-y-2">
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectExisting(m)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-line hover:border-brand hover:bg-brand-soft transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{m.firstName} {m.lastName}</p>
                      {m.matchStrength === "strong" ? (
                        <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                          Forte correspondance
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                          Correspondance possible
                        </span>
                      )}
                    </div>
                    {m.departments[0] && (
                      <p className="text-xs text-ink-muted mt-0.5">
                        {m.departments[0].department.ministry.name} / {m.departments[0].department.name}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              {noMatchStage === "hidden" && (
                <button
                  onClick={() => setNoMatchStage("confirming")}
                  className="text-xs text-ink-subtle underline decoration-dotted underline-offset-2 hover:text-ink-muted transition-colors"
                >
                  Aucune de ces fiches n&apos;est la mienne
                </button>
              )}

              {noMatchStage === "confirming" && (
                <div className="rounded-lg border border-accent bg-accent-soft p-4 space-y-3">
                  <p className="text-xs text-ink-muted">
                    <span aria-hidden="true">⚠ </span>
                    Avez-vous bien vérifié les {results.length} fiche{results.length > 1 ? "s" : ""} ci-dessus ? Si l&apos;une d&apos;elles est la vôtre, en créer une nouvelle créerait un doublon.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNoMatchStage("hidden")}
                      className="flex-1 px-3 py-2 text-xs font-medium text-ink-muted border border-line rounded-lg hover:bg-surface-sunken transition-colors"
                    >
                      Revoir les fiches
                    </button>
                    <button
                      onClick={() => setNoMatchStage("options")}
                      className="flex-1 px-3 py-2 text-xs font-medium text-on-brand bg-brand rounded-lg hover:bg-brand-hover transition-colors"
                    >
                      Oui, aucune n&apos;est la mienne
                    </button>
                  </div>
                </div>
              )}

              {noMatchStage === "options" && (
                <div className="border-t border-line pt-3 flex gap-2">
                  <button
                    onClick={selectNewStar}
                    className="flex-1 px-3 py-2 text-xs font-medium text-ink-muted border border-line rounded-lg hover:border-brand hover:bg-brand-soft transition-colors"
                  >
                    Je suis un STAR non enregistré
                  </button>
                  <button
                    onClick={selectNoStar}
                    className="flex-1 px-3 py-2 text-xs font-medium text-ink-muted border border-line rounded-lg hover:border-control-line hover:bg-surface-sunken transition-colors"
                  >
                    Je souhaite accéder à l&apos;application dans un autre rôle
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                Aucune fiche trouvée pour <strong>{firstName} {lastName}</strong>.
              </p>
              <div className="space-y-2">
                <button
                  onClick={selectNewStar}
                  className="w-full px-4 py-3 text-sm font-medium text-left rounded-lg border border-line hover:border-brand hover:bg-brand-soft transition-colors"
                >
                  <span className="font-semibold text-brand-text">Je suis un STAR</span>
                  <p className="text-xs text-ink-muted mt-0.5">Je sers dans l&apos;église mais ma fiche n&apos;est pas encore créée</p>
                </button>
                <button
                  onClick={selectNoStar}
                  className="w-full px-4 py-3 text-sm font-medium text-left rounded-lg border border-line hover:border-control-line hover:bg-surface-sunken transition-colors"
                >
                  <span className="font-semibold text-ink-muted">Je souhaite accéder à l&apos;application dans un autre rôle</span>
                  <p className="text-xs text-ink-muted mt-0.5">Faiseur de disciples, Reporter...</p>
                </button>
              </div>
            </>
          )}

          <button onClick={() => { setNoMatchStage("hidden"); setStep("identity"); }} className="text-sm text-ink-subtle hover:text-ink-muted transition-colors">
            ← Modifier mon nom
          </button>
        </div>
      )}

      {/* ── Étape 3 : Département ──────────────────────────────────────────────── */}
      {step === "department" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted font-medium">Votre département principal</p>
          {isNewStar && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-f4`} className="block text-xs font-medium text-ink-muted mb-1">Prénom</label>
                <input id={`${id}-f4`}
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor={`${id}-f5`} className="block text-xs font-medium text-ink-muted mb-1">Nom</label>
                <input id={`${id}-f5`}
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor={`${id}-f6`} className="block text-xs font-medium text-ink-muted mb-1">Téléphone (optionnel)</label>
                <input id={`${id}-f6`}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`${id}-f7`} className="block text-xs font-medium text-ink-muted mb-1">Ministère</label>
            <select id={`${id}-f7`}
              value={selectedMinistryId}
              onChange={(e) => { setSelectedMinistryId(e.target.value); setSelectedDeptId(""); }}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
            >
              <option value="">-- Choisir un ministère --</option>
              {churchMinistries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {selectedMinistry && (
            <div>
              <label htmlFor={`${id}-f8`} className="block text-xs font-medium text-ink-muted mb-1">Département</label>
              <select id={`${id}-f8`}
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
              >
                <option value="">-- Choisir un département --</option>
                {selectedMinistry.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep("match")} className="px-4 py-2 text-sm text-ink-muted border border-line rounded-lg hover:bg-surface-sunken transition-colors">
              ← Retour
            </button>
            <button
              onClick={goToRole}
              disabled={!selectedDeptId}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-on-brand bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continuer →
            </button>
          </div>
        </div>
      )}

      {/* ── Étape 4 : Rôle ────────────────────────────────────────────────────── */}
      {step === "role" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted font-medium">Quel rôle souhaitez-vous ?</p>

          {/* Rôle STAR standard */}
          {(selectedMember || isNewStar) && (
            <button
              onClick={() => { setRequestedRole(null); goToConfirm(); }}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                requestedRole === null
                  ? "border-brand bg-brand-soft"
                  : "border-line hover:border-brand hover:bg-brand-soft"
              }`}
            >
              <span className="text-sm font-semibold text-ink">Membre du département</span>
              <p className="text-xs text-ink-muted mt-0.5">Accès au planning de mon département</p>
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
                      ? "border-brand bg-brand-soft"
                      : "border-line hover:border-brand hover:bg-brand-soft"
                  }`}
                >
                  <span className="text-sm font-semibold text-ink">{ROLE_LABELS[role]}</span>
                </button>
              ))}
              <div className="border-t border-line pt-1" />
            </>
          )}

          {/* Rôles transverses — uniquement pour les non-STAR */}
          {!selectedMember && !isNewStar && TRANSVERSE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setRequestedRole(role); goToConfirm(); }}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                requestedRole === role
                  ? "border-brand bg-brand-soft"
                  : "border-line hover:border-brand hover:bg-brand-soft"
              }`}
            >
              <span className="text-sm font-semibold text-ink">{ROLE_LABELS[role]}</span>
              {role === "DISCIPLE_MAKER" && (
                <p className="text-xs text-ink-muted mt-0.5">Suivi des disciples, accès discipolat</p>
              )}
              {role === "REPORTER" && (
                <p className="text-xs text-ink-muted mt-0.5">Consultation des comptes rendus et statistiques</p>
              )}
            </button>
          ))}

          <button
            onClick={() => setStep(isNewStar ? "department" : "match")}
            className="text-sm text-ink-subtle hover:text-ink-muted transition-colors"
          >
            ← Retour
          </button>
        </div>
      )}

      {/* ── Étape 5 : Confirmation ─────────────────────────────────────────────── */}
      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted font-medium">Récapitulatif de votre demande</p>

          <div className="bg-surface-sunken rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Nom</span>
              <span className="font-medium text-ink">
                {selectedMember
                  ? `${selectedMember.firstName} ${selectedMember.lastName}`
                  : `${firstName} ${lastName}`}
              </span>
            </div>
            {selectedMember && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Fiche STAR</span>
                <span className="text-success font-medium">Existante</span>
              </div>
            )}
            {isNewStar && selectedDeptId && selectedMinistry && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Département</span>
                <span className="font-medium text-ink">
                  {selectedMinistry.name} / {selectedMinistry.departments.find((d) => d.id === selectedDeptId)?.name}
                </span>
              </div>
            )}
            {requestedRole && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Rôle demandé</span>
                <span className="font-medium text-brand-text">{ROLE_LABELS[requestedRole]}</span>
              </div>
            )}
            {!requestedRole && (selectedMember || isNewStar) && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Rôle demandé</span>
                <span className="font-medium text-ink">Membre du département</span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-f9`} className="block text-xs font-medium text-ink-muted mb-1">
              Remarques pour l&apos;administrateur <span className="text-ink-subtle">(optionnel)</span>
            </label>
            <textarea id={`${id}-f9`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex : je sers aussi dans le département Son, je remplace Marie Dupont..."
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent resize-none"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("role")}
              className="px-4 py-2 text-sm text-ink-muted border border-line rounded-lg hover:bg-surface-sunken transition-colors"
            >
              ← Retour
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-on-brand bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Envoi..." : "Envoyer la demande"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
