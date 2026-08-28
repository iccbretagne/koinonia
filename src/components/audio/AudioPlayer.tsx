"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import H5AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";
import "./audio-player-theme.css";
import Button from "@/components/ui/Button";
import { getResumePosition, saveProgress, clearProgress } from "@/lib/audio-progress";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const LISTEN_INTERVAL_MS = 5000; // throttle de l'écriture de la reprise (plan.md)

export interface AudioPlayerSegment {
  id: string;
  title: string;
  order: number;
  durationMs: number;
}

export interface AudioPlayerService {
  title: string | null;
  serviceDate: string;
  speaker: string | null;
  coverUrl: string | null;
  segments: AudioPlayerSegment[];
}

interface Props {
  service: AudioPlayerService;
  streamUrl: (segmentId: string) => string;
  onPlay?: (segmentId: string) => void;
  onShare?: (segmentId: string | null) => void;
  backHref?: string | null;
  backLabel?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ service, streamUrl, onPlay, onShare, backHref, backLabel }: Props) {
  const segments = service.segments;
  const [currentId, setCurrentId] = useState<string | null>(segments[0]?.id ?? null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [resumeOffer, setResumeOffer] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const playerRef = useRef<H5AudioPlayer>(null);
  const playReported = useRef(new Set<string>());

  const currentIndex = segments.findIndex((s) => s.id === currentId);
  const current = currentIndex >= 0 ? segments[currentIndex] : null;

  // Nouvelle séquence sélectionnée : proposer la reprise si une position notable existe,
  // sans jamais l'appliquer automatiquement (spec 021 : « proposée, jamais imposée »).
  useEffect(() => {
    setLoadError(false);
    if (!current) return;
    setResumeOffer(getResumePosition(current.id));
  }, [current]);

  // Vitesse de lecture appliquée à l'élément <audio> exposé par la librairie.
  useEffect(() => {
    const audio = playerRef.current?.audio.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate, current]);

  // Media Session API — écran verrouillé, casque Bluetooth (plan.md §UI).
  useEffect(() => {
    if (!current || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: service.speaker ?? undefined,
      album: service.title ?? undefined,
      artwork: service.coverUrl ? [{ src: service.coverUrl, sizes: "512x512" }] : undefined,
    });

    const audio = playerRef.current?.audio.current;
    navigator.mediaSession.setActionHandler("play", () => audio?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => goToOffset(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => goToOffset(1));
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audio) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 30);
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, service.speaker, service.title, service.coverUrl]);

  function goToOffset(offset: number) {
    if (currentIndex < 0) return;
    const next = segments[currentIndex + offset];
    if (next) setCurrentId(next.id);
  }

  function acceptResume() {
    const audio = playerRef.current?.audio.current;
    if (audio && resumeOffer !== null) audio.currentTime = resumeOffer;
    setResumeOffer(null);
  }

  function declineResume() {
    if (current) clearProgress(current.id);
    setResumeOffer(null);
  }

  function handlePlay() {
    if (!current) return;
    if (!playReported.current.has(current.id)) {
      playReported.current.add(current.id);
      onPlay?.(current.id);
    }
  }

  function handleListen() {
    const audio = playerRef.current?.audio.current;
    if (!current || !audio || !Number.isFinite(audio.duration)) return;
    saveProgress(current.id, audio.currentTime, audio.duration);
  }

  function handleEnded() {
    if (current) saveProgress(current.id, current.durationMs / 1000, current.durationMs / 1000);
    goToOffset(1);
  }

  function retry() {
    setLoadError(false);
    playerRef.current?.audio.current?.load();
  }

  const speedOptions = useMemo(
    () =>
      PLAYBACK_RATES.map((rate) => (
        <option key={rate} value={rate}>
          {rate}×
        </option>
      )),
    []
  );

  return (
    <div className="pb-28 md:pb-0">
      {backHref && (
        <div className="mb-4">
          <Link href={backHref}>
            <Button variant="secondary" size="sm">
              ← {backLabel ?? "Retour"}
            </Button>
          </Link>
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        {service.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.coverUrl} alt="" className="w-20 h-20 rounded-lg object-cover shadow shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 truncate">{service.title || "Enregistrement du culte"}</h1>
          <p className="text-sm text-gray-500">
            {new Date(service.serviceDate).toLocaleDateString("fr-FR")}
            {service.speaker && ` · ${service.speaker}`}
          </p>
        </div>
        {onShare && (
          <Button variant="secondary" size="sm" onClick={() => onShare(null)}>
            Partager
          </Button>
        )}
      </div>

      <ul className="bg-white rounded-xl shadow divide-y divide-gray-100 border-2 border-gray-100 overflow-hidden mb-4">
        {segments.map((seg) => (
          <li key={seg.id} className="flex items-center">
            <button
              onClick={() => setCurrentId(seg.id)}
              aria-current={seg.id === currentId ? "true" : undefined}
              className={`flex-1 flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50 min-h-[44px] ${
                seg.id === currentId ? "bg-icc-violet/5 font-medium text-icc-violet" : "text-gray-700"
              }`}
            >
              <span className="truncate pr-2">
                {seg.order + 1}. {seg.title}
              </span>
              <span className="text-gray-400 shrink-0">{formatDuration(seg.durationMs)}</span>
            </button>
            {onShare && (
              <button
                type="button"
                onClick={() => onShare(seg.id)}
                aria-label={`Partager la séquence ${seg.title}`}
                className="px-3 text-gray-400 hover:text-icc-violet min-h-[44px]"
              >
                ↗
              </button>
            )}
          </li>
        ))}
      </ul>

      {current && (
        <div className="fixed bottom-0 inset-x-0 md:static bg-white border-t-2 md:border-2 border-gray-100 md:rounded-xl shadow-lg md:shadow p-3 md:p-4 z-20">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-gray-900 text-sm truncate pr-2">{current.title}</p>
            <select
              aria-label="Vitesse de lecture"
              value={playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="text-xs border border-gray-300 rounded px-1.5 py-1 text-gray-600 shrink-0"
            >
              {speedOptions}
            </select>
          </div>

          {resumeOffer !== null && (
            <div className="flex items-center gap-2 mb-2 text-xs bg-icc-violet-light text-icc-violet rounded-lg px-3 py-2">
              <span className="flex-1">Reprendre à {formatDuration(resumeOffer * 1000)} ?</span>
              <button onClick={acceptResume} className="font-semibold underline">
                Reprendre
              </button>
              <button onClick={declineResume} className="underline">
                Depuis le début
              </button>
            </div>
          )}

          {loadError ? (
            <div className="flex items-center gap-2 text-sm text-icc-rouge py-2">
              <span className="flex-1">Impossible de charger l&apos;audio.</span>
              <Button variant="secondary" size="sm" onClick={retry}>
                Réessayer
              </Button>
            </div>
          ) : (
            <H5AudioPlayer
              ref={playerRef}
              key={current.id}
              src={streamUrl(current.id)}
              autoPlayAfterSrcChange={false}
              showJumpControls
              progressJumpSteps={{ backward: 15000, forward: 30000 }}
              showSkipControls
              onClickPrevious={() => goToOffset(-1)}
              onClickNext={() => goToOffset(1)}
              onPlay={handlePlay}
              onListen={handleListen}
              listenInterval={LISTEN_INTERVAL_MS}
              onEnded={handleEnded}
              onError={() => setLoadError(true)}
              layout="stacked-reverse"
              i18nAriaLabels={{
                player: "Lecteur audio",
                progressControl: "Position de lecture",
                volumeControl: "Volume",
                play: "Lire",
                pause: "Pause",
                rewind: "Reculer de 15 secondes",
                forward: "Avancer de 30 secondes",
                previous: "Séquence précédente",
                next: "Séquence suivante",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
