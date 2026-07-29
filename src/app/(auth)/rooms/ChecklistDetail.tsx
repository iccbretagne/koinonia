"use client";

import { ReactNode } from "react";

export interface Checklist {
  status: "PENDING" | "OPENED" | "CLOSED_DECLARED" | "VALIDATED" | "ISSUE_REPORTED";
  openedAt: string | null;
  keyReceivedFromName: string | null;
  openingNotes: string | null;
  closedAt: string | null;
  closedProperly: boolean | null;
  cleaned: boolean | null;
  equipmentOk: boolean | null;
  equipmentNotes: string | null;
  keyReturnedToName: string | null;
  closingNotes: string | null;
  incidentNotes: string | null;
  closedWithoutDeclaration: boolean;
  validatedAt: string | null;
  validatedClosedProperly: boolean | null;
  validatedCleaned: boolean | null;
  validatedEquipmentOk: boolean | null;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function yesNo(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Oui" : "Non";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 text-right">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</h3>
      <dl className="space-y-1 bg-gray-50 rounded-lg p-3 text-sm">{children}</dl>
    </div>
  );
}

/** Affichage en lecture seule du détail complet d'une main courante — aucune action. */
export default function ChecklistDetail({ checklist }: { checklist: Checklist | null }) {
  return (
    <div className="space-y-3">
      <Section title="Ouverture">
        {checklist?.openedAt ? (
          <>
            <Field label="Heure" value={formatDateTime(checklist.openedAt)} />
            <Field label="Clés reçues de" value={checklist.keyReceivedFromName ?? "—"} />
            {checklist.openingNotes && (
              <p className="text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-200 mt-1">{checklist.openingNotes}</p>
            )}
          </>
        ) : (
          <p className="text-gray-400 italic">Non renseigné</p>
        )}
      </Section>

      <Section title="Fermeture">
        {checklist?.closedAt ? (
          <>
            <Field label="Heure" value={formatDateTime(checklist.closedAt)} />
            <Field label="Salle fermée correctement" value={yesNo(checklist.closedProperly)} />
            <Field label="Salle nettoyée" value={yesNo(checklist.cleaned)} />
            <Field label="Salle/matériel en bon état" value={yesNo(checklist.equipmentOk)} />
            <Field label="Clés remises à" value={checklist.keyReturnedToName ?? "—"} />
            {checklist.equipmentNotes && (
              <p className="text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-200 mt-1">
                Matériel : {checklist.equipmentNotes}
              </p>
            )}
            {checklist.closingNotes && (
              <p className="text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-200 mt-1">{checklist.closingNotes}</p>
            )}
          </>
        ) : (
          <p className="text-gray-400 italic">Non renseigné</p>
        )}
      </Section>

      <Section title="Contrôle">
        {checklist?.validatedAt ? (
          <>
            <Field label="Heure" value={formatDateTime(checklist.validatedAt)} />
            <Field label="Constaté : fermée correctement" value={yesNo(checklist.validatedClosedProperly)} />
            <Field label="Constaté : nettoyée" value={yesNo(checklist.validatedCleaned)} />
            <Field label="Constaté : salle/matériel en bon état" value={yesNo(checklist.validatedEquipmentOk)} />
            {checklist.closedWithoutDeclaration && (
              <p className="text-xs text-yellow-700 pt-1 border-t border-gray-200 mt-1">
                Traité sans déclaration préalable de l&apos;utilisateur.
              </p>
            )}
            {checklist.incidentNotes && (
              <p className="text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-200 mt-1">
                Écart : {checklist.incidentNotes}
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-400 italic">Non renseigné</p>
        )}
      </Section>
    </div>
  );
}
