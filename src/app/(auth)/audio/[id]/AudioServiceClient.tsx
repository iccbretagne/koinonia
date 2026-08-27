"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import SequenceListEditor, { type SourceSummary, type SegmentSummary } from "./SequenceListEditor";
import PublishModal, { type PublishSegmentSummary } from "./PublishModal";

// Doit correspondre à AUDIO_UPLOAD_PART_SIZE (src/modules/audio/services/upload.ts) — dupliqué
// ici plutôt qu'importé pour ne pas tirer le SDK S3 (modules/storage) dans le bundle client.
const PART_SIZE = 8 * 1024 * 1024;

const TEMPLATE_NAMES_FALLBACK = ["Louange", "Prédication", "Prière", "Annonces"];


interface PendingUpload {
  filename: string;
  size: number;
  partUrls: string[];
  completedParts: Record<number, string>;
}

function pendingKey(serviceId: string): string {
  return `audio-upload:${serviceId}`;
}

function readPending(serviceId: string): Record<string, PendingUpload> {
  try {
    const raw = localStorage.getItem(pendingKey(serviceId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePending(serviceId: string, data: Record<string, PendingUpload>) {
  try {
    localStorage.setItem(pendingKey(serviceId), JSON.stringify(data));
  } catch {
    // localStorage indisponible (navigation privée, quota) — la reprise ne sera pas proposée
  }
}

interface ServiceData {
  id: string;
  status: "DRAFT" | "PENDING_REVIEW" | "READY" | "PUBLISHED" | "UNPUBLISHED";
  serviceDate: string;
  title: string | null;
  speaker: string | null;
  sources: (SourceSummary & { kind: string })[];
  segments: (SegmentSummary & { hasRendition: boolean; lufs: number | null; truePeakDb: number | null })[];
  failedRenders: { id: string; error: string | null; segmentId: string }[];
  pendingRenderCount: number;
  shareUrl: string | null;
}

interface FileUploadState {
  key: string;
  filename: string;
  totalParts: number;
  uploadedParts: number;
  status: "signing" | "uploading" | "completing" | "done" | "error";
  error?: string;
}

export default function AudioServiceClient({
  service,
  templateNames,
}: {
  service: ServiceData;
  templateNames: string[];
}) {
  const router = useRouter();
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const [publishModal, setPublishModal] = useState<"publish" | "unpublish" | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Aligné sur EDITABLE_SERVICE_STATUSES (module audio) : tant que le culte n'est pas publié,
  // la régie peut corriger son dépôt — y compris depuis READY après un rendu en échec.
  const canDeposit = service.status !== "PUBLISHED";
  const hasFailedRenders = service.failedRenders.length > 0;
  // `status === "READY"` seul ne suffit pas : après suppression d'une source en échec puis
  // redépôt, le statut reste READY mais aucun job n'est plus PENDING/RUNNING tant que
  // « Publier » n'a pas été recliqué — se fier au statut bloquait alors le bouton sur « rendu
  // déjà en cours » sans qu'aucun rendu ne tourne réellement (retour terrain).
  const rendering = service.pendingRenderCount > 0;
  const renderedCount = service.segments.filter((s) => s.hasRendition).length;

  // Le rendu (worker hors Next.js, ADR-0007) est asynchrone — sans ce polling, l'écran reste
  // figé sur « READY » sans qu'aucune information ne permette de savoir si le rendu avance,
  // ce qui a été rapporté comme « aucune information d'avancement sur le rendu ». S'arrête
  // dès que le statut quitte READY (job worker terminé → PUBLISHED, ou dépublié entretemps).
  useEffect(() => {
    if (!rendering) return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [rendering, router]);

  const titleForSegment = (segmentId: string) =>
    service.segments.find((s) => s.id === segmentId)?.title ?? "séquence inconnue";

  function updateUpload(key: string, patch: Partial<FileUploadState>) {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function uploadOneFile(file: File) {
    const key = `${file.name}-${file.size}-${Date.now()}`;
    setUploads((prev) => [
      ...prev,
      { key, filename: file.name, totalParts: 0, uploadedParts: 0, status: "signing" },
    ]);

    try {
      const signRes = await fetch(`/api/audio/services/${service.id}/upload/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "SEQUENCE",
          filename: file.name,
          contentType: file.type || "audio/mpeg",
          size: file.size,
        }),
      });
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la signature d'upload");
      }
      const { source, partUrls } = (await signRes.json()) as {
        source: { id: string };
        partUrls: string[];
      };

      updateUpload(key, { totalParts: partUrls.length, status: "uploading" });

      const pending = readPending(service.id);
      pending[source.id] = { filename: file.name, size: file.size, partUrls, completedParts: {} };
      writePending(service.id, pending);

      await uploadParts(service.id, source.id, file, partUrls, (uploadedParts) =>
        updateUpload(key, { uploadedParts })
      );

      updateUpload(key, { status: "completing" });
      await completeUpload(service.id, source.id, partUrls.length);

      updateUpload(key, { status: "done" });
      router.refresh();
    } catch (err) {
      updateUpload(key, { status: "error", error: err instanceof Error ? err.message : "Erreur inconnue" });
      // Même en erreur, l'état côté serveur a pu changer (source créée avant l'échec d'une étape
      // suivante, dépôt marqué PENDING_REVIEW…) — sans ce refresh, l'écran reste sur les données
      // chargées avant le dépôt et ne reflète pas ce qui a réellement été enregistré.
      router.refresh();
    }
  }

  async function uploadParts(
    serviceId: string,
    sourceId: string,
    file: File,
    partUrls: string[],
    onProgress: (uploadedParts: number) => void,
    startFrom = 0
  ) {
    for (let i = startFrom; i < partUrls.length; i++) {
      const start = i * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const chunk = file.slice(start, end);

      const putRes = await fetch(partUrls[i], { method: "PUT", body: chunk });
      if (!putRes.ok) throw new Error(`Échec de l'envoi de la part ${i + 1}/${partUrls.length}`);
      // Nécessite que le bucket S3 expose l'en-tête ETag en réponse au navigateur (CORS
      // ExposeHeaders) — sans quoi la complétion multipart échouera côté serveur.
      const etag = putRes.headers.get("etag");
      if (!etag) throw new Error("ETag manquant dans la réponse S3 (vérifier la config CORS du bucket)");

      const pending = readPending(serviceId);
      if (pending[sourceId]) {
        pending[sourceId].completedParts[i + 1] = etag;
        writePending(serviceId, pending);
      }

      onProgress(i + 1);
    }
  }

  async function completeUpload(serviceId: string, sourceId: string, totalParts: number) {
    const pending = readPending(serviceId);
    const entry = pending[sourceId];
    const parts = Array.from({ length: totalParts }, (_, i) => ({
      partNumber: i + 1,
      etag: entry?.completedParts[i + 1] ?? "",
    }));

    const completeRes = await fetch(`/api/audio/services/${serviceId}/upload/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, parts }),
    });
    if (!completeRes.ok) {
      const body = await completeRes.json().catch(() => ({}));
      throw new Error(body.error ?? "Échec de la complétion de l'upload");
    }

    delete pending[sourceId];
    writePending(serviceId, pending);
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => uploadOneFile(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Reprise après coupure (spec §1 cas limites) : un upload interrompu par une erreur réseau
  // dans la session en cours peut retenter directement, `listUploadedParts` (T002) permettant
  // au serveur de vérifier ce qui est déjà reçu. Le navigateur ne peut pas ré-ouvrir seul le
  // fichier local après un rechargement de page (aucune API standard ne le permet) : dans ce
  // cas, l'utilisateur redépose le fichier — l'ancienne AudioSource incomplète (retrouvée ici
  // via localStorage) est signalée pour qu'il puisse l'ignorer explicitement.
  const [interrupted, setInterrupted] = useState<{ sourceId: string; filename: string }[]>([]);
  useEffect(() => {
    const pending = readPending(service.id);
    const incomplete = service.sources.filter((s) => s.uploadStatus === "PENDING" && pending[s.id]);
    setInterrupted(incomplete.map((s) => ({ sourceId: s.id, filename: pending[s.id].filename })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dismissing, setDismissing] = useState<string | null>(null);

  // « Ignorer » ne faisait qu'oublier le suivi local (localStorage) : la source incomplète
  // restait en base et réapparaissait, sans titre, dans « Nommer et ordonner » — perçu comme
  // « aucune option pour supprimer un dépôt non terminé » (retour terrain). On supprime
  // maintenant réellement la source côté serveur.
  async function dismissInterrupted(sourceId: string) {
    setDismissing(sourceId);
    try {
      await fetch(`/api/audio/services/${service.id}/sources/${sourceId}`, { method: "DELETE" });
      const pending = readPending(service.id);
      delete pending[sourceId];
      writePending(service.id, pending);
      setInterrupted((prev) => prev.filter((r) => r.sourceId !== sourceId));
      router.refresh();
    } finally {
      setDismissing(null);
    }
  }

  async function deleteService() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/audio/services/${service.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la suppression");
      }
      router.push("/audio");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur inconnue");
      setDeleting(false);
    }
  }

  const visibleUploads = uploads.filter((u) => u.status !== "done");

  const publishSegments: PublishSegmentSummary[] = service.segments.map((s) => ({
    id: s.id,
    title: s.title,
    hasRendition: s.hasRendition,
    lufs: s.lufs,
    truePeakDb: s.truePeakDb,
  }));

  async function copyShareUrl() {
    if (!service.shareUrl) return;
    await navigator.clipboard.writeText(new URL(service.shareUrl, window.location.origin).toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <Link href="/audio">
        <Button variant="secondary" size="sm">
          ← File d&apos;attente
        </Button>
      </Link>

      {service.shareUrl && (
        <section className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Lien d&apos;écoute</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={service.shareUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 text-sm text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5"
            />
            <Button variant="secondary" onClick={copyShareUrl}>
              {copied ? "Copié !" : "Copier le lien"}
            </Button>
            <a href={service.shareUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">Ouvrir ↗</Button>
            </a>
          </div>
        </section>
      )}

      {hasFailedRenders && (
        <section className="border-2 border-icc-rouge bg-red-50 rounded-lg p-4">
          <p className="text-sm text-gray-900 font-medium">
            Le rendu a échoué pour {service.failedRenders.length} séquence
            {service.failedRenders.length > 1 ? "s" : ""} — la publication est interrompue.
          </p>
          <ul className="mt-2 space-y-1">
            {service.failedRenders.map((j) => (
              <li key={j.id} className="text-xs text-gray-700">
                <span className="font-medium">{titleForSegment(j.segmentId)}</span>
                {j.error && <span> — {j.error}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-600 mt-2">
            « The specified key does not exist » signifie que le fichier n&apos;est pas arrivé jusqu&apos;au
            stockage : son dépôt a été interrompu. Supprimez la séquence concernée ci-dessous et redéposez-la,
            puis relancez la publication.
          </p>
        </section>
      )}

      {rendering && (
        <section className="border-2 border-icc-bleu bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-800 font-medium">
            Rendu en cours : {renderedCount}/{service.segments.length} séquence
            {service.segments.length > 1 ? "s" : ""} prête{service.segments.length > 1 ? "s" : ""}.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Le niveau sonore de chaque séquence est normalisé par un traitement en arrière-plan — cette page se
            met à jour automatiquement. Le culte sera publié dès que toutes les séquences seront prêtes.
          </p>
        </section>
      )}

      {canDeposit && (
        <section className="border-2 border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Dépôt des séquences</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="block text-sm text-gray-600"
          />

          {interrupted.length > 0 && (
            <ul className="mt-3 space-y-1">
              {interrupted.map((r) => (
                <li key={r.sourceId} className="text-sm flex items-center gap-2">
                  <span className="text-amber-700">Upload interrompu : {r.filename} — redéposez ce fichier.</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => dismissInterrupted(r.sourceId)}
                    disabled={dismissing === r.sourceId}
                  >
                    {dismissing === r.sourceId ? "Suppression..." : "Supprimer ce dépôt"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* Une fois terminé, le fichier apparaît dans « Nommer et ordonner » ci-dessous — le
              retirer d'ici évite de l'afficher deux fois (progression + liste nommée). */}
          {visibleUploads.length > 0 && (
            <ul className="mt-3 space-y-2">
              {visibleUploads.map((u) => (
                <li key={u.key} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">{u.filename}</span>
                    <span className="text-gray-500">
                      {u.status === "done"
                        ? "Terminé"
                        : u.status === "error"
                          ? "Erreur"
                          : u.status === "completing"
                            ? "Finalisation..."
                            : `${u.uploadedParts}/${u.totalParts || "?"} parts`}
                    </span>
                  </div>
                  {u.totalParts > 0 && u.status === "uploading" && (
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-icc-violet"
                        style={{ width: `${(100 * u.uploadedParts) / u.totalParts}%` }}
                      />
                    </div>
                  )}
                  {u.error && <p className="text-icc-rouge text-xs mt-1">{u.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="border-2 border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Nommer et ordonner les séquences</h2>
        <SequenceListEditor
          serviceId={service.id}
          sources={service.sources.filter((s) => s.kind === "SEQUENCE")}
          segments={service.segments}
          templateNames={templateNames.length > 0 ? templateNames : TEMPLATE_NAMES_FALLBACK}
        />
      </section>

      {service.status !== "PUBLISHED" && (
        <section className="space-y-1">
          <Button
            onClick={() => setPublishModal("publish")}
            disabled={service.segments.length === 0 || rendering}
            title={
              service.segments.length === 0
                ? "Enregistrez d'abord l'ordre et les noms des séquences"
                : rendering
                  ? "Rendu déjà en cours — inutile de republier avant qu'il ne se termine"
                  : undefined
            }
          >
            Publier
          </Button>
          {/* Le bouton reste désactivé tant qu'aucune séquence n'est enregistrée — sans ce message,
              un clic ne produit aucune requête ni retour visible, ce qui a été rapporté comme
              « rien ne se passe » alors que le formulaire de nommage n'avait pas été enregistré. */}
          {!rendering && service.segments.length === 0 && (
            <p className="text-xs text-amber-700">
              Cliquez d&apos;abord sur « Enregistrer l&apos;ordre et les noms » ci-dessus pour pouvoir publier.
            </p>
          )}
        </section>
      )}

      {/* Actions destructrices/irréversibles regroupées à part — pas au même niveau visuel que
          Publier, pour ne pas pouvoir les déclencher par inadvertance (spec 020). */}
      <section className="border-2 border-icc-rouge/30 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold text-icc-rouge">Zone de danger</h2>
        {service.status === "PUBLISHED" ? (
          <div className="space-y-1">
            <Button variant="danger" onClick={() => setPublishModal("unpublish")}>
              Dépublier
            </Button>
            <p className="text-xs text-gray-600">
              Le lien d&apos;écoute ci-dessus cessera de fonctionner pour toute personne qui l&apos;a déjà reçu.
            </p>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            Supprimer cet enregistrement
          </Button>
        )}
      </section>

      {publishModal && (
        <PublishModal
          serviceId={service.id}
          open={!!publishModal}
          onClose={() => setPublishModal(null)}
          segments={publishSegments}
          action={publishModal}
        />
      )}

      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Supprimer ce culte">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Le dépôt, les séquences nommées et les rendus déjà calculés seront définitivement supprimés. Cette
            action est irréversible.
          </p>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="danger" onClick={deleteService} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer définitivement"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
