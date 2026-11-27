import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { getFormsCapability } from "@/modules/forms/auth";
import { listFacilitatedForms, listForms, listFormsGrants } from "@/modules/forms";
import { FORM_KIND_LABELS } from "@/modules/forms/schemas";
import CreateFormButton from "./CreateFormButton";
import FormsGrantsButton from "./FormsGrantsButton";
import { paths } from "@/lib/paths";

const STATUS = {
  DRAFT: { tone: "neutral", label: "Brouillon" },
  PUBLISHED: { tone: "success", label: "Publié" },
  CLOSED: { tone: "warning", label: "Clôturé" },
} as const;

const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * Formulaires de l'église (spec 079) : réservé au secrétariat et à l'administration ; un
 * intervenant y retrouve les formulaires où il est désigné (lot 2).
 */
export default async function FormsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  const capability = churchId ? await getFormsCapability(session, churchId) : null;
  if (!churchId || !capability) {
    const facilitated = churchId ? await listFacilitatedForms(session.user.id, [churchId]) : [];
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Agenda" title="Formulaires" />
        {facilitated.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-[17px] font-semibold text-ink">Où j&apos;interviens</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {facilitated.map((f) => (
                <li key={f.id}>
                  <Link href={paths.formulaires.form(f.id, { onglet: "reponses" })} className="block rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">{f.title}</p>
                      <StatusChip tone={STATUS[f.status].tone}>{STATUS[f.status].label}</StatusChip>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-muted">Inscrits et feuille de présence de votre périmètre</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState icon={ClipboardList} title="Accès réservé" description="Les formulaires sont gérés par le secrétariat et l'administration de l'église." />
        )}
        <Link href={paths.events.mesInscriptions({ vue: "formulaires" })} className={`${buttonClasses("secondary")} self-start`}>
          Voir mes réponses
        </Link>
      </div>
    );
  }
  // `own` : accès délégué, ses formulaires et ceux partagés avec lui seulement (spec 085).
  const [forms, grants] = await Promise.all([
    listForms(churchId, capability === "own" ? { userId: session.user.id } : undefined),
    capability === "all" ? listFormsGrants(churchId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="Formulaires"
        description="Inscriptions, participation aux événements et sondages, publics ou réservés aux comptes de l'église."
        actions={
          <div className="flex flex-wrap gap-2">
            {capability === "all" && <FormsGrantsButton grants={grants} />}
            <CreateFormButton />
          </div>
        }
      />
      {forms.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucun formulaire" description="Créez un premier formulaire : une inscription, une participation ou un sondage." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={paths.formulaires.form(f.id)} className="block rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{f.title}</p>
                  <StatusChip tone={STATUS[f.status].tone}>{STATUS[f.status].label}</StatusChip>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {FORM_KIND_LABELS[f.kind]} · {f.access === "PUBLIC" ? "public" : "comptes de l'église"}
                  {f.anonymous ? " · anonyme" : ""}
                  {f.closesAt ? ` · réponses jusqu'au ${dateFr(f.closesAt)}` : ""}
                  {f.createdBy ? ` · créé par ${f.createdBy.displayName ?? f.createdBy.name}` : ""}
                </p>
                <p className="mt-2 text-[13px] text-ink">
                  {f.purgedAt
                    ? "Réponses effacées (conservation écoulée)"
                    : `${f.activeResponses} réponse${f.activeResponses > 1 ? "s" : ""}${f.maxResponses ? ` / ${f.maxResponses}` : ""}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
