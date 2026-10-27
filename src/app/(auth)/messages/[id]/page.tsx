import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { PageHeader, StatusChip } from "@/components/ui";
import type { StatusTone } from "@/components/ui";
import {
  getMessageChurchId,
  getMessageForAuthor,
  getMessageForViewer,
  messageViewerFromSession,
  recordReceipt,
  type SystemMessageView,
} from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";
import { SEVERITY_LABEL } from "@/modules/messages/schemas";

const SEVERITY_TONE: Record<SystemMessageView["severity"], StatusTone> = {
  INFO: "info",
  IMPORTANT: "warning",
  URGENT: "danger",
};

async function loadMessage(id: string, session: Awaited<ReturnType<typeof requireAuth>>) {
  try {
    const churchId = await getMessageChurchId(id);
    const isAuthor = await requireMessageAuthorAccess(churchId).then(
      () => true,
      () => false
    );
    if (isAuthor) return getMessageForAuthor(id);
    const viewer = messageViewerFromSession(session);
    const message = await getMessageForViewer(id, viewer);
    // Ouvrir le détail compte comme « vu » (statistiques de l'auteur).
    await recordReceipt(id, viewer, "seen").catch(() => {});
    return message;
  } catch {
    return null;
  }
}

/** Détail d'un message système (spec 071), pour son public et ses auteurs. */
export default async function SystemMessagePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const message = await loadMessage(id, session);
  if (!message) notFound();

  const date = new Date(message.startsAt).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader eyebrow={message.author} title={message.title} description={`Publié le ${date}`} />
      <div>
        <StatusChip tone={SEVERITY_TONE[message.severity]}>{SEVERITY_LABEL[message.severity]}</StatusChip>
      </div>
      <div className="whitespace-pre-line rounded-card border border-line bg-surface p-4 text-[15px] leading-[24px] text-ink shadow-card sm:p-5">
        {message.body}
      </div>
      {message.linkUrl && (
        <p>
          <Link
            href={message.linkUrl}
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-text underline underline-offset-2"
            {...(message.linkUrl.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {message.linkLabel ?? "En savoir plus"}
            {message.linkUrl.startsWith("https://") && <ExternalLink aria-hidden="true" className="size-4" />}
          </Link>
        </p>
      )}
    </article>
  );
}
