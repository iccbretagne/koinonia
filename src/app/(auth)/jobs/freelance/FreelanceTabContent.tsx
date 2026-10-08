"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { buttonClasses } from "@/components/ui/button-classes";
import { changeJobStatus } from "../job-status";
type Author = { id: string; name: string | null; displayName: string | null; image: string | null };

type MissionStatus = "ACTIVE" | "FILLED" | "ARCHIVED";
type ProfileStatus = "ACTIVE" | "UNAVAILABLE" | "ARCHIVED";

type Mission = {
  id: string;
  title: string;
  domain: string;
  duration: string | null;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  description: string;
  status: string;
  createdAt: string;
  author: Author;
};

type FreelanceProfile = {
  id: string;
  title: string;
  domain: string;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  availableFrom: string | null;
  description: string;
  status: string;
  createdAt: string;
  author: Author;
};

const MISSION_STATUS_LABELS: Record<"ALL" | MissionStatus, string> = {
  ALL:      "Tout",
  ACTIVE:   "Actives",
  FILLED:   "Pourvues",
  ARCHIVED: "Archivées",
};

const PROFILE_STATUS_LABELS: Record<"ALL" | ProfileStatus, string> = {
  ALL:         "Tout",
  ACTIVE:      "Disponibles",
  UNAVAILABLE: "Indisponibles",
  ARCHIVED:    "Archivés",
};

const MODALITY_LABEL: Record<string, string> = {
  REMOTE: "Full remote",
  ONSITE: "Présentiel",
  HYBRID: "Hybride",
};

const MODALITY_COLOR: Record<string, string> = {
  REMOTE: "bg-info-soft text-info",
  ONSITE: "bg-warning-soft text-warning",
  HYBRID: "bg-brand-soft text-brand-text",
};

function AuthorAvatar({ author }: { readonly author: Author }) {
  const name = author.displayName ?? author.name ?? "?";
  return (
    <div className="flex items-center gap-1.5">
      {author.image ? (
        <Image src={author.image} alt={name} width={18} height={18} className="rounded-full" />
      ) : (
        <div className="w-[18px] h-[18px] rounded-full bg-brand/20 flex items-center justify-center text-[10px] font-bold text-brand-text">
          {name[0]}
        </div>
      )}
      <span className="text-ink-muted">{name}</span>
    </div>
  );
}

function RateBadges({ dailyRate, hourlyRate }: { readonly dailyRate: string | null; readonly hourlyRate: string | null }) {
  if (!dailyRate && !hourlyRate) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {dailyRate && (
        <span className="text-xs bg-success-soft text-success px-2 py-0.5 rounded-full font-medium">
          {dailyRate}/j
        </span>
      )}
      {hourlyRate && (
        <span className="text-xs bg-success-soft text-success px-2 py-0.5 rounded-full font-medium">
          {hourlyRate}/h
        </span>
      )}
    </div>
  );
}

function MissionCard({ mission, canManage }: { readonly mission: Mission; readonly canManage: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isArchived = mission.status === "ARCHIVED";
  const toggleLabel = isArchived ? "Republier" : "Retirer";

  async function toggleStatus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await changeJobStatus(`/api/jobs/freelance/missions/${mission.id}`, isArchived ? "ACTIVE" : "ARCHIVED", { setLoading, refresh: () => router.refresh() });
  }

  return (
    <Link
      href={`/jobs/freelance/missions/${mission.id}`}
      className={`block border-2 rounded-lg p-4 hover:border-brand/40 transition-colors ${isArchived ? "border-line opacity-60" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-ink leading-tight">{mission.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${MODALITY_COLOR[mission.modality]}`}>
          {MODALITY_LABEL[mission.modality]}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">{mission.domain}</span>
        {mission.duration && (
          <span className="text-xs text-ink-muted">· {mission.duration}</span>
        )}
        {mission.location && mission.modality !== "REMOTE" && (
          <span className="text-xs text-ink-muted">· {mission.location}</span>
        )}
        {mission.status === "FILLED" && (
          <span className="text-xs bg-success-soft text-success px-2 py-0.5 rounded-full">Pourvue</span>
        )}
        {isArchived && (
          <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">Archivée</span>
        )}
      </div>
      <RateBadges dailyRate={mission.dailyRate} hourlyRate={mission.hourlyRate} />
      <p className="text-sm text-ink-muted mt-2 line-clamp-2">{mission.description}</p>
      <div className="flex items-center justify-between mt-3 text-xs">
        <AuthorAvatar author={mission.author} />
        <span className="text-ink-subtle">{new Date(mission.createdAt).toLocaleDateString("fr-FR")}</span>
      </div>
      {canManage && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={toggleStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : toggleLabel}
          </button>
        </div>
      )}
    </Link>
  );
}

function FreelanceProfileCard({ profile, canManage }: { readonly profile: FreelanceProfile; readonly canManage: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isArchived = profile.status === "ARCHIVED";
  const toggleLabel = isArchived ? "Republier" : "Retirer";
  const availableLabel = profile.availableFrom
    ? `Dispo le ${new Date(profile.availableFrom).toLocaleDateString("fr-FR")}`
    : "Disponible";

  async function toggleStatus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await changeJobStatus(`/api/jobs/freelance/profiles/${profile.id}`, isArchived ? "ACTIVE" : "ARCHIVED", { setLoading, refresh: () => router.refresh() });
  }

  return (
    <Link
      href={`/jobs/freelance/profiles/${profile.id}`}
      className={`block border-2 rounded-lg p-4 hover:border-brand/40 transition-colors ${isArchived ? "border-line opacity-60" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-ink leading-tight">{profile.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${MODALITY_COLOR[profile.modality]}`}>
          {MODALITY_LABEL[profile.modality]}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">{profile.domain}</span>
        <span className="text-xs text-success font-medium">· {availableLabel}</span>
        {profile.location && profile.modality !== "REMOTE" && (
          <span className="text-xs text-ink-muted">· {profile.location}</span>
        )}
        {profile.status === "UNAVAILABLE" && (
          <span className="text-xs bg-warning-soft text-warning px-2 py-0.5 rounded-full">Indisponible</span>
        )}
        {isArchived && (
          <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">Archivé</span>
        )}
      </div>
      <RateBadges dailyRate={profile.dailyRate} hourlyRate={profile.hourlyRate} />
      <p className="text-sm text-ink-muted mt-2 line-clamp-2">{profile.description}</p>
      <div className="flex items-center justify-between mt-3 text-xs">
        <AuthorAvatar author={profile.author} />
        <span className="text-ink-subtle">{new Date(profile.createdAt).toLocaleDateString("fr-FR")}</span>
      </div>
      {canManage && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={toggleStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : toggleLabel}
          </button>
        </div>
      )}
    </Link>
  );
}

type SubFilter = "all" | "missions" | "profiles";

export default function FreelanceTabContent({
  missions,
  profiles,
  currentUserId: _currentUserId,
  canManage = false,
}: {
  readonly missions: Mission[];
  readonly profiles: FreelanceProfile[];
  readonly currentUserId: string;
  readonly canManage?: boolean;
}) {
  const [subFilter, setSubFilter] = useState<SubFilter>("all");
  const [missionStatusFilter, setMissionStatusFilter] = useState<"ALL" | MissionStatus>("ACTIVE");
  const [profileStatusFilter, setProfileStatusFilter] = useState<"ALL" | ProfileStatus>("ACTIVE");

  const showMissions  = subFilter === "all" || subFilter === "missions";
  const showProfiles  = subFilter === "all" || subFilter === "profiles";

  const filteredMissions = missions.filter(
    (m) => !canManage || missionStatusFilter === "ALL" || m.status === missionStatusFilter
  );
  const filteredProfiles = profiles.filter(
    (p) => !canManage || profileStatusFilter === "ALL" || p.status === profileStatusFilter
  );

  const filters: { id: SubFilter; label: string }[] = [
    { id: "all",      label: `Tout (${filteredMissions.length + filteredProfiles.length})` },
    { id: "missions", label: `Missions (${filteredMissions.length})` },
    { id: "profiles", label: `Disponibles (${filteredProfiles.length})` },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-6">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setSubFilter(f.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              subFilter === f.id
                ? "bg-brand text-on-brand"
                : "bg-surface-sunken text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showMissions && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
              Missions à pourvoir
            </h2>
            {canManage && (
              <div className="flex gap-1">
                {(["ALL", "ACTIVE", "FILLED", "ARCHIVED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setMissionStatusFilter(s)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border-2 transition-colors ${
                      missionStatusFilter === s
                        ? "border-brand text-brand-text bg-brand-soft"
                        : "border-line text-ink-muted hover:bg-surface-sunken"
                    }`}
                  >
                    {MISSION_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredMissions.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-line rounded-lg">
              <p className="text-ink-muted text-sm mb-3">Aucune mission pour le moment</p>
              <Link
                href="/jobs/freelance/missions/new"
                className={buttonClasses("primary", "sm")}
              >
                Proposer une mission →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMissions.map((m) => <MissionCard key={m.id} mission={m} canManage={canManage} />)}
            </div>
          )}
        </div>
      )}

      {showProfiles && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
              Freelances disponibles
            </h2>
            {canManage && (
              <div className="flex gap-1">
                {(["ALL", "ACTIVE", "UNAVAILABLE", "ARCHIVED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setProfileStatusFilter(s)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border-2 transition-colors ${
                      profileStatusFilter === s
                        ? "border-brand text-brand-text bg-brand-soft"
                        : "border-line text-ink-muted hover:bg-surface-sunken"
                    }`}
                  >
                    {PROFILE_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredProfiles.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-line rounded-lg">
              <p className="text-ink-muted text-sm mb-3">Aucun freelance disponible pour le moment</p>
              <Link
                href="/jobs/freelance/profiles/new"
                className={buttonClasses("primary", "sm")}
              >
                Proposer mes services →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProfiles.map((p) => <FreelanceProfileCard key={p.id} profile={p} canManage={canManage} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
