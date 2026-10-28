"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

type FieldErrors = Partial<Record<string, string>>;

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const FORMATIONS = ["001", "101", "201", "RTT", "ACB", "IEBI"];

const STATUT_OPTIONS = [
  { value: "CELIBATAIRE", label: "Célibataire" },
  { value: "MARIE", label: "Marié(e)" },
  { value: "DIVORCE", label: "Divorcé(e)" },
  { value: "VEUF", label: "Veuf / Veuve" },
];

const YES_NO = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

function inputClass(errors: FieldErrors, field: string, extra = "") {
  return `w-full border-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-brand ${
    errors[field] ? "border-danger bg-danger-soft" : "border-control-line"
  } ${extra}`;
}

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-muted mb-1">
        {label}
        {required && <span className="text-danger"> *</span>}
        {hint && <span className="text-ink-subtle text-xs"> ({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

function Pills({
  name,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly options: { value: string; label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-brand text-on-brand border-brand"
              : "border-line text-ink-muted hover:border-brand"
          }`}
        >
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
  );
}

export default function FicheForm({ turnstileSiteKey }: { readonly turnstileSiteKey: string }) {
  const uid = useId();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const [preview, setPreview] = useState<string | null>(null);
  const [statut, setStatut] = useState("");
  const [baptise, setBaptise] = useState("");
  const [ancienneEglise, setAncienneEglise] = useState("");
  const [dejaServi, setDejaServi] = useState("");
  const [disponible, setDisponible] = useState("");
  const [formations, setFormations] = useState<string[]>([]);

  // Libère l'aperçu de la photo quand il change ou quand la page est quittée
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function clearError(field: string) {
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    clearError("photo");
    if (file && file.size > MAX_PHOTO_SIZE) {
      setFieldErrors((errs) => ({ ...errs, photo: "Photo trop lourde (8 Mo maximum)." }));
      e.target.value = "";
      setPreview(null);
      return;
    }
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function toggleFormation(f: string) {
    setFormations((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstileToken) {
      setGlobalError("Merci de compléter la vérification anti-robots ci-dessous.");
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setFieldErrors({});

    try {
      const fd = new FormData(e.currentTarget);
      fd.set("turnstileToken", turnstileToken);

      const res = await fetch("/api/pvs-fiche-identite", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json.details?.length) {
          const errs: FieldErrors = {};
          for (const d of json.details as { field: string; message: string }[]) {
            errs[d.field] = d.message;
          }
          setFieldErrors(errs);
          setGlobalError("Veuillez corriger les erreurs ci-dessous.");
        } else {
          setGlobalError(json.error ?? "Une erreur est survenue. Veuillez réessayer.");
        }
        // Jeton à usage unique : un nouveau défi est nécessaire pour réessayer.
        setTurnstileReset((n) => n + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setSuccess(true);
        window.scrollTo({ top: 0 });
      }
    } catch {
      setGlobalError("Une erreur réseau est survenue. Veuillez réessayer.");
      setTurnstileReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="bg-surface rounded-xl border border-success/30 p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto text-3xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-ink">Fiche envoyée !</h2>
        <p className="text-sm text-ink-muted">
          Ta fiche d&apos;identité a bien été reçue. L&apos;équipe du PVS prendra contact avec toi.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {globalError && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">
          {globalError}
        </p>
      )}

      <Card title="Qui es-tu ?">
        <Field id={`${uid}-photo`} label="Photo d'identité" required error={fieldErrors.photo}
          hint="visage bien visible, fond neutre">
          <input
            id={`${uid}-photo`}
            type="file"
            name="photo"
            accept="image/*"
            required
            onChange={onPhotoChange}
            className={`${inputClass(fieldErrors, "photo")} file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:text-on-brand`}
          />
        </Field>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Aperçu de la photo" className="h-40 w-32 rounded-lg border border-line object-cover" />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id={`${uid}-prenom`} label="Prénom" required error={fieldErrors.prenom}>
            <input id={`${uid}-prenom`} type="text" name="prenom" required maxLength={100}
              onChange={() => clearError("prenom")} className={inputClass(fieldErrors, "prenom")} />
          </Field>
          <Field id={`${uid}-nom`} label="Nom" required error={fieldErrors.nom}>
            <input id={`${uid}-nom`} type="text" name="nom" required maxLength={100}
              onChange={() => clearError("nom")} className={inputClass(fieldErrors, "nom")} />
          </Field>
        </div>

        <Field id={`${uid}-dateNaissance`} label="Date de naissance" required error={fieldErrors.dateNaissance}>
          <input id={`${uid}-dateNaissance`} type="date" name="dateNaissance" required
            onChange={() => clearError("dateNaissance")} className={inputClass(fieldErrors, "dateNaissance")} />
        </Field>

        <Field id={`${uid}-profession`} label="Métier / profession" error={fieldErrors.profession}>
          <input id={`${uid}-profession`} type="text" name="profession" maxLength={150}
            className={inputClass(fieldErrors, "profession")} />
        </Field>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Statut familial</legend>
          <Pills name="statutFamilial" options={STATUT_OPTIONS} value={statut} onChange={setStatut} />
        </fieldset>

        <Field id={`${uid}-enfants`} label="Nombre d'enfants" error={fieldErrors.enfants}>
          <input id={`${uid}-enfants`} type="number" name="enfants" min={0} max={30} inputMode="numeric"
            className={inputClass(fieldErrors, "enfants")} />
        </Field>
      </Card>

      <Card title="Adresse et contact">
        <Field id={`${uid}-rue`} label="Rue" error={fieldErrors.rue}>
          <input id={`${uid}-rue`} type="text" name="rue" maxLength={200} className={inputClass(fieldErrors, "rue")} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id={`${uid}-ville`} label="Ville" error={fieldErrors.ville}>
            <input id={`${uid}-ville`} type="text" name="ville" maxLength={100} className={inputClass(fieldErrors, "ville")} />
          </Field>
          <Field id={`${uid}-codePostal`} label="Code postal" error={fieldErrors.codePostal}>
            <input id={`${uid}-codePostal`} type="text" name="codePostal" maxLength={20} inputMode="numeric"
              className={inputClass(fieldErrors, "codePostal")} />
          </Field>
        </div>
        <Field id={`${uid}-pays`} label="Pays" error={fieldErrors.pays}>
          <input id={`${uid}-pays`} type="text" name="pays" maxLength={100} className={inputClass(fieldErrors, "pays")} />
        </Field>
        <Field id={`${uid}-telephone`} label="Téléphone" error={fieldErrors.telephone}>
          <input id={`${uid}-telephone`} type="tel" name="telephone" maxLength={30} placeholder="Ex : 06 12 34 56 78"
            className={inputClass(fieldErrors, "telephone")} />
        </Field>
        <Field id={`${uid}-email`} label="Adresse e-mail" error={fieldErrors.email}>
          <input id={`${uid}-email`} type="email" name="email" maxLength={200} placeholder="prenom@exemple.fr"
            onChange={() => clearError("email")} className={inputClass(fieldErrors, "email")} />
        </Field>
      </Card>

      <Card title="Parcours spirituel">
        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Es-tu baptisé(e) ?</legend>
          <Pills name="baptise" options={YES_NO} value={baptise} onChange={setBaptise} />
        </fieldset>
        {baptise === "oui" && (
          <>
            <Field id={`${uid}-dateBapteme`} label="Date de baptême" error={fieldErrors.dateBapteme}>
              <input id={`${uid}-dateBapteme`} type="date" name="dateBapteme" className={inputClass(fieldErrors, "dateBapteme")} />
            </Field>
            <Field id={`${uid}-lieuBapteme`} label="Lieu de baptême" error={fieldErrors.lieuBapteme}>
              <input id={`${uid}-lieuBapteme`} type="text" name="lieuBapteme" maxLength={200} className={inputClass(fieldErrors, "lieuBapteme")} />
            </Field>
          </>
        )}

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Avais-tu une Église avant ?</legend>
          <Pills name="ancienneEglise" options={YES_NO} value={ancienneEglise} onChange={setAncienneEglise} />
        </fieldset>
        {ancienneEglise === "oui" && (
          <>
            <Field id={`${uid}-nomEglise`} label="Nom de l'église précédente" error={fieldErrors.nomEgliseAncienne}>
              <input id={`${uid}-nomEglise`} type="text" name="nomEgliseAncienne" maxLength={200} className={inputClass(fieldErrors, "nomEgliseAncienne")} />
            </Field>
            <Field id={`${uid}-villeEglise`} label="Ville et pays de l'église" error={fieldErrors.villePaysEgliseAncienne}>
              <input id={`${uid}-villeEglise`} type="text" name="villePaysEgliseAncienne" maxLength={200} className={inputClass(fieldErrors, "villePaysEgliseAncienne")} />
            </Field>
          </>
        )}

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Formations PCNC suivies <span className="text-ink-subtle text-xs">(églises ICC)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {FORMATIONS.map((f) => {
              const checked = formations.includes(f);
              return (
                <label
                  key={f}
                  className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
                    checked ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
                  }`}
                >
                  <input type="checkbox" name="formationPCNC" value={f} checked={checked}
                    onChange={() => toggleFormation(f)} className="sr-only" />
                  {f}
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card title="Service">
        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">As-tu déjà servi pour Dieu ?</legend>
          <Pills name="dejaServi" options={YES_NO} value={dejaServi} onChange={setDejaServi} />
        </fieldset>
        {dejaServi === "oui" && (
          <>
            <Field id={`${uid}-dept`} label="Dans quel département ?" error={fieldErrors.departementService}>
              <input id={`${uid}-dept`} type="text" name="departementService" maxLength={200} className={inputClass(fieldErrors, "departementService")} />
            </Field>
            <Field id={`${uid}-ministere`} label="Service dans le ministère" hint="ex : enseignement, louange" error={fieldErrors.serviceMinistere}>
              <input id={`${uid}-ministere`} type="text" name="serviceMinistere" maxLength={300} className={inputClass(fieldErrors, "serviceMinistere")} />
            </Field>
            <Field id={`${uid}-communautaire`} label="Service communautaire" hint="ex : aide aux démunis, organisation d'événements" error={fieldErrors.serviceCommunautaire}>
              <input id={`${uid}-communautaire`} type="text" name="serviceCommunautaire" maxLength={300} className={inputClass(fieldErrors, "serviceCommunautaire")} />
            </Field>
            <Field id={`${uid}-roles`} label="Autres rôles spécifiques" error={fieldErrors.autresRoles}>
              <input id={`${uid}-roles`} type="text" name="autresRoles" maxLength={300} className={inputClass(fieldErrors, "autresRoles")} />
            </Field>
          </>
        )}

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Es-tu disponible pour servir dans l&apos;église actuelle ?
          </legend>
          <Pills name="disponiblePourServir" options={YES_NO} value={disponible} onChange={setDisponible} />
        </fieldset>
        {disponible === "oui" && (
          <Field id={`${uid}-interets`} label="Départements ou Domaines d'intérêt pour le service" error={fieldErrors.domainesInteret}>
            <textarea id={`${uid}-interets`} name="domainesInteret" rows={3} maxLength={500}
              className={inputClass(fieldErrors, "domainesInteret", "resize-none")} />
          </Field>
        )}

        <Field id={`${uid}-observations`} label="Observations" error={fieldErrors.observations}>
          <textarea id={`${uid}-observations`} name="observations" rows={3} maxLength={2000}
            className={inputClass(fieldErrors, "observations", "resize-none")} />
        </Field>
      </Card>

      <Card title="Pour mieux te connaître">
        <Field id={`${uid}-infos`} label="Informations supplémentaires sur ton parcours spirituel" error={fieldErrors.infosSupplementaires}>
          <textarea id={`${uid}-infos`} name="infosSupplementaires" rows={3} maxLength={2000}
            className={inputClass(fieldErrors, "infosSupplementaires", "resize-none")} />
        </Field>
        <Field id={`${uid}-objectifs`} label="Objectifs ou aspirations spirituelles" error={fieldErrors.objectifsSpirituels}>
          <textarea id={`${uid}-objectifs`} name="objectifsSpirituels" rows={3} maxLength={2000}
            className={inputClass(fieldErrors, "objectifsSpirituels", "resize-none")} />
        </Field>
        <Field id={`${uid}-details`} label="Détails spécifiques" error={fieldErrors.detailsSpecifiques}>
          <textarea id={`${uid}-details`} name="detailsSpecifiques" rows={3} maxLength={2000}
            className={inputClass(fieldErrors, "detailsSpecifiques", "resize-none")} />
        </Field>
      </Card>

      {/* Champ piège anti-robot : invisible pour les humains */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute -left-[9999px]" />

      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="text-xs text-ink-subtle mt-1">Vérification anti-robots requise.</p>}
      </div>

      <button
        type="submit"
        disabled={submitting || !turnstileToken}
        className="w-full bg-brand text-on-brand py-3 rounded-lg font-medium text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma fiche"}
      </button>

      <p className="text-xs text-ink-subtle text-center">
        * Champs obligatoires. Tes informations sont utilisées uniquement pour étudier ta
        candidature au service.
      </p>
    </form>
  );
}