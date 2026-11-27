import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { ruleSchema, storedFormDefinitionSchema } from "@/modules/campaigns/schemas";
import { buttonClasses } from "@/components/ui/button-classes";
import AssignmentPreview from "@/components/campaigns/AssignmentPreview";

type Props = { readonly params: Promise<{ id: string; formId: string }> };

export const metadata: Metadata = { title: "Aperçu du questionnaire" };

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Aperçu répondant d'un questionnaire (spec 091, EVOL-03) : gestionnaire de la campagne
 * seulement, dès le brouillon, questionnaire confidentiel compris (le gestionnaire le lit déjà).
 * Tout autre compte, autre église ou questionnaire inconnu : 404. Rien n'est enregistré : la page
 * n'appelle aucune route. `formId` : identifiant ou clé du questionnaire.
 */
export default async function PreviewPage({ params }: Props) {
  const { id, formId } = await params;
  const managed = await requireCampaignManager(id).catch(() => null);
  if (!managed) notFound();

  const [campaign, form] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id },
      select: { id: true, title: true, description: true, periodStart: true, periodEnd: true, dueAt: true, status: true, rules: true },
    }),
    prisma.campaignForm.findFirst({
      where: { campaignId: id, OR: [{ id: formId }, { key: formId }] },
      select: {
        id: true,
        key: true,
        title: true,
        confidential: true,
        revision: true,
        definition: true,
        assignments: { orderBy: { position: "asc" }, select: { id: true, key: true, label: true, dueAt: true } },
      },
    }),
  ]);
  if (!campaign || !form) notFound();
  const definition = storedFormDefinitionSchema.safeParse(form.definition);
  if (!definition.success) notFound();
  // Règles relues une par une : une règle illisible est ignorée, les autres restent évaluées.
  const rules = (Array.isArray(campaign.rules) ? campaign.rules : []).flatMap((r) => {
    const parsed = ruleSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href={`/collectes/${id}`} className={`${buttonClasses("ghost", "sm")} min-h-11 self-start sm:min-h-9`}>
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Retour à la campagne
      </Link>
      <AssignmentPreview
        campaign={{
          id: campaign.id,
          title: campaign.title,
          description: campaign.description,
          periodStart: day(campaign.periodStart),
          periodEnd: day(campaign.periodEnd),
          dueAt: iso(campaign.dueAt),
          status: campaign.status,
        }}
        form={{
          id: form.id,
          key: form.key,
          title: form.title,
          confidential: form.confidential,
          revision: form.revision,
          intro: definition.data.intro,
          sections: definition.data.sections,
        }}
        assignments={form.assignments.map((a) => ({ id: a.id, key: a.key, label: a.label, dueAt: iso(a.dueAt) }))}
        rules={rules}
      />
    </div>
  );
}
