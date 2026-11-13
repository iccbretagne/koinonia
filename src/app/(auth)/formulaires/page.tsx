import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getCurrentChurchId, hasChurchPermission, requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { listForms } from "@/modules/forms";
import { FORM_KIND_LABELS } from "@/modules/forms/schemas";
import CreateFormButton from "./CreateFormButton";

const STATUS = {
  DRAFT: { tone: "neutral", label: "Brouillon" },
  PUBLISHED: { tone: "success", label: "Publié" },
  CLOSED: { tone: "warning", label: "Clôturé" },
} as const;

const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Formulaires de l'église (spec 079) : réservé au secrétariat et à l'administration. */
export default async function FormsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  const manager = churchId ? await hasChurchPermission(session, "forms:manage", churchId) : false;
  if (!churchId || !manager) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Agenda" title="Formulaires" />
        <EmptyState icon={ClipboardList} title="Accès réservé" description="Les formulaires sont gérés par le secrétariat et l'administration de l'église." />
        <Link href="/formulaires/mes-reponses" className="text-[15px] font-semibold text-brand-text underline">
          Mes réponses
        </Link>
      </div>
    );
  }
  const forms = await listForms(churchId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="Formulaires"
        description="Inscriptions, participation aux événements et sondages, publics ou réservés aux comptes de l'église."
        actions={<CreateFormButton />}
      />
      {forms.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucun formulaire" description="Créez un premier formulaire : une inscription, une participation ou un sondage." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`/formulaires/${f.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-brand">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{f.title}</p>
                  <StatusChip tone={STATUS[f.status].tone}>{STATUS[f.status].label}</StatusChip>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {FORM_KIND_LABELS[f.kind]} · {f.access === "PUBLIC" ? "public" : "comptes de l'église"}
                  {f.anonymous ? " · anonyme" : ""}
                  {f.closesAt ? ` · réponses jusqu'au ${dateFr(f.closesAt)}` : ""}
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
