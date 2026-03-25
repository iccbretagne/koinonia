"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const FORMATS = [
  "Story Instagram",
  "Post carré (1:1)",
  "Bannière web",
  "Affiche A4",
  "Slide / Écran",
  "Logo",
  "Autre",
];

interface Props {
  churchId: string;
  sourceOptions: { type: "department" | "ministry"; id: string; label: string }[];
}

export default function StandaloneVisualForm({ churchId, sourceOptions }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sourceId, setSourceId] = useState(sourceOptions[0]?.id ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const source = sourceOptions.find((s) => s.id === sourceId);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          title,
          brief: brief || null,
          format: format || null,
          deadline: deadline || null,
          departmentId: source?.type === "department" ? source.id : null,
          ministryId: source?.type === "ministry" ? source.id : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Une erreur est survenue.");
        return;
      }

      router.push("/media/requests");
    } catch {
      setError("Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Input
        label="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Ex : Bannière formation leaders"
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="Description du besoin, couleurs, texte à inclure..."
          className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
        >
          <option value="">— Sélectionner —</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <Input
        label="Deadline souhaitée"
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />

      {sourceOptions.length > 1 && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Source</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
          >
            {sourceOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-icc-rouge">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Envoi..." : "Envoyer la demande"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/media/requests")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
