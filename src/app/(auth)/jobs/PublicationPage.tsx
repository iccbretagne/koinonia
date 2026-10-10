"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Publication } from "@/modules/jobs";
import PublicationDetail from "./PublicationDetail";
import { tabOf } from "./board";

/**
 * Page de détail d'une publication (liens directs, partages WhatsApp — spec 064) : même contenu
 * que le panneau de la liste, dans une carte, avec un retour vers l'onglet de la publication.
 */
export default function PublicationPage({
  publication,
  canManage,
  nowMs,
}: {
  readonly publication: Publication;
  readonly canManage: boolean;
  readonly nowMs: number;
}) {
  const router = useRouter();
  const back = `/jobs?tab=${tabOf(publication.kind)}`;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={back} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Offres
      </Link>
      <article className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h1 className="font-display text-[22px] font-bold leading-7 text-ink">{publication.title}</h1>
        <PublicationDetail
          publication={publication}
          canManage={canManage}
          nowMs={nowMs}
          onChanged={() => router.refresh()}
          onDeleted={() => router.push(back)}
        />
      </article>
    </div>
  );
}
