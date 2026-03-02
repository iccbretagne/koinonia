"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function OnboardClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/churches/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, adminEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-md">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">
            Église créée avec succès
          </h2>
          <p className="text-sm text-green-700 mb-4">
            L&apos;église <strong>{name}</strong> a été créée.
            {adminEmail && (
              <>
                {" "}L&apos;utilisateur <strong>{adminEmail}</strong> recevra le rôle
                Admin à sa prochaine connexion.
              </>
            )}
          </p>
          <Button onClick={() => router.push("/admin/churches")}>
            Retour aux églises
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <p className="text-sm text-gray-500 mb-6">
        Créez une nouvelle église et assignez un administrateur.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nom de l'église"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ex: ICC Rennes"
          required
        />
        <Input
          label="Identifiant (slug)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Ex: icc-rennes"
          required
        />
        <Input
          label="Email de l'administrateur"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@example.com"
        />
        <p className="text-xs text-gray-400">
          L&apos;administrateur recevra automatiquement le rôle ADMIN pour cette
          église lors de sa prochaine connexion Google.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Création..." : "Créer l'église"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => router.push("/admin/churches")}
          >
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}
