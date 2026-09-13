"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

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
  churchId: string;
  availableMembers: Member[];
  departments: Department[];
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

  async function handleSubmit(e: React.FormEvent) {
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
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6 bg-white rounded-lg shadow p-5">
      <Input
        label="Adresse e-mail Google attendue"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="prenom.nom@gmail.com"
        required
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "existing" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("existing")}
        >
          Lier une fiche STAR existante
        </Button>
        <Button
          type="button"
          variant={mode === "new" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("new")}
        >
          Créer une nouvelle fiche STAR
        </Button>
      </div>

      {mode === "existing" ? (
        <Select
          label="Fiche STAR"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="— Choisir —"
          options={availableMembers.map((m) => ({
            value: m.id,
            label: `${m.firstName} ${m.lastName}`,
          }))}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            label="Téléphone (optionnel)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Select
            label="Département"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="— Choisir —"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
        </div>
      )}

      {availableMembers.length === 0 && mode === "existing" && (
        <p className="text-xs text-gray-400">
          Aucune fiche STAR sans compte dans cette église — créez-en une nouvelle ci-dessus.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={!canSubmit || loading}>
          {loading ? "Création..." : "Créer l'utilisateur"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/users")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
