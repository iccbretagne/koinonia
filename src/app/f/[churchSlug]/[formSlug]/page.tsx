import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import PublicFormUnavailable from "@/components/PublicFormUnavailable";
import PublicShell from "@/components/ticketing/PublicShell";
import { Alert } from "@/components/ui";
import { isChurchMember } from "@/modules/forms/auth";
import { answersRecord, findMemberResponse, hasAnonymousReceipt, loadAnswerableForm, publicView } from "@/modules/forms";
import AnswerForm from "./AnswerForm";

type Params = { readonly params: Promise<{ churchSlug: string; formSlug: string }> };

export const metadata: Metadata = { title: "Formulaire", robots: { index: false } };

/** Message unique, quelle que soit la raison (spec 079). */
function Unavailable() {
  return (
    <PublicShell eyebrow="Koinonia" title="Formulaire non disponible">
      <Alert tone="info" title="Ce formulaire n'est pas disponible.">
        Il est peut-être fermé, pas encore ouvert, ou l&apos;adresse est incorrecte.
      </Alert>
    </PublicShell>
  );
}

/** Page de réponse à un formulaire (spec 079) : publique, ou réservée aux comptes de l'église. */
export default async function FormPage({ params }: Params) {
  const { churchSlug, formSlug } = await params;
  await connection();
  const form = await loadAnswerableForm(churchSlug, formSlug);
  if (!form) return <Unavailable />;
  const session = await auth().catch(() => null);
  const path = `/f/${churchSlug}/${formSlug}`;

  if (form.access === "MEMBERS") {
    if (!session?.user) {
      return (
        <PublicShell eyebrow={form.church.name} title={form.title}>
          <Alert tone="info" title="Connexion requise">
            Ce formulaire est réservé aux membres de {form.church.name}.{" "}
            <Link href={`/?next=${encodeURIComponent(path)}`} className="font-semibold underline">
              Se connecter
            </Link>
          </Alert>
        </PublicShell>
      );
    }
    if (!isChurchMember(session, form.churchId)) return <Unavailable />;
  }

  const view = await publicView(form);
  const userId = session?.user?.id;
  const mine = userId && !form.anonymous ? await findMemberResponse(form.id, userId) : null;
  const alreadyAnswered = userId && form.anonymous ? await hasAnonymousReceipt(form.id, userId) : false;
  const siteKey = form.access === "PUBLIC" ? getTurnstileSiteKey() : null;

  return (
    <PublicShell eyebrow={form.church.name} title={form.title}>
      <div className="space-y-6">
        {form.description && <p className="whitespace-pre-line text-[15px] leading-6 text-ink">{form.description}</p>}
        {form.anonymous && (
          <p className="text-[13px] text-ink-muted">Sondage anonyme : ni votre nom, ni votre adresse, ni votre compte ne sont enregistrés avec vos réponses.</p>
        )}
        {alreadyAnswered ? (
          <Alert tone="success" title="Merci, vous avez déjà répondu à ce sondage." />
        ) : form.access === "PUBLIC" && !siteKey ? (
          <PublicFormUnavailable churchName={form.church.name} />
        ) : (
          <AnswerForm
            form={JSON.parse(JSON.stringify(view))}
            churchSlug={churchSlug}
            formSlug={formSlug}
            turnstileSiteKey={siteKey}
            signedIn={!!userId}
            recoverable={form.access === "PUBLIC" && !form.anonymous && !userId}
            existing={mine ? { status: mine.status, answers: answersRecord(mine.answers) } : null}
          />
        )}
      </div>
    </PublicShell>
  );
}
