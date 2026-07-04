"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Author = { id: string; name: string | null; displayName: string | null; image: string | null };

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
  createdAt: string;
  author: Author;
};

const MODALITY_LABEL: Record<string, string> = {
  REMOTE: "Full remote",
  ONSITE: "Présentiel",
  HYBRID: "Hybride",
};

const MODALITY_COLOR: Record<string, string> = {
  REMOTE: "bg-blue-100 text-blue-700",
  ONSITE: "bg-orange-100 text-orange-700",
  HYBRID: "bg-purple-100 text-purple-700",
};

function AuthorAvatar({ author }: { author: Author }) {
  const name = author.displayName ?? author.name ?? "?";
  return (
    <div className="flex items-center gap-1.5">
      {author.image ? (
        <Image src={author.image} alt={name} width={18} height={18} className="rounded-full" />
      ) : (
        <div className="w-[18px] h-[18px] rounded-full bg-icc-violet/20 flex items-center justify-center text-[10px] font-bold text-icc-violet">
          {name[0]}
        </div>
      )}
      <span className="text-gray-500">{name}</span>
    </div>
  );
}

function RateBadges({ dailyRate, hourlyRate }: { dailyRate: string | null; hourlyRate: string | null }) {
  if (!dailyRate && !hourlyRate) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {dailyRate && (
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          {dailyRate}/j
        </span>
      )}
      {hourlyRate && (
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          {hourlyRate}/h
        </span>
      )}
    </div>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  return (
    <Link href={`/jobs/freelance/missions/${mission.id}`} className="block border-2 border-gray-200 rounded-lg p-4 hover:border-icc-violet/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 leading-tight">{mission.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${MODALITY_COLOR[mission.modality]}`}>
          {MODALITY_LABEL[mission.modality]}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{mission.domain}</span>
        {mission.duration && (
          <span className="text-xs text-gray-500">· {mission.duration}</span>
        )}
        {mission.location && mission.modality !== "REMOTE" && (
          <span className="text-xs text-gray-500">· {mission.location}</span>
        )}
      </div>
      <RateBadges dailyRate={mission.dailyRate} hourlyRate={mission.hourlyRate} />
      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{mission.description}</p>
      <div className="flex items-center justify-between mt-3 text-xs">
        <AuthorAvatar author={mission.author} />
        <span className="text-gray-400">{new Date(mission.createdAt).toLocaleDateString("fr-FR")}</span>
      </div>
    </Link>
  );
}

function FreelanceProfileCard({ profile }: { profile: FreelanceProfile }) {
  const availableLabel = profile.availableFrom
    ? `Dispo le ${new Date(profile.availableFrom).toLocaleDateString("fr-FR")}`
    : "Disponible";

  return (
    <Link href={`/jobs/freelance/profiles/${profile.id}`} className="block border-2 border-gray-200 rounded-lg p-4 hover:border-icc-violet/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 leading-tight">{profile.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${MODALITY_COLOR[profile.modality]}`}>
          {MODALITY_LABEL[profile.modality]}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{profile.domain}</span>
        <span className="text-xs text-green-600 font-medium">· {availableLabel}</span>
        {profile.location && profile.modality !== "REMOTE" && (
          <span className="text-xs text-gray-500">· {profile.location}</span>
        )}
      </div>
      <RateBadges dailyRate={profile.dailyRate} hourlyRate={profile.hourlyRate} />
      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{profile.description}</p>
      <div className="flex items-center justify-between mt-3 text-xs">
        <AuthorAvatar author={profile.author} />
        <span className="text-gray-400">{new Date(profile.createdAt).toLocaleDateString("fr-FR")}</span>
      </div>
    </Link>
  );
}

type SubFilter = "all" | "missions" | "profiles";

export default function FreelanceTabContent({
  missions,
  profiles,
  currentUserId: _currentUserId,
}: {
  missions: Mission[];
  profiles: FreelanceProfile[];
  currentUserId: string;
}) {
  const [subFilter, setSubFilter] = useState<SubFilter>("all");

  const showMissions  = subFilter === "all" || subFilter === "missions";
  const showProfiles  = subFilter === "all" || subFilter === "profiles";

  const filters: { id: SubFilter; label: string }[] = [
    { id: "all",      label: `Tout (${missions.length + profiles.length})` },
    { id: "missions", label: `Missions (${missions.length})` },
    { id: "profiles", label: `Disponibles (${profiles.length})` },
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
                ? "bg-icc-violet text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showMissions && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Missions à pourvoir
          </h2>
          {missions.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-500 text-sm mb-3">Aucune mission pour le moment</p>
              <Link
                href="/jobs/freelance/missions/new"
                className="text-sm text-icc-violet font-medium hover:underline"
              >
                Proposer une mission →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((m) => <MissionCard key={m.id} mission={m} />)}
            </div>
          )}
        </div>
      )}

      {showProfiles && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Freelances disponibles
          </h2>
          {profiles.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-500 text-sm mb-3">Aucun freelance disponible pour le moment</p>
              <Link
                href="/jobs/freelance/profiles/new"
                className="text-sm text-icc-violet font-medium hover:underline"
              >
                Proposer mes services →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {profiles.map((p) => <FreelanceProfileCard key={p.id} profile={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
