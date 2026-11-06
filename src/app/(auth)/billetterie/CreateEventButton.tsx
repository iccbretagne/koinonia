"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { useApi } from "./use-api";

/** « Créer un événement » : titre, dates et jauge ; le reste se règle dans les paramètres. */
export default function CreateEventButton() {
  const router = useRouter();
  const { call, busy } = useApi();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", startsAt: "", endsAt: "", capacity: "" });
  async function submit() {
    const event = await call<{ id: string }>("/api/ticketing/events", "POST", {
      title: form.title,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      capacity: Number(form.capacity),
    }, "Événement créé");
    if (event) router.push(`/billetterie/${event.id}?vue=parametres`);
  }
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Créer un événement
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nouvel événement">
        <div className="space-y-3">
          <Input label="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Début" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Input label="Fin" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          <Input
            label="Jauge réglementaire"
            hint="Nombre maximal de personnes dans le bâtiment, équipe comprise."
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Button type="button" disabled={busy || !form.title || !form.startsAt || !form.endsAt || !form.capacity} onClick={submit}>
            {busy ? "Création…" : "Créer le brouillon"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
