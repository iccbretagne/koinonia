"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Alert from "@/components/ui/Alert";
import Link from "next/link";

interface Church {
  id: string;
  name: string;
  slug: string;
  secretariatEmails: string[];
  accountingEmails: string[];
  primaryColor: string;
  responsibleProfileId: string;
  supervisorProfileId: string;
}

function parseEmailListInput(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[,;\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

interface Option {
  id: string;
  label: string;
}

interface Props {
  readonly church: Church;
  readonly profiles: Option[];
  readonly supervisors: Option[];
  /** Nom, adresse (slug) et superviseur : Super Admin seulement (`church:manage`). */
  readonly canEditIdentity: boolean;
}

const SUPER_ADMIN_ONLY = "Modifiable par un Super Admin uniquement.";

export default function ChurchEditClient({ church, profiles, supervisors, canEditIdentity }: Props) {
  const router = useRouter();
  const colorId = useId();
  const [name, setName] = useState(church.name);
  const [slug, setSlug] = useState(church.slug);
  const [secretariatEmails, setSecretariatEmails] = useState(church.secretariatEmails.join("\n"));
  const [accountingEmails, setAccountingEmails] = useState(church.accountingEmails.join("\n"));
  const [primaryColor, setPrimaryColor] = useState(church.primaryColor || "#5E17EB");
  const [responsibleProfileId, setResponsibleProfileId] = useState(church.responsibleProfileId);
  const [supervisorProfileId, setSupervisorProfileId] = useState(church.supervisorProfileId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/churches/${church.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          secretariatEmails: parseEmailListInput(secretariatEmails),
          accountingEmails: parseEmailListInput(accountingEmails),
          primaryColor,
          responsibleProfileId: responsibleProfileId || null,
          supervisorProfileId: supervisorProfileId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const profileOptions = [
    { value: "", label: "— Aucun —" },
    ...profiles.map((p) => ({ value: p.id, label: p.label })),
  ];

  const supervisorOptions = [
    { value: "", label: "— Aucun —" },
    ...supervisors.map((s) => ({ value: s.id, label: s.label })),
  ];

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={!canEditIdentity}
          hint={canEditIdentity ? undefined : SUPER_ADMIN_ONLY}
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          disabled={!canEditIdentity}
          hint={canEditIdentity ? undefined : `Adresse des pages publiques de l'église. ${SUPER_ADMIN_ONLY}`}
        />
        <Textarea
          label="Emails secrétariat (digest planning, un par ligne)"
          value={secretariatEmails}
          onChange={(e) => setSecretariatEmails(e.target.value)}
          placeholder={"secretariat@eglise.fr\nbackup@eglise.fr"}
        />
        <Textarea
          label="Emails comptabilité (réception des demandes, un par ligne)"
          value={accountingEmails}
          onChange={(e) => setAccountingEmails(e.target.value)}
          placeholder={"comptabilite@eglise.fr\nresponsable@eglise.fr"}
        />
        <div>
          <label htmlFor={`${colorId}-color`} className="block text-sm font-medium text-ink-muted mb-1">
            Couleur principale (bandeau d&apos;entête)
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${colorId}-color`}
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-16 rounded border border-line cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#5E17EB"
              className="w-32 border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
            <div
              className="h-10 w-24 rounded-lg border border-line shrink-0"
              style={{ backgroundColor: primaryColor }}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-line">
          <p className="text-xs text-ink-muted mb-3">Supervision pastorale</p>
          <div className="space-y-4">
            <Select
              label="Responsable pastoral de l'église"
              value={responsibleProfileId}
              onChange={(e) => setResponsibleProfileId(e.target.value)}
              options={profileOptions}
            />
            {profiles.length === 0 && (
              <Alert
                tone="info"
                title="Aucun profil pastoral dans cette église."
                action={
                  <Link
                    href={canEditIdentity ? `/admin/pastoral-profiles?churchId=${church.id}` : "/admin/pastoral-profiles"}
                    className="text-sm font-semibold text-brand underline"
                  >
                    Créer un profil pastoral pour {church.name}
                  </Link>
                }
              >
                Les profils pastoraux sont propres à chaque église : le responsable se choisit parmi
                ceux de {church.name}.
              </Alert>
            )}
            <Select
              label="Superviseur (pasteur superviseur)"
              value={supervisorProfileId}
              onChange={(e) => setSupervisorProfileId(e.target.value)}
              options={supervisorOptions}
              disabled={!canEditIdentity}
              hint={canEditIdentity ? undefined : SUPER_ADMIN_ONLY}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {success && (
          <p className="text-sm text-success">Église mise à jour.</p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Button>
          {canEditIdentity && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => router.push("/admin/churches")}
            >
              Retour
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
