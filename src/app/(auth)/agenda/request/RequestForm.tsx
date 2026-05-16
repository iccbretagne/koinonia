"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
  churchId: string;
  churchName: string;
  defaultFirstName: string;
  defaultLastName: string;
  defaultEmail: string;
  defaultIsStar?: string;
  defaultDepartment?: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"];
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"];
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"];
const DAYS = ["Mardi", "Dimanche"];

const inputCls = "w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet";

function RadioGroup({ name, options, value, onChange }: {
  name: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
          value === opt ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"
        }`}>
          <input type="radio" name={name} value={opt} checked={value === opt}
            onChange={() => onChange(opt)} className="sr-only" />
          {opt}
        </label>
      ))}
    </div>
  );
}

export default function RequestForm({ churchId, churchName, defaultFirstName, defaultLastName, defaultEmail, defaultIsStar = "", defaultDepartment = "" }: Props) {
  const [form, setForm] = useState({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    email: defaultEmail,
    phone: "",
    gender: "",
    ageRange: "",
    membershipDuration: "",
    isStar: defaultIsStar,
    department: defaultDepartment,
    motifs: [] as string[],
    preferredDay: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleMotif(motif: string) {
    setForm((f) => ({
      ...f,
      motifs: f.motifs.includes(motif) ? f.motifs.filter((m) => m !== motif) : [...f.motifs, motif],
    }));
    if (fieldErrors["motifs"]) setFieldErrors((e) => ({ ...e, motifs: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (!form.gender) errs.gender = "Veuillez sélectionner votre sexe";
    if (!form.ageRange) errs.ageRange = "Veuillez sélectionner votre tranche d'âge";
    if (!form.membershipDuration) errs.membershipDuration = "Veuillez sélectionner votre ancienneté";
    if (!form.isStar) errs.isStar = "Veuillez répondre à cette question";
    if (form.motifs.length === 0) errs.motifs = "Veuillez sélectionner au moins un motif";
    if (!form.preferredDay) errs.preferredDay = "Veuillez sélectionner un jour";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setGlobalError("Veuillez corriger les erreurs ci-dessous.");
      return;
    }

    setSubmitting(true);
    setGlobalError(null);

    const subject = form.motifs.join(", ");
    const message = [
      `Sexe : ${form.gender}`,
      `Tranche d'âge : ${form.ageRange}`,
      `À l'église depuis : ${form.membershipDuration}`,
      `STAR : ${form.isStar}${form.isStar === "Oui" && form.department ? ` — Département : ${form.department}` : ""}`,
    ].join("\n");

    try {
      const res = await fetch("/api/agenda/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          subject,
          message,
          preferredDays: form.preferredDay,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setGlobalError(d.error || "Une erreur est survenue. Veuillez réessayer.");
        return;
      }
      setSubmitted(true);
    } catch {
      setGlobalError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-6 sm:p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto text-2xl">✓</div>
        <h2 className="text-lg font-semibold text-gray-900">Demande envoyée !</h2>
        <p className="text-sm text-gray-600">
          Votre demande a bien été reçue. Un qualificateur la traitera prochainement et vous sera assigné un créneau.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">

      {/* Coordonnées */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Vos coordonnées</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input type="text" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
            <input type="text" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sexe *</label>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender} onChange={(v) => set("gender", v)} />
          {fieldErrors.gender && <p className="text-xs text-red-600 mt-1">{fieldErrors.gender}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
          <input type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adresse mail</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Profil */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Votre profil</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tranche d&apos;âge *</label>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange} onChange={(v) => set("ageRange", v)} />
          {fieldErrors.ageRange && <p className="text-xs text-red-600 mt-1">{fieldErrors.ageRange}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Depuis quand êtes-vous à {churchName} ? *
          </label>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration} onChange={(v) => set("membershipDuration", v)} />
          {fieldErrors.membershipDuration && <p className="text-xs text-red-600 mt-1">{fieldErrors.membershipDuration}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Êtes-vous STAR ? *</label>
          <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar} onChange={(v) => set("isStar", v)} />
          {fieldErrors.isStar && <p className="text-xs text-red-600 mt-1">{fieldErrors.isStar}</p>}
        </div>

        {form.isStar === "Oui" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dans quel département servez-vous ?</label>
            <input type="text" value={form.department} onChange={(e) => set("department", e.target.value)}
              placeholder="Ex : Choristes, Accueil, Son…" className={inputCls} />
          </div>
        )}
      </div>

      {/* Demande */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Votre demande</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pour quel motif sollicitez-vous un entretien ? *{" "}
            <span className="font-normal text-gray-400">(plusieurs choix possibles)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((motif) => (
              <label key={motif} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
                form.motifs.includes(motif) ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"
              }`}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          {fieldErrors.motifs && <p className="text-xs text-red-600 mt-1">{fieldErrors.motifs}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Choix du jour *</label>
          <RadioGroup name="preferredDay" options={DAYS} value={form.preferredDay} onChange={(v) => set("preferredDay", v)} />
          {fieldErrors.preferredDay && <p className="text-xs text-red-600 mt-1">{fieldErrors.preferredDay}</p>}
        </div>
      </div>

      {globalError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{globalError}</p>
      )}

      <Button type="submit" disabled={submitting} className="w-full py-3">
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>

      <p className="text-xs text-gray-400 text-center">* Champs obligatoires.</p>
    </form>
  );
}
