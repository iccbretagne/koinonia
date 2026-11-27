"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, buttonClasses, controlClasses, Input, Select, Textarea } from "@/components/ui";
import Link from "next/link";
import { churchLogoSrc } from "@/modules/core/schemas";
import ChurchLogoSlot from "./ChurchLogoSlot";

interface Church {
  id: string;
  name: string;
  slug: string;
  secretariatEmails: string[];
  accountingEmails: string[];
  primaryColor: string;
  responsibleProfileId: string;
  supervisorProfileId: string;
  /** Versions des logos (spec 072), `null` sans logo. */
  logoVersions: { light: string | null; dark: string | null };
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
  const [logoLight, setLogoLight] = useState(church.logoVersions.light);
  const [logoDark, setLogoDark] = useState(church.logoVersions.dark);

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
    { value: "", label: "Aucun responsable" },
    ...profiles.map((p) => ({ value: p.id, label: p.label })),
  ];

  const supervisorOptions = [
    { value: "", label: "Aucun superviseur" },
    ...supervisors.map((s) => ({ value: s.id, label: s.label })),
  ];

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <label htmlFor={`${colorId}-color`} className="mb-1 block text-sm font-semibold text-ink">
            Couleur principale (bandeau d&apos;entête)
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${colorId}-color`}
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-11 w-16 cursor-pointer rounded-control border border-control-line p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <input
              type="text"
              aria-label="Code hexadécimal de la couleur principale"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#5E17EB"
              className={`${controlClasses()} w-32 font-mono`}
            />
            <div
              aria-hidden="true"
              className="h-11 w-24 shrink-0 rounded-control border border-line"
              style={{ backgroundColor: primaryColor }}
            />
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <h2 className="mb-3 font-display text-[17px] font-semibold leading-6 text-ink">Supervision pastorale</h2>
          <div className="flex flex-col gap-4">
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
                    className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`}
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

        {error && <Alert tone="danger">{error}</Alert>}
        {success && (
          <Alert tone="success">Église mise à jour.</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {canEditIdentity && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => router.push("/admin/churches")}
            >
              Revenir aux églises
            </Button>
          )}
        </div>
      </form>

      <section aria-labelledby={`${colorId}-logo`} className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
        <div>
          <h2 id={`${colorId}-logo`} className="font-display text-[17px] font-semibold leading-6 text-ink">
            Logo de l&apos;église
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Affiché dans la barre latérale et la barre du haut, pour tous ceux qui travaillent dans{" "}
            {church.name}. PNG, JPEG ou WebP, 2 Mo au plus. Enregistré dès le dépôt.
          </p>
        </div>
        <ChurchLogoSlot churchId={church.id} variant="light" version={logoLight} fallbackSrc={null} onChange={setLogoLight} />
        <ChurchLogoSlot
          churchId={church.id}
          variant="dark"
          version={logoDark}
          fallbackSrc={logoLight ? churchLogoSrc(church.id, "light", logoLight) : null}
          onChange={setLogoDark}
        />
      </section>
    </div>
  );
}
