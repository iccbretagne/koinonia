"use client";

import { SubmitEvent, useId, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
interface Props {
  readonly churchId: string;
  readonly churchName: string;
  readonly defaultFirstName: string;
  readonly defaultLastName: string;
  readonly defaultEmail: string;
  readonly defaultIsStar?: string;
  readonly defaultDepartment?: string;
  /** Écran de retour proposé après soumission. */
  readonly redirectTo?: string;
  readonly redirectLabel?: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"];
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"];
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"];

const inputCls = "w-full border border-control-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-brand";

function RadioGroup({ name, options, value, onChange }: {
  readonly name: string; readonly options: string[]; readonly value: string; readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
          value === opt ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
        }`}>
          <input type="radio" name={name} value={opt} checked={value === opt}
            onChange={() => onChange(opt)} className="sr-only" />
          {opt}
        </label>
      ))}
    </div>
  );
}

export default function RequestForm({ churchId, churchName, defaultFirstName, defaultLastName, defaultEmail, defaultIsStar = "", defaultDepartment = "", redirectTo, redirectLabel = "mes demandes" }: Props) {
  const id = useId();
  // Statut STAR déjà connu du compte (lien membre validé) : pas besoin de le redemander.
  const isStarKnown = defaultIsStar === "Oui";
  const [form, setForm] = useState({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    email: defaultEmail,
    phone: "",
    gender: "",
    ageRange: "",
    membershipDuration: "",
    isStar: defaultIsStar,
    department: defaultDepartment,
    motifs: [] as string[],
    details: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleMotif(motif: string) {
    setForm((f) => ({
      ...f,
      motifs: f.motifs.includes(motif) ? f.motifs.filter((m) => m !== motif) : [...f.motifs, motif],
    }));
    if (fieldErrors["motifs"]) setFieldErrors((e) => ({ ...e, motifs: undefined }));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (!form.gender) errs.gender = "Veuillez sélectionner votre sexe";
    if (!form.ageRange) errs.ageRange = "Veuillez sélectionner votre tranche d'âge";
    if (!form.membershipDuration) errs.membershipDuration = "Veuillez sélectionner votre ancienneté";
    if (!isStarKnown && !form.isStar) errs.isStar = "Veuillez répondre à cette question";
    if (form.motifs.length === 0) errs.motifs = "Veuillez sélectionner au moins un motif";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setGlobalError("Veuillez corriger les erreurs ci-dessous.");
      return;
    }

    setSubmitting(true);
    setGlobalError(null);

    const subject = form.motifs.join(", ");
    const departmentSuffix = form.isStar === "Oui" && form.department ? ` — Département : ${form.department}` : "";
    const message = [
      form.details.trim() || null,
      [
        `Sexe : ${form.gender}`,
        `Tranche d'âge : ${form.ageRange}`,
        `À l'église depuis : ${form.membershipDuration}`,
        `STAR : ${form.isStar}${departmentSuffix}`,
      ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    try {
      const res = await fetch("/api/care/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          subject,
          message,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setGlobalError(d.error || "Une erreur est survenue. Veuillez réessayer.");
        return;
      }
      setSubmitted(true);
    } catch {
      setGlobalError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-surface rounded-xl border border-success/30 p-6 sm:p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-success-soft flex items-center justify-center mx-auto text-2xl">✓</div>
        <h2 className="text-lg font-semibold text-ink">Demande envoyée !</h2>
        <p className="text-sm text-ink-muted">
          Votre demande a bien été reçue. Elle sera étudiée prochainement puis confiée à un référent qui vous accompagnera.
        </p>
        {redirectTo && (
          <Link href={redirectTo} className={buttonClasses("secondary")}>
            ← {redirectLabel}
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">

      {/* Coordonnées */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Vos coordonnées</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-f1`} className="block text-sm font-medium text-ink-muted mb-1">Nom *</label>
            <input id={`${id}-f1`} type="text" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`${id}-f2`} className="block text-sm font-medium text-ink-muted mb-1">Prénom *</label>
            <input id={`${id}-f2`} type="text" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
          </div>
        </div>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Sexe *</legend>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender} onChange={(v) => set("gender", v)} />
          {fieldErrors.gender && <p className="text-xs text-danger mt-1">{fieldErrors.gender}</p>}
        </fieldset>

        <div>
          <label htmlFor={`${id}-f3`} className="block text-sm font-medium text-ink-muted mb-1">Téléphone *</label>
          <input id={`${id}-f3`} type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label htmlFor={`${id}-f4`} className="block text-sm font-medium text-ink-muted mb-1">Adresse mail</label>
          <input id={`${id}-f4`} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Profil */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Votre profil</h2>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Tranche d&apos;âge *</legend>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange} onChange={(v) => set("ageRange", v)} />
          {fieldErrors.ageRange && <p className="text-xs text-danger mt-1">{fieldErrors.ageRange}</p>}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Depuis quand êtes-vous à {churchName} ? *
          </legend>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration} onChange={(v) => set("membershipDuration", v)} />
          {fieldErrors.membershipDuration && <p className="text-xs text-danger mt-1">{fieldErrors.membershipDuration}</p>}
        </fieldset>

        {isStarKnown ? (
          <div className="bg-surface-sunken rounded-lg px-3 py-2.5 text-sm text-ink-muted">
            Vous êtes STAR{defaultDepartment ? ` — département : ${defaultDepartment}` : ""}.
          </div>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className="block text-sm font-medium text-ink-muted mb-2">Êtes-vous STAR ? *</legend>
              <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar} onChange={(v) => set("isStar", v)} />
              {fieldErrors.isStar && <p className="text-xs text-danger mt-1">{fieldErrors.isStar}</p>}
            </fieldset>

            {form.isStar === "Oui" && (
              <div>
                <label htmlFor={`${id}-f5`} className="block text-sm font-medium text-ink-muted mb-1">Dans quel département servez-vous ?</label>
                <input id={`${id}-f5`} type="text" value={form.department} onChange={(e) => set("department", e.target.value)}
                  placeholder="Ex : Choristes, Accueil, Son…" className={inputCls} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Demande */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Votre demande</h2>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Pour quel motif sollicitez-vous un entretien ? *{" "}
            <span className="font-normal text-ink-subtle">(plusieurs choix possibles)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((motif) => (
              <label key={motif} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
                form.motifs.includes(motif) ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
              }`}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          {fieldErrors.motifs && <p className="text-xs text-danger mt-1">{fieldErrors.motifs}</p>}
        </fieldset>

        <div>
          <label htmlFor={`${id}-f6`} className="block text-sm font-medium text-ink-muted mb-1">
            Votre message <span className="font-normal text-ink-subtle">(facultatif)</span>
          </label>
          <textarea id={`${id}-f6`}
            value={form.details}
            onChange={(e) => set("details", e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Décrivez votre situation ou ce que vous souhaitez aborder…"
            className={`${inputCls} resize-none`}
          />
          <p className="text-xs text-ink-subtle mt-1">
            Ce message n&apos;est lu que par l&apos;équipe qui confie votre demande et par le référent qui vous accompagnera.
          </p>
        </div>
      </div>

      {globalError && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">{globalError}</p>
      )}

      <Button type="submit" disabled={submitting} className="w-full py-3">
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>

      <p className="text-xs text-ink-subtle text-center">* Champs obligatoires.</p>
    </form>
  );
}
