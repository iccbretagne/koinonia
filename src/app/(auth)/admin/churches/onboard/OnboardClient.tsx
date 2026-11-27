"use client";

import { SubmitEvent, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, buttonClasses } from "@/components/ui";
import { paths } from "@/lib/paths";

export default function OnboardClient() {
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

  async function handleSubmit(e: SubmitEvent) {
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
        <Alert
          tone="success"
          title="Église créée."
          action={
            <Link href={paths.admin.churches()} className={`${buttonClasses("secondary", "md")} self-start`}>
              Retour aux églises
            </Link>
          }
        >
          L&apos;église <strong>{name}</strong> a été créée.
          {adminEmail && (
            <>
              {" "}L&apos;utilisateur <strong>{adminEmail}</strong> recevra le rôle
              Admin à sa prochaine connexion.
            </>
          )}
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-md">
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
          hint="L'administrateur recevra automatiquement le rôle Admin pour cette église lors de sa prochaine connexion Google."
        />

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Création…" : "Créer l'église"}
          </Button>
          <Link href={paths.admin.churches()} className={buttonClasses("secondary", "md")}>
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
