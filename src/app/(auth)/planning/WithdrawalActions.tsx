"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";

/**
 * Gestes du STAR sur ses services (spec 061) : « Je ne peux plus » (désistement, message
 * facultatif au responsable), annulation tant qu'aucun remplaçant n'a été choisi, et message
 * « contacte ton responsable » une fois la date limite de planification passée.
 */

export interface LeaderContact {
  name: string;
  email: string;
  phone: string | null;
}

const MESSAGE_MAX = 500;

function formatDay(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const onBrandClasses =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-on-brand/50 px-4 font-display text-sm font-semibold text-on-brand transition-colors hover:bg-on-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-brand sm:flex-none";

export function WithdrawButton({
  eventId,
  departmentId,
  eventTitle,
  eventDate,
  departmentName,
  onBrand = false,
}: {
  readonly eventId: string;
  readonly departmentId: string;
  readonly eventTitle: string;
  readonly eventDate: Date | string;
  readonly departmentName: string;
  readonly onBrand?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function confirm() {
    setSending(true);
    try {
      const res = await fetch("/api/planning/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, departmentId, message: message.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Désistement impossible");
      toast.success("Désistement enregistré : ton responsable est prévenu");
      setOpen(false);
      setMessage("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Désistement impossible");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {onBrand ? (
        <button type="button" className={onBrandClasses} onClick={() => setOpen(true)}>
          Je ne peux plus
        </button>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="min-h-11 sm:min-h-9">
          Je ne peux plus
        </Button>
      )}
      <ConfirmModal
        open={open}
        title="Tu ne peux plus servir ?"
        message={`Tu seras retiré(e) du service « ${eventTitle} » du ${formatDay(eventDate)} (${departmentName}). Ton responsable est prévenu tout de suite pour te remplacer.`}
        confirmLabel="Me désister"
        confirmingLabel="Envoi…"
        confirming={sending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <Textarea
          label="Message à ton responsable (facultatif)"
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setMessage(e.target.value)}
          hint={`${message.length}/${MESSAGE_MAX}`}
        />
      </ConfirmModal>
    </>
  );
}

export function CancelWithdrawalButton({ withdrawalId, eventDate }: { readonly withdrawalId: string; readonly eventDate: Date | string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function confirm() {
    setSending(true);
    try {
      const res = await fetch(`/api/planning/withdrawals/${withdrawalId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Annulation impossible");
      toast.success("Désistement annulé : tu reprends ton service");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
      setOpen(false);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="min-h-11 sm:min-h-9">
        Annuler mon désistement
      </Button>
      <ConfirmModal
        open={open}
        title="Annuler ton désistement ?"
        message={`Tu reprends ton service du ${formatDay(eventDate)} et ton responsable en est informé.`}
        confirmLabel="Reprendre mon service"
        variant="primary"
        confirming={sending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

/** Après la date limite : le STAR joint directement son responsable. */
export function DeadlinePassedNotice({ contacts }: { readonly contacts: LeaderContact[] }) {
  return (
    <Alert tone="info" title="La date limite de planification est passée.">
      Si tu ne peux plus servir, contacte directement ton responsable
      {contacts.length > 0 ? " :" : "."}
      {contacts.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {contacts.map((c) => (
            <li key={c.email} className="break-words">
              <span className="font-semibold">{c.name}</span>
              {" · "}
              <a href={`mailto:${c.email}`} className="underline">
                {c.email}
              </a>
              {c.phone && (
                <>
                  {" · "}
                  <a href={`tel:${c.phone}`} className="underline">
                    {c.phone}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
