"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FilterChip, Input, Select } from "@/components/ui";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

interface Department {
  id: string;
  name: string;
  ministryName: string;
}

interface Props {
  readonly churchId: string;
  readonly availableMembers: Member[];
  readonly departments: Department[];
}

type Mode = "existing" | "new";

export default function CreateUserClient({ churchId, availableMembers, departments }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("existing");
  const [email, setEmail] = useState("");
  const [memberId, setMemberId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit =
    email.trim().includes("@") &&
    (mode === "existing"
      ? memberId.length > 0
      : firstName.trim().length > 0 && lastName.trim().length > 0 && departmentId.length > 0);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    try {
      const body =
        mode === "existing"
          ? { churchId, memberId, email: email.trim(), confirmCreate: true }
          : {
              churchId,
              email: email.trim(),
              confirmCreate: true,
              newMember: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phone: phone.trim() || undefined,
                departmentId,
              },
            };

      const res = await fetch("/api/member-user-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");

      router.push("/admin/users");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-6">
      <Input
        label="Adresse e-mail Google attendue"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="prenom.nom@gmail.com"
        required
      />

      <div role="group" aria-label="Fiche STAR du compte" className="flex flex-wrap gap-2">
        <FilterChip pressed={mode === "existing"} onClick={() => setMode("existing")}>
          Lier une fiche STAR existante
        </FilterChip>
        <FilterChip pressed={mode === "new"} onClick={() => setMode("new")}>
          Créer une nouvelle fiche STAR
        </FilterChip>
      </div>

      {mode === "existing" ? (
        <Select
          label="Fiche STAR"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="Choisir une fiche"
          options={availableMembers.map((m) => ({
            value: m.id,
            label: `${m.firstName} ${m.lastName}`,
          }))}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Téléphone (facultatif)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Select
            label="Département"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="Choisir un département"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
        </div>
      )}

      {availableMembers.length === 0 && mode === "existing" && (
        <p className="text-[13px] leading-[18px] text-ink-muted">
          Aucune fiche STAR sans compte dans cette église — créez-en une nouvelle ci-dessus.
        </p>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={!canSubmit || loading}
          title={!canSubmit ? "Renseignez l'adresse e-mail et la fiche STAR" : undefined}
        >
          {loading ? "Création…" : "Créer l'utilisateur"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/users")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
