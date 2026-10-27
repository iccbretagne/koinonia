"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

export interface SystemMessageBannerItem {
  id: string;
  title: string;
  body: string;
  severity: "INFO" | "IMPORTANT" | "URGENT";
}

const TONE: Record<SystemMessageBannerItem["severity"], { box: string; icon: string; Icon: LucideIcon }> = {
  INFO: { box: "bg-info-soft", icon: "text-info", Icon: Info },
  IMPORTANT: { box: "bg-warning-soft", icon: "text-warning", Icon: TriangleAlert },
  URGENT: { box: "bg-danger-soft", icon: "text-danger", Icon: CircleAlert },
};

function sendReceipt(id: string, action: "seen" | "dismiss") {
  void fetch(`/api/system-messages/${id}/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    keepalive: true,
  }).catch(() => {
    // Hors ligne : le message réapparaîtra, sans gravité.
  });
}

/**
 * Bandeau des messages système (spec 071), sous la barre supérieure : un message à la fois, le
 * plus grave d'abord. Fermer le masque sur tous les appareils ; un message urgent ne se ferme pas.
 */
export default function SystemMessageBanner({
  messages,
  preview = false,
}: {
  readonly messages: readonly SystemMessageBannerItem[];
  /** Aperçu dans le formulaire de rédaction : aucun reçu, aucun lien, aucune fermeture. */
  readonly preview?: boolean;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = useState(0);
  const seen = useRef(new Set<string>());

  const visible = messages.filter((m) => !dismissed.has(m.id));
  const current = visible[Math.min(index, visible.length - 1)];

  useEffect(() => {
    if (!preview && current && !seen.current.has(current.id)) {
      seen.current.add(current.id);
      sendReceipt(current.id, "seen");
    }
  }, [current, preview]);

  if (!current) return null;
  const tone = TONE[current.severity];
  const position = visible.indexOf(current);

  function dismiss() {
    sendReceipt(current.id, "dismiss");
    setDismissed((prev) => new Set(prev).add(current.id));
  }

  return (
    <section
      aria-label="Message de l'administration"
      className={preview ? "flex w-full" : "mx-auto mt-3 flex w-full max-w-[1200px] items-start gap-3 px-4 md:px-6"}
    >
      <div className={`flex w-full items-start gap-3 rounded-card px-4 py-3 ${tone.box}`}>
        <tone.Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${tone.icon}`} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-[22px] text-ink">{current.title}</p>
          <p className="truncate text-[13px] leading-[18px] text-ink-muted">{current.body}</p>
          {preview ? (
            <span className="text-[13px] font-semibold leading-[18px] text-ink underline underline-offset-2">Lire</span>
          ) : (
            <Link
              href={`/messages/${current.id}`}
              className="text-[13px] font-semibold leading-[18px] text-ink underline underline-offset-2"
            >
              Lire
            </Link>
          )}
        </div>
        {visible.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-[13px] text-ink-muted">
            <button
              type="button"
              aria-label="Message précédent"
              onClick={() => setIndex((position - 1 + visible.length) % visible.length)}
              className="grid size-8 place-items-center rounded-control hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span aria-live="polite">
              {position + 1} sur {visible.length}
            </span>
            <button
              type="button"
              aria-label="Message suivant"
              onClick={() => setIndex((position + 1) % visible.length)}
              className="grid size-8 place-items-center rounded-control hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        {current.severity !== "URGENT" && !preview && (
          <button
            type="button"
            aria-label="Fermer ce message"
            onClick={dismiss}
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </section>
  );
}
