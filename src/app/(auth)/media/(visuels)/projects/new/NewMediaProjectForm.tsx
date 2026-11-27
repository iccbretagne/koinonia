"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Alert, Textarea } from "@/components/ui";
import { paths } from "@/lib/paths";

export default function NewMediaProjectForm({ churchId }: { readonly churchId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/media-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, churchId, description: description || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de la création");
      router.push(paths.media.project(json.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <Input
        label="Nom du projet"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Ex : Série de visuels Pâques 2026"
      />

      <Textarea
        label="Description (facultative)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Contexte, objectifs…"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Création en cours…" : "Créer le projet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(paths.media.projects())}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
