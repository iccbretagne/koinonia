import type { ReactNode } from "react";
import { MARITAL_STATUS_LABEL } from "@/modules/serving/schemas";

/** Réponses de la fiche, partagées par la vue PVS/département et la vue du STAR (D8). */
export type Answers = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly profession: string | null;
  readonly maritalStatus: keyof typeof MARITAL_STATUS_LABEL | null;
  readonly childrenCount: number | null;
  readonly street: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly baptized: boolean | null;
  readonly baptismDate: string | null;
  readonly baptismPlace: string | null;
  readonly previousChurch: boolean | null;
  readonly previousChurchName: string | null;
  readonly previousChurchLocation: string | null;
  readonly pcncTrainings: readonly string[];
  readonly hasServed: boolean | null;
  readonly servedDepartment: string | null;
  readonly ministryService: string | null;
  readonly communityService: string | null;
  readonly otherRoles: string | null;
  readonly availableToServe: boolean | null;
  readonly interests: string | null;
  readonly observations: string | null;
  readonly journeyDetails: string | null;
  readonly spiritualGoals: string | null;
  readonly specificDetails: string | null;
};

const NOT_ANSWERED = "Non renseigné";

function yesNo(v: boolean | null) {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  return NOT_ANSWERED;
}

function day(iso: string | null) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : null;
}

type Item = { label: string; value: ReactNode; full?: boolean };

function Section({ title, items }: { readonly title: string; readonly items: Item[] }) {
  const visible = items.filter((i) => i.value !== null && i.value !== "");
  if (visible.length === 0) return null;
  return (
    <section className="bg-surface rounded-xl border border-line p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-text mb-3">{title}</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {visible.map((i) => (
          <div key={i.label} className={i.full ? "sm:col-span-2" : undefined}>
            <dt className="text-xs uppercase tracking-wide text-ink-subtle">{i.label}</dt>
            <dd className="text-sm text-ink whitespace-pre-line break-words">{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function ApplicationAnswers({ app }: { readonly app: Answers }) {
  const address =
    [app.street, [app.postalCode, app.city].filter(Boolean).join(" "), app.country].filter(Boolean).join(", ") || null;
  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-xl border border-line p-4 sm:p-5 flex flex-col-reverse sm:flex-row gap-4 sm:items-start">
        <dl className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {[
            { label: "Date de naissance", value: day(app.birthDate) },
            { label: "Profession", value: app.profession },
            { label: "Statut familial", value: app.maritalStatus ? MARITAL_STATUS_LABEL[app.maritalStatus] : null },
            { label: "Enfants", value: app.childrenCount === null ? null : String(app.childrenCount) },
          ]
            .filter((i) => i.value)
            .map((i) => (
              <div key={i.label}>
                <dt className="text-xs uppercase tracking-wide text-ink-subtle">{i.label}</dt>
                <dd className="text-sm text-ink">{i.value}</dd>
              </div>
            ))}
        </dl>
        {/* eslint-disable-next-line @next/next/no-img-element -- photo privée servie par une route authentifiée, sans cache */}
        <img
          src={`/api/serving/applications/${app.id}/photo`}
          alt={`Photo de ${app.firstName} ${app.lastName}`}
          className="h-40 w-30 rounded-lg border border-line object-cover bg-surface-sunken self-start"
        />
      </section>
      <Section
        title="Coordonnées"
        items={[
          { label: "Adresse", value: address, full: true },
          { label: "Téléphone", value: app.phone },
          { label: "E-mail", value: app.email },
        ]}
      />
      <Section
        title="Parcours spirituel"
        items={[
          { label: "Baptisé(e)", value: yesNo(app.baptized) },
          { label: "Date de baptême", value: day(app.baptismDate) },
          { label: "Lieu de baptême", value: app.baptismPlace },
          { label: "Église précédente", value: yesNo(app.previousChurch) },
          { label: "Nom de l'église précédente", value: app.previousChurchName },
          { label: "Ville et pays de l'église", value: app.previousChurchLocation },
          { label: "Formations PCNC", value: app.pcncTrainings.join(", ") || NOT_ANSWERED, full: true },
        ]}
      />
      <Section
        title="Service"
        items={[
          { label: "A déjà servi", value: yesNo(app.hasServed) },
          { label: "Département", value: app.servedDepartment },
          { label: "Service dans le ministère", value: app.ministryService, full: true },
          { label: "Service communautaire", value: app.communityService, full: true },
          { label: "Autres rôles", value: app.otherRoles, full: true },
          { label: "Disponible pour servir", value: yesNo(app.availableToServe) },
          { label: "Domaines d'intérêt", value: app.interests },
          { label: "Observations", value: app.observations, full: true },
        ]}
      />
      <Section
        title="Pour mieux la connaître"
        items={[
          { label: "Informations sur le parcours", value: app.journeyDetails, full: true },
          { label: "Objectifs spirituels", value: app.spiritualGoals, full: true },
          { label: "Détails spécifiques", value: app.specificDetails, full: true },
        ]}
      />
    </div>
  );
}
