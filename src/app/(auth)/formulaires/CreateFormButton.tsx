"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Checkbox, Input, Modal, Select } from "@/components/ui";
import { FORM_KIND_LABELS, FORM_KINDS } from "@/modules/forms/schemas";
import { useApi } from "./use-api";

/** « Créer un formulaire » : titre, type et diffusion ; questions et réglages ensuite. */
export default function CreateFormButton() {
  const router = useRouter();
  const { call, busy } = useApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof FORM_KINDS)[number]>("REGISTRATION");
  const [access, setAccess] = useState<"PUBLIC" | "MEMBERS">("PUBLIC");
  const [anonymous, setAnonymous] = useState(false);

  async function submit() {
    const form = await call<{ id: string }>("/api/forms", "POST", { title, kind, access, anonymous: kind === "SURVEY" && anonymous }, "Formulaire créé");
    if (form) router.push(`/formulaires/${form.id}`);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Créer un formulaire
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau formulaire">
        <div className="space-y-3">
          <Input label="Titre" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
          <Select
            label="Type"
            value={kind}
            options={FORM_KINDS.map((k) => ({ value: k, label: FORM_KIND_LABELS[k] }))}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          />
          <Select
            label="Qui peut répondre ?"
            value={access}
            options={[
              { value: "PUBLIC", label: "Tout le monde, par le lien (sans compte)" },
              { value: "MEMBERS", label: "Les comptes connectés de l'église" },
            ]}
            onChange={(e) => setAccess(e.target.value as typeof access)}
          />
          {kind === "SURVEY" && (
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <span className="text-[15px] text-ink">Sondage anonyme (aucune identité enregistrée, non modifiable ensuite)</span>
            </label>
          )}
          <Button type="button" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? "Création…" : "Créer le brouillon"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
