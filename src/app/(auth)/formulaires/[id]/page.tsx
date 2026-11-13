import { notFound } from "next/navigation";
import { hasChurchPermission, requireAuth } from "@/lib/auth";
import { getForm, listResponses, usageCounts } from "@/modules/forms";
import { prisma } from "@/lib/prisma";
import FormEditor, { type EditorTab } from "./FormEditor";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ onglet?: string }>;
};

const TABS: EditorTab[] = ["construction", "reglages", "apercu", "reponses"];

/** Construction, réglages, aperçu et réponses d'un formulaire (spec 079). */
export default async function FormPage({ params, searchParams }: Props) {
  const session = await requireAuth();
  const { id } = await params;
  const form = await getForm(id);
  // Église du formulaire : un formulaire d'une autre église répond comme une adresse inconnue.
  if (!form || !(await hasChurchPermission(session, "forms:manage", form.churchId))) notFound();
  const { onglet } = await searchParams;
  const tab = TABS.find((t) => t === onglet) ?? "construction";
  const [usage, church, responses] = await Promise.all([
    usageCounts(id),
    prisma.church.findUnique({ where: { id: form.churchId }, select: { slug: true } }),
    tab === "reponses" ? listResponses(id) : Promise.resolve([]),
  ]);

  return (
    <FormEditor
      tab={tab}
      form={JSON.parse(JSON.stringify(form))}
      churchSlug={church?.slug ?? ""}
      usage={{
        responses: usage.responses,
        answeredQuestions: [...usage.answeredQuestions],
        holdingByChoice: Object.fromEntries(usage.holdingByChoice),
      }}
      responses={JSON.parse(JSON.stringify(responses))}
    />
  );
}
