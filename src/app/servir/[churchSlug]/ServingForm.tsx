"use client";

import { useEffect, useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { Alert, Button, Input, Textarea, fieldLabelClasses } from "@/components/ui";
import Checkbox from "@/components/ui/Checkbox";
import { MARITAL_STATUSES, MARITAL_STATUS_LABEL, PCNC_TRAININGS, PHOTO_MAX_BYTES } from "@/modules/serving/schemas";

/**
 * Fiche de candidature au service (spec 073), reprise du formulaire proposé par Jenny
 * (`FicheForm`) et recâblée sur les composants du design system.
 */

type FieldErrors = Partial<Record<string, string>>;

const YES_NO = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const MARITAL_OPTIONS = MARITAL_STATUSES.map((value) => ({ value, label: MARITAL_STATUS_LABEL[value] }));

function pillClasses(selected: boolean) {
  return `flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${
    selected ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
  }`;
}

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Pills({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly { value: string; label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={`${fieldLabelClasses} mb-2`}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <label key={opt.value} className={pillClasses(value === opt.value)}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface Props {
  readonly churchSlug: string;
  readonly churchName: string;
  readonly retentionMonths: number;
  readonly turnstileSiteKey: string;
}

export default function ServingForm({ churchSlug, churchName, retentionMonths, turnstileSiteKey }: Props) {
  const uid = useId();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [maritalStatus, setMaritalStatus] = useState("");
  const [baptized, setBaptized] = useState("");
  const [previousChurch, setPreviousChurch] = useState("");
  const [hasServed, setHasServed] = useState("");
  const [available, setAvailable] = useState("");
  const [trainings, setTrainings] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  // Libère l'aperçu de la photo quand il change ou quand la page est quittée
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function clearError(field: string) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    clearError("photo");
    if (file && file.size > PHOTO_MAX_BYTES) {
      setErrors((errs) => ({ ...errs, photo: "Photo trop lourde (8 Mo maximum)." }));
      e.target.value = "";
      setPreview(null);
      return;
    }
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function toggleTraining(t: string) {
    setTrainings((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstileToken) {
      setGlobalError("Merci de compléter la vérification anti-robots en bas du formulaire.");
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setErrors({});
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("turnstileToken", turnstileToken);
      const res = await fetch(`/api/serving/public/${encodeURIComponent(churchSlug)}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (json.details?.length) {
        const errs: FieldErrors = {};
        for (const d of json.details as { field: string; message: string }[]) errs[d.field.split(".")[0]] = d.message;
        setErrors(errs);
        setGlobalError("Certaines réponses sont à corriger ci-dessous.");
      } else {
        setGlobalError(json.error ?? "Une erreur est survenue. Réessaie dans un instant.");
      }
      // Jeton à usage unique : un nouveau défi est nécessaire pour réessayer.
      setTurnstileReset((n) => n + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setGlobalError("Une erreur réseau est survenue. Réessaie dans un instant.");
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="bg-surface rounded-xl border border-success/30 p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto text-3xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-ink">Fiche envoyée !</h2>
        <p className="text-sm text-ink-muted">
          Ta fiche a bien été reçue. L&apos;équipe Vie des STAR de {churchName} prendra contact avec toi.
        </p>
      </div>
    );
  }

  const retention = retentionMonths % 12 === 0 ? `${retentionMonths / 12} an${retentionMonths > 12 ? "s" : ""}` : `${retentionMonths} mois`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {globalError && <Alert tone="danger">{globalError}</Alert>}

      <Card title="Qui es-tu ?">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-photo`} className={fieldLabelClasses}>
            Photo d&apos;identité <span className="text-danger">*</span>
          </label>
          <input
            id={`${uid}-photo`}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            required
            onChange={onPhotoChange}
            aria-describedby={`${uid}-photo-hint`}
            className="w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:text-on-brand"
          />
          <p id={`${uid}-photo-hint`} className={errors.photo ? "text-xs text-danger" : "text-xs text-ink-subtle"}>
            {errors.photo ?? "Visage bien visible, fond neutre. JPEG, PNG, WebP ou HEIC, 8 Mo au plus."}
          </p>
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) avant envoi
          <img src={preview} alt="Aperçu de la photo" className="h-40 w-32 rounded-lg border border-line object-cover" />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Prénom *" name="firstName" required maxLength={100} autoComplete="given-name" error={errors.firstName} onChange={() => clearError("firstName")} />
          <Input label="Nom *" name="lastName" required maxLength={100} autoComplete="family-name" error={errors.lastName} onChange={() => clearError("lastName")} />
        </div>
        <Input label="Date de naissance *" type="date" name="birthDate" required autoComplete="bday" error={errors.birthDate} onChange={() => clearError("birthDate")} />
        <Input label="Métier / profession" name="profession" maxLength={150} error={errors.profession} />
        <Pills legend="Statut familial" name="maritalStatus" options={MARITAL_OPTIONS} value={maritalStatus} onChange={setMaritalStatus} />
        <Input label="Nombre d'enfants" type="number" name="childrenCount" min={0} max={30} inputMode="numeric" error={errors.childrenCount} />
      </Card>

      <Card title="Adresse et contact">
        <Input label="Rue" name="street" maxLength={200} autoComplete="street-address" error={errors.street} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Ville" name="city" maxLength={100} autoComplete="address-level2" error={errors.city} />
          <Input label="Code postal" name="postalCode" maxLength={20} inputMode="numeric" autoComplete="postal-code" error={errors.postalCode} />
        </div>
        <Input label="Pays" name="country" maxLength={100} autoComplete="country-name" error={errors.country} />
        <Input label="Téléphone" type="tel" name="phone" maxLength={30} autoComplete="tel" placeholder="Ex : 06 12 34 56 78" error={errors.phone} />
        <Input label="Adresse e-mail" type="email" name="email" maxLength={200} autoComplete="email" placeholder="prenom@exemple.fr" error={errors.email} onChange={() => clearError("email")} />
      </Card>

      <Card title="Parcours spirituel">
        <Pills legend="Es-tu baptisé(e) ?" name="baptized" options={YES_NO} value={baptized} onChange={setBaptized} />
        {baptized === "oui" && (
          <>
            <Input label="Date de baptême" type="date" name="baptismDate" error={errors.baptismDate} />
            <Input label="Lieu de baptême" name="baptismPlace" maxLength={200} error={errors.baptismPlace} />
          </>
        )}
        <Pills legend="Avais-tu une église avant ?" name="previousChurch" options={YES_NO} value={previousChurch} onChange={setPreviousChurch} />
        {previousChurch === "oui" && (
          <>
            <Input label="Nom de l'église précédente" name="previousChurchName" maxLength={200} error={errors.previousChurchName} />
            <Input label="Ville et pays de l'église" name="previousChurchLocation" maxLength={200} error={errors.previousChurchLocation} />
          </>
        )}
        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>
            Formations PCNC suivies <span className="text-ink-subtle text-xs">(églises ICC)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {PCNC_TRAININGS.map((t) => {
              const checked = trainings.includes(t);
              return (
                <label key={t} className={pillClasses(checked)}>
                  <input type="checkbox" name="pcncTrainings" value={t} checked={checked} onChange={() => toggleTraining(t)} className="sr-only" />
                  {t}
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card title="Service">
        <Pills legend="As-tu déjà servi pour Dieu ?" name="hasServed" options={YES_NO} value={hasServed} onChange={setHasServed} />
        {hasServed === "oui" && (
          <>
            <Input label="Dans quel département ?" name="servedDepartment" maxLength={200} error={errors.servedDepartment} />
            <Input label="Service dans le ministère" hint="Ex : enseignement, louange" name="ministryService" maxLength={300} error={errors.ministryService} />
            <Input label="Service communautaire" hint="Ex : aide aux démunis, organisation d'événements" name="communityService" maxLength={300} error={errors.communityService} />
            <Input label="Autres rôles spécifiques" name="otherRoles" maxLength={300} error={errors.otherRoles} />
          </>
        )}
        <Pills legend="Es-tu disponible pour servir dans l'église actuelle ?" name="availableToServe" options={YES_NO} value={available} onChange={setAvailable} />
        {available === "oui" && (
          <Textarea label="Départements ou domaines d'intérêt pour le service" name="interests" maxLength={500} error={errors.interests} />
        )}
        <Textarea label="Observations" name="observations" maxLength={2000} error={errors.observations} />
      </Card>

      <Card title="Pour mieux te connaître">
        <Textarea label="Informations supplémentaires sur ton parcours spirituel" name="journeyDetails" maxLength={2000} error={errors.journeyDetails} />
        <Textarea label="Objectifs ou aspirations spirituelles" name="spiritualGoals" maxLength={2000} error={errors.spiritualGoals} />
        <Textarea label="Détails spécifiques" name="specificDetails" maxLength={2000} error={errors.specificDetails} />
      </Card>

      <Card title="Qui verra ta fiche ?">
        <p className="text-sm text-ink-muted">
          Ta fiche est lue d&apos;abord par l&apos;équipe Vie des STAR (PVS) de {churchName} et par
          l&apos;administration de l&apos;église. Si tu es orienté(e) vers un ou plusieurs départements,
          leurs responsables et leur Ministre pourront aussi la consulter. Si ta candidature n&apos;est
          pas retenue ou n&apos;est pas traitée, elle est effacée, photo comprise, au bout de {retention}.
        </p>
        <label className="flex items-start gap-3 min-h-[44px] cursor-pointer text-sm text-ink">
          <Checkbox
            name="consent"
            value="true"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clearError("consent");
            }}
            required
            className="mt-0.5"
          />
          <span>J&apos;accepte que ces informations soient utilisées pour étudier ma candidature au service. *</span>
        </label>
        {errors.consent && <p className="text-xs text-danger">{errors.consent}</p>}
      </Card>

      {/* Champ piège anti-robot : invisible pour les humains */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px]" />

      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="text-xs text-ink-subtle mt-1">Vérification anti-robots requise.</p>}
      </div>

      <Button type="submit" className="w-full py-3" disabled={submitting || !turnstileToken || !consent}>
        {submitting ? "Envoi en cours…" : "Envoyer ma fiche"}
      </Button>

      <p className="text-xs text-ink-subtle text-center">* Champs obligatoires.</p>
    </form>
  );
}
