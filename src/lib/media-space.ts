import type { Session } from "next-auth";
import { isMediaTeamMember, isCommunicationMember } from "./auth";
import { rolePermissions } from "./registry";
import { prisma } from "./prisma";

/**
 * Droits d'accès à l'espace « Communication & Production » (spec 049, remplace la spec 043) —
 * deux activités séparables (Photos, Visuels), chacune pouvant être portée par une équipe
 * différente (fonctions de département), plus les demandes réseaux sociaux et le partage.
 * Reflète exactement les gardes serveur de chaque page — cet objet ne remplace aucun contrôle
 * d'accès, il ne fait que décider quelles cartes/onglets afficher.
 */
export interface MediaSpaceAccess {
  /** Carte Photos (`/media/events`) — même condition que `requireMediaAccess(churchId, "PHOTOS")`. */
  photos: boolean;
  /** Bibliothèque de visuels (`/media/projects`) — même condition côté `"VISUELS"`. */
  visuals: boolean;
  /** Demandes visuels (`/media/requests`) — onglet interne de la carte Visuels. */
  visualRequests: boolean;
  /** Demandes réseaux sociaux (`/communication/requests`) — carte à part. */
  social: boolean;
  /** Partages (bouton sur l'accueil) — même condition que `requireMediaCollectionAccess`. */
  share: boolean;
}

export interface SpaceCard {
  href: string;
  title: string;
  team?: string;
  stats?: string[];
}

interface SpaceTab {
  href: string;
  label: string;
}

/**
 * Fonction pure : dérive les cartes de l'accueil de l'espace à partir des droits déjà résolus.
 * Ordre fixe (spec 049) : Photos · Visuels · Réseaux sociaux. La carte Visuels existe dès que
 * l'une des deux activités qu'elle regroupe (bibliothèque, demandes) est accessible.
 */
export function buildMediaSpaceCards(access: MediaSpaceAccess): SpaceCard[] {
  const cards: SpaceCard[] = [];
  if (access.photos) cards.push({ href: "/media/events", title: "Photos" });
  if (access.visuals || access.visualRequests) {
    cards.push({ href: access.visuals ? "/media/projects" : "/media/requests", title: "Visuels" });
  }
  if (access.social) cards.push({ href: "/communication/requests", title: "Réseaux sociaux" });
  return cards;
}

/**
 * Onglets internes de la carte Visuels (spec 049) : Projets (bibliothèque) et Demandes,
 * filtrés selon les droits — remplace l'ancienne barre d'onglets globale de l'espace.
 */
export function buildVisualsTabs(access: MediaSpaceAccess): SpaceTab[] {
  const tabs: SpaceTab[] = [];
  if (access.visuals) tabs.push({ href: "/media/projects", label: "Projets" });
  if (access.visualRequests) tabs.push({ href: "/media/requests", label: "Demandes" });
  return tabs;
}

/**
 * Résout `MediaSpaceAccess` pour un utilisateur dans une église donnée — une requête
 * département (mutualisée entre les conditions). Utilisé par les layouts `/media` et
 * `/communication`. Le layout `(auth)` ne l'appelle pas : il a déjà chargé les départements
 * de service et construit ce même objet sans requête supplémentaire (voir `plan.md`).
 */
export async function resolveMediaSpaceAccess(session: Session, churchId: string): Promise<MediaSpaceAccess> {
  if (session.user.isSuperAdmin) {
    return { photos: true, visuals: true, visualRequests: true, social: true, share: true };
  }

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  const canManage = userPermissions.has("events:manage");

  const [isPhotoMember, isVisualMember, isCommMember] = await Promise.all([
    isMediaTeamMember(session, churchId, "PHOTOS"),
    isMediaTeamMember(session, churchId, "VISUELS"),
    isCommunicationMember(session, churchId),
  ]);

  return {
    photos: userPermissions.has("media:view") || isPhotoMember || isCommMember,
    visuals: userPermissions.has("media:view") || isVisualMember || isCommMember,
    visualRequests: canManage || isVisualMember,
    social: canManage || isCommMember,
    share: userPermissions.has("media:manage") || isPhotoMember || isVisualMember || isCommMember,
  };
}

export interface MediaSpaceCounters {
  photos?: number;
  visuals?: number;
  social?: number;
}

/**
 * Compteurs affichés sur les cartes de l'accueil (spec 049) — uniquement pour les cartes
 * effectivement visibles, pour éviter des requêtes inutiles.
 */
export async function getMediaSpaceCounters(
  churchId: string,
  access: MediaSpaceAccess
): Promise<MediaSpaceCounters> {
  const counters: MediaSpaceCounters = {};

  const queries: Promise<void>[] = [];

  if (access.photos) {
    queries.push(
      prisma.mediaPhoto
        .count({ where: { mediaEvent: { churchId }, status: { in: ["PENDING", "PREVALIDATED"] } } })
        .then((n) => { counters.photos = n; })
    );
  }

  if (access.visuals || access.visualRequests) {
    queries.push(
      Promise.all([
        access.visuals
          ? prisma.mediaFile.count({ where: { mediaProject: { churchId }, type: "VISUAL", status: "PENDING" } })
          : Promise.resolve(0),
        access.visualRequests
          ? prisma.request.count({ where: { churchId, type: "VISUEL", status: "EN_ATTENTE" } })
          : Promise.resolve(0),
      ]).then(([pendingFiles, pendingRequests]) => { counters.visuals = pendingFiles + pendingRequests; })
    );
  }

  if (access.social) {
    queries.push(
      prisma.request
        .count({ where: { churchId, type: "RESEAUX_SOCIAUX", status: "EN_ATTENTE" } })
        .then((n) => { counters.social = n; })
    );
  }

  await Promise.all(queries);
  return counters;
}
