"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type SubmitEvent, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, CircleCheck } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import InterviewManager from "@/components/serving/InterviewManager";
import { Alert, Button, Input, Textarea, buttonClasses, fieldLabelClasses } from "@/components/ui";
import Checkbox from "@/components/ui/Checkbox";
import { MARITAL_STATUSES, MARITAL_STATUS_LABEL, PCNC_TRAININGS, PHOTO_MAX_BYTES } from "@/modules/serving/schemas";

/**
 * Fiche de candidature au service (spec 077), reprise du formulaire proposé par Jenny
 * (`FicheForm`) et recâblée sur les composants du design system.
 */

type FieldErrors = Partial<Record<string, string>>;

const YES_NO = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const MARITAL_OPTIONS = MARITAL_STATUSES.map((value) => ({ value, label: MARITAL_STATUS_LABEL[value] }));

function pillClasses(selected: boolean) {
  return `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
    selected ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
  }`;
}

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
      <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
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
  const [manageToken, setManageToken] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [maritalStatus, setMaritalStatus] = useState("");
  const [baptized, setBaptized] = useState("");
  const [previousChurch, setPreviousChurch] = useState("");
  const [hasServed, setHasServed] = useState("");
  const [available, setAvailable] = useState("");
  const [trainings, setTrainings] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  // Aperçu de la photo dessiné sur un canvas (recadrage « cover »), libéré quand il change
  // ou quand la page est quittée. Aucune adresse dérivée du fichier n'entre dans le DOM.
  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (preview && canvas && ctx) {
      const scale = Math.max(canvas.width / preview.width, canvas.height / preview.height);
      const w = preview.width * scale;
      const h = preview.height * scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(preview, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    return () => preview?.close();
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
    setPreview(null);
    // HEIC n'est pas décodable par la plupart des navigateurs : pas d'aperçu, l'envoi reste possible.
    if (file && typeof createImageBitmap === "function") {
      createImageBitmap(file).then(setPreview, () => setPreview(null));
    }
  }

  function toggleTraining(t: string) {
    setTrainings((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
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
        setManageToken(typeof json.manageToken === "string" ? json.manageToken : null);
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
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheck aria-hidden="true" className="size-7" strokeWidth={1.75} />
        </span>
        <h2 className="font-display text-[17px] font-semibold text-ink">Fiche envoyée</h2>
        <p className="text-sm text-ink-muted">
          Ta fiche a bien été reçue. L&apos;équipe Vie des STAR de {churchName} prendra contact avec toi.
        </p>
        {manageToken && (
          <div className="flex flex-col gap-4 border-t border-line pt-4 text-left">
            <InterviewManager token={manageToken} afterSubmit />
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-ink-muted">Garde ce lien pour retrouver ou changer ton rendez-vous :</p>
              <p className="select-all break-all text-[13px] font-semibold text-ink">
                {typeof window === "undefined" ? `/entretien/${manageToken}` : `${window.location.origin}/entretien/${manageToken}`}
              </p>
              <Link href={`/entretien/${manageToken}`} className={`${buttonClasses("secondary")} self-start`}>
                <CalendarClock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Gérer mon rendez-vous
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  const retention = retentionMonths % 12 === 0 ? `${retentionMonths / 12} an${retentionMonths > 12 ? "s" : ""}` : `${retentionMonths} mois`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {globalError && <Alert tone="danger">{globalError}</Alert>}

      <Card title="Qui es-tu ?">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-photo`} className={fieldLabelClasses}>
            Photo d&apos;identité
          </label>
          <input
            id={`${uid}-photo`}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            required
            onChange={onPhotoChange}
            aria-describedby={`${uid}-photo-hint`}
            className="w-full text-sm text-ink-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-control-line file:bg-surface file:px-4 file:font-display file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          <p id={`${uid}-photo-hint`} className={errors.photo ? "text-[13px] text-danger" : "text-[13px] text-ink-muted"}>
            {errors.photo ?? "Visage bien visible, fond neutre. JPEG, PNG, WebP ou HEIC, 8 Mo au plus."}
          </p>
        </div>
        {preview && (
          <canvas
            ref={previewRef}
            width={256}
            height={320}
            role="img"
            aria-label="Aperçu de la photo"
            className="h-40 w-32 rounded-control border border-line"
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Prénom" name="firstName" required maxLength={100} autoComplete="given-name" error={errors.firstName} onChange={() => clearError("firstName")} />
          <Input label="Nom" name="lastName" required maxLength={100} autoComplete="family-name" error={errors.lastName} onChange={() => clearError("lastName")} />
        </div>
        <Input label="Date de naissance" type="date" name="birthDate" required autoComplete="bday" error={errors.birthDate} onChange={() => clearError("birthDate")} />
        <Input label="Métier / profession (facultatif)" name="profession" maxLength={150} error={errors.profession} />
        <Pills legend="Statut familial (facultatif)" name="maritalStatus" options={MARITAL_OPTIONS} value={maritalStatus} onChange={setMaritalStatus} />
        <Input label="Nombre d'enfants (facultatif)" type="number" name="childrenCount" min={0} max={30} inputMode="numeric" error={errors.childrenCount} />
      </Card>

      <Card title="Adresse et contact">
        <Input label="Rue (facultatif)" name="street" maxLength={200} autoComplete="street-address" error={errors.street} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Ville (facultatif)" name="city" maxLength={100} autoComplete="address-level2" error={errors.city} />
          <Input label="Code postal (facultatif)" name="postalCode" maxLength={20} inputMode="numeric" autoComplete="postal-code" error={errors.postalCode} />
        </div>
        <Input label="Pays (facultatif)" name="country" maxLength={100} autoComplete="country-name" error={errors.country} />
        <Input label="Téléphone (facultatif)" type="tel" name="phone" maxLength={30} autoComplete="tel" placeholder="Ex : 06 12 34 56 78" error={errors.phone} />
        <Input label="Adresse e-mail (facultatif)" type="email" name="email" maxLength={200} autoComplete="email" placeholder="prenom@exemple.fr" error={errors.email} onChange={() => clearError("email")} />
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
            Formations PCNC suivies <span className="font-normal text-ink-muted">(églises ICC, facultatif)</span>
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
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
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
          <span>J&apos;accepte que ces informations soient utilisées pour étudier ma candidature au service.</span>
        </label>
        {errors.consent && <p className="text-[13px] text-danger">{errors.consent}</p>}
      </Card>

      {/* Champ piège anti-robot : invisible pour les humains */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px]" />

      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="mt-1 text-xs text-ink-muted">Vérification anti-robots requise pour envoyer la fiche.</p>}
      </div>

      {!consent && (
        <p className="text-center text-xs text-ink-muted">Coche l&apos;accord ci-dessus pour envoyer ta fiche.</p>
      )}
      <Button type="submit" className="w-full" disabled={submitting || !turnstileToken || !consent}>
        {submitting ? "Envoi en cours…" : "Envoyer ma fiche"}
      </Button>
    </form>
  );
}
