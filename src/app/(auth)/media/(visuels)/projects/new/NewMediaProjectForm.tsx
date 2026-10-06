"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function NewMediaProjectForm({ churchId }: { readonly churchId: string }) {
  const id = useId();
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
      router.push(`/media/projects/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div>
        <label htmlFor={`${id}-f1`} className="block text-sm font-medium text-ink-muted mb-1">
          Nom du projet <span className="text-danger">*</span>
        </label>
        <Input id={`${id}-f1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Ex: Série de visuels Pâques 2026"
        />
      </div>

      <div>
        <label htmlFor={`${id}-f2`} className="block text-sm font-medium text-ink-muted mb-1">
          Description <span className="text-ink-subtle">(optionnel)</span>
        </label>
        <textarea id={`${id}-f2`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Contexte, objectifs…"
          className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Création…" : "Créer le projet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/media/projects")}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
