"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, Textarea, useToast } from "@/components/ui";

type Props = {
  readonly assignmentId: string;
  readonly status: "PENDING" | "OBSERVATION";
  readonly name: string;
  readonly departmentName: string;
};

type Pending = "accept" | "confirm" | "send-back" | null;

/** Décisions du département sur son affectation : accueillir, confirmer, renvoyer au PVS. */
export default function AssignmentActions({ assignmentId, status, name, departmentName }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  async function decide() {
    if (!pending) return;
    if (pending === "send-back" && reason.trim().length < 3) {
      toast.error("Le motif du renvoi est obligatoire.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/serving/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending === "send-back" ? { action: pending, reason: reason.trim() } : { action: pending }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "La décision n'a pas pu être enregistrée.");
        return;
      }
      toast.success(
        pending === "accept" ? `${name} est accueilli(e) dans ${departmentName}` : pending === "confirm" ? "STAR confirmé" : "Renvoyé(e) au PVS"
      );
      setPending(null);
      setReason("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const copy = {
    accept: {
      title: `Accueillir ${name} dans ${departmentName} ?`,
      message: "La personne devient STAR du département et sa période d'observation commence.",
      label: "Accueillir",
    },
    confirm: {
      title: `Confirmer ${name} dans ${departmentName} ?`,
      message: "La période d'observation se termine : la personne reste STAR du département. Le PVS est notifié.",
      label: "Confirmer",
    },
    "send-back": {
      title: `Renvoyer ${name} au PVS ?`,
      message:
        status === "OBSERVATION"
          ? "La personne est retirée du département et ses services à venir y sont supprimés. Le PVS est notifié avec ton motif."
          : "Le PVS est notifié avec ton motif et pourra la réorienter.",
      label: "Renvoyer au PVS",
    },
  } as const;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING" ? (
        <Button size="sm" onClick={() => setPending("accept")}>
          Accueillir
        </Button>
      ) : (
        <Button size="sm" onClick={() => setPending("confirm")}>
          Confirmer
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => setPending("send-back")}>
        Renvoyer au PVS
      </Button>
      {pending && (
        <ConfirmModal
          open
          title={copy[pending].title}
          message={copy[pending].message}
          confirmLabel={copy[pending].label}
          variant={pending === "send-back" ? "danger" : "primary"}
          confirming={sending}
          onConfirm={decide}
          onCancel={() => setPending(null)}
        >
          {pending === "send-back" && (
            <Textarea label="Motif (obligatoire)" required value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
