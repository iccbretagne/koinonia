"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

interface Church {
  id: string;
  name: string;
  slug: string;
  secretariatEmail: string;
  accountingEmail: string;
  primaryColor: string;
  responsibleProfileId: string;
  supervisorUserId: string;
}

interface Option {
  id: string;
  label: string;
}

interface Props {
  church: Church;
  profiles: Option[];
  supervisors: Option[];
}

export default function ChurchEditClient({ church, profiles, supervisors }: Props) {
  const router = useRouter();
  const [name, setName] = useState(church.name);
  const [slug, setSlug] = useState(church.slug);
  const [secretariatEmail, setSecretariatEmail] = useState(church.secretariatEmail);
  const [accountingEmail, setAccountingEmail] = useState(church.accountingEmail);
  const [primaryColor, setPrimaryColor] = useState(church.primaryColor || "#5E17EB");
  const [responsibleProfileId, setResponsibleProfileId] = useState(church.responsibleProfileId);
  const [supervisorUserId, setSupervisorUserId] = useState(church.supervisorUserId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
          secretariatEmail: secretariatEmail || null,
          accountingEmail: accountingEmail || null,
          primaryColor,
          responsibleProfileId: responsibleProfileId || null,
          supervisorUserId: supervisorUserId || null,
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
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
        />
        <Input
          label="Email secrétariat (digest planning)"
          type="email"
          value={secretariatEmail}
          onChange={(e) => setSecretariatEmail(e.target.value)}
          placeholder="secretariat@eglise.fr"
        />
        <Input
          label="Email comptabilité (réception des demandes)"
          type="email"
          value={accountingEmail}
          onChange={(e) => setAccountingEmail(e.target.value)}
          placeholder="comptabilite@eglise.fr"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Couleur principale (bandeau d&apos;entête)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-16 rounded border-2 border-gray-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#5E17EB"
              className="w-32 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-icc-violet"
            />
            <div
              className="h-10 w-24 rounded-lg border border-gray-200 shrink-0"
              style={{ backgroundColor: primaryColor }}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-3">Supervision pastorale</p>
          <div className="space-y-4">
            <Select
              label="Responsable pastoral de l'église"
              value={responsibleProfileId}
              onChange={(e) => setResponsibleProfileId(e.target.value)}
              options={profileOptions}
            />
            <Select
              label="Superviseur (pasteur superviseur)"
              value={supervisorUserId}
              onChange={(e) => setSupervisorUserId(e.target.value)}
              options={supervisorOptions}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Église mise à jour.</p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => router.push("/admin/churches")}
          >
            Retour
          </Button>
        </div>
      </form>
    </div>
  );
}
