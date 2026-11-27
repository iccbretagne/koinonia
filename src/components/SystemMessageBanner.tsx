"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { buttonClasses } from "@/components/ui/button-classes";

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

/** Action « Lire le message » : bouton ghost, cible de 44 px sur mobile. */
const readClasses = `${buttonClasses("ghost", "sm")} -ml-3 mt-1`;

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
            <span className={`${readClasses} pointer-events-none`}>Lire le message</span>
          ) : (
            <Link href={`/messages/${current.id}`} className={readClasses}>
              Lire le message
            </Link>
          )}
        </div>
        {visible.length > 1 && (
          <div className="-my-1.5 flex shrink-0 items-center gap-1 text-[13px] text-ink-muted">
            <IconButton
              icon={ChevronLeft}
              aria-label="Message précédent"
              onClick={() => setIndex((position - 1 + visible.length) % visible.length)}
            />
            <span aria-live="polite">
              {position + 1} sur {visible.length}
            </span>
            <IconButton
              icon={ChevronRight}
              aria-label="Message suivant"
              onClick={() => setIndex((position + 1) % visible.length)}
            />
          </div>
        )}
        {current.severity !== "URGENT" && !preview && (
          <IconButton icon={X} aria-label="Fermer ce message" onClick={dismiss} className="-my-1.5 -mr-2" />
        )}
      </div>
    </section>
  );
}
