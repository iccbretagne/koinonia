"use client";

import { useState } from "react";
import type { DonePage } from "@/modules/planning";
import RequestQueue, { type TypeFilter } from "./RequestQueue";
import SecretariatDetail from "./SecretariatDetail";
import CommunicationDetail from "./CommunicationDetail";
import VisuelDetail, { type MediaProjectOption } from "./VisuelDetail";
import type { QueueItem } from "./queue-types";

/**
 * Files des trois équipes (spec 063) : chaque page serveur passe ses données, le composant client
 * branche le panneau de détail propre à l'équipe (les fonctions ne traversent pas la frontière
 * serveur/client).
 */

interface QueueData {
  readonly churchId: string;
  readonly open: QueueItem[];
  readonly done: DonePage;
  readonly doneCount: number;
}

const SECRETARIAT_FILTERS: TypeFilter[] = [
  { key: "announcements", label: "Annonces", types: ["DIFFUSION_INTERNE"] },
  { key: "events", label: "Événements", types: ["AJOUT_EVENEMENT", "MODIFICATION_EVENEMENT", "ANNULATION_EVENEMENT"] },
  { key: "planning", label: "Planning", types: ["MODIFICATION_PLANNING"] },
  { key: "access", label: "Accès", types: ["DEMANDE_ACCES"] },
];

export function SecretariatQueue({ data, canManage }: { readonly data: QueueData; readonly canManage: boolean }) {
  return (
    <RequestQueue
      churchId={data.churchId}
      fn="SECRETARIAT"
      initialOpen={data.open}
      initialDone={data.done}
      initialDoneCount={data.doneCount}
      doneLabel="Diffusée"
      typeFilters={SECRETARIAT_FILTERS}
      renderDetail={(item, ctx) => <SecretariatDetail key={item.id} item={item} ctx={ctx} canManage={canManage} />}
    />
  );
}

export function CommunicationQueue({ data }: { readonly data: QueueData }) {
  return (
    <RequestQueue
      churchId={data.churchId}
      fn="COMMUNICATION"
      initialOpen={data.open}
      initialDone={data.done}
      initialDoneCount={data.doneCount}
      doneLabel="Publiée"
      renderDetail={(item, ctx) => <CommunicationDetail key={item.id} item={item} ctx={ctx} />}
    />
  );
}

export function VisuelQueue({ data, projects: initialProjects }: { readonly data: QueueData; readonly projects: MediaProjectOption[] }) {
  const [projects, setProjects] = useState(initialProjects);
  return (
    <RequestQueue
      churchId={data.churchId}
      fn="PRODUCTION_MEDIA"
      initialOpen={data.open}
      initialDone={data.done}
      initialDoneCount={data.doneCount}
      doneLabel="Livré"
      renderDetail={(item, ctx) => (
        <VisuelDetail
          key={item.id}
          item={item}
          ctx={ctx}
          churchId={data.churchId}
          projects={projects}
          onProjectCreated={(project) => setProjects((prev) => [project, ...prev])}
        />
      )}
    />
  );
}
