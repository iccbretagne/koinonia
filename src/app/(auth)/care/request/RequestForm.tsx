"use client";

import { SubmitEvent, useId, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Alert, Button, Input, Textarea, buttonClasses, fieldLabelClasses } from "@/components/ui";
import { choiceChipClasses } from "@/components/ui/RadioGroup";

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

const cardClasses = "flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6";
const sectionTitleClasses = "font-display text-[17px] font-semibold text-ink";

function FieldError({ message }: { readonly message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[13px] text-danger">{message}</p>;
}

function RadioGroup({ name, options, value, onChange }: {
  readonly name: string; readonly options: string[]; readonly value: string; readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className={choiceChipClasses(value === opt)}>
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
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheck aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </span>
        <h2 className="font-display text-[17px] font-semibold text-ink">Demande envoyée</h2>
        <p className="text-sm text-ink-muted">
          Votre demande a bien été reçue. Elle sera étudiée prochainement puis confiée à un référent qui vous accompagnera.
        </p>
        {redirectTo && (
          <Link href={redirectTo} className={buttonClasses("secondary")}>
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Retour à « {redirectLabel} »
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">

      {/* Coordonnées */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Vos coordonnées</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input id={`${id}-f1`} label="Nom" type="text" required autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          <Input id={`${id}-f2`} label="Prénom" type="text" required autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Sexe</legend>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender} onChange={(v) => set("gender", v)} />
          <FieldError message={fieldErrors.gender} />
        </fieldset>

        <Input id={`${id}-f3`} label="Téléphone" type="tel" required autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <Input id={`${id}-f4`} label="Adresse mail (facultatif)" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </section>

      {/* Profil */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Votre profil</h2>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Tranche d&apos;âge</legend>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange} onChange={(v) => set("ageRange", v)} />
          <FieldError message={fieldErrors.ageRange} />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Depuis quand êtes-vous à {churchName} ?</legend>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration} onChange={(v) => set("membershipDuration", v)} />
          <FieldError message={fieldErrors.membershipDuration} />
        </fieldset>

        {isStarKnown ? (
          <Alert tone="info">
            Vous êtes STAR{defaultDepartment ? ` — département : ${defaultDepartment}` : ""}.
          </Alert>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className={`${fieldLabelClasses} mb-2`}>Êtes-vous STAR ?</legend>
              <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar} onChange={(v) => set("isStar", v)} />
              <FieldError message={fieldErrors.isStar} />
            </fieldset>

            {form.isStar === "Oui" && (
              <Input id={`${id}-f5`} label="Dans quel département servez-vous ? (facultatif)" type="text" value={form.department} onChange={(e) => set("department", e.target.value)}
                placeholder="Ex : Choristes, Accueil, Son…" />
            )}
          </>
        )}
      </section>

      {/* Demande */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Votre demande</h2>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>
            Pour quel motif sollicitez-vous un entretien ?{" "}
            <span className="font-normal text-ink-muted">(plusieurs choix possibles)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((motif) => (
              <label key={motif} className={choiceChipClasses(form.motifs.includes(motif))}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          <FieldError message={fieldErrors.motifs} />
        </fieldset>

        <Textarea
          id={`${id}-f6`}
          label="Votre message (facultatif)"
          value={form.details}
          onChange={(e) => set("details", e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Décrivez votre situation ou ce que vous souhaitez aborder…"
          hint="Ce message n'est lu que par l'équipe qui confie votre demande et par le référent qui vous accompagnera."
        />
      </section>

      {globalError && <Alert tone="danger">{globalError}</Alert>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>

    </form>
  );
}
