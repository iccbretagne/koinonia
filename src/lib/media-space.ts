import type { Session } from "next-auth";
import { isProductionMediaMember, isCommunicationMember } from "./auth";
import { rolePermissions } from "./registry";

/**
 * Droits d'accès aux onglets de l'espace « Communication & Production » (spec 043).
 * Reflète exactement les gardes serveur de chaque page — cet objet ne remplace aucun
 * contrôle d'accès, il ne fait que décider quels onglets afficher.
 */
export interface MediaSpaceAccess {
  /** Demandes visuels (`/media/requests`) — même condition que la page. */
  visuals: boolean;
  /** Demandes réseaux sociaux (`/communication/requests`) — même condition que la page. */
  social: boolean;
  /** Projets + Événements médias (`/media/projects`, `/media/events`) — `requireMediaAccess`. */
  browse: boolean;
  /** Collections (`/media/collections`) — `requireMediaCollectionAccess`. */
  collections: boolean;
}

interface SpaceTab {
  href: string;
  label: string;
}

/**
 * Fonction pure : dérive la liste d'onglets à afficher à partir des droits déjà résolus.
 * Ordre fixe (spec 043) : Demandes visuels · Demandes réseaux sociaux · Projets ·
 * Événements médias · Collections.
 */
export function buildMediaSpaceTabs(access: MediaSpaceAccess): SpaceTab[] {
  const tabs: SpaceTab[] = [];
  if (access.visuals) tabs.push({ href: "/media/requests", label: "Demandes visuels" });
  if (access.social) tabs.push({ href: "/communication/requests", label: "Demandes réseaux sociaux" });
  if (access.browse) tabs.push({ href: "/media/projects", label: "Projets" });
  if (access.browse) tabs.push({ href: "/media/events", label: "Événements médias" });
  if (access.collections) tabs.push({ href: "/media/collections", label: "Collections" });
  return tabs;
}

/**
 * Résout `MediaSpaceAccess` pour un utilisateur dans une église donnée — une requête
 * département (mutualisée entre les 4 conditions). Utilisé par les layouts `/media` et
 * `/communication`. Le layout `(auth)` ne l'appelle pas : il a déjà chargé les départements
 * de service et construit ce même objet sans requête supplémentaire (voir `plan.md`).
 */
export async function resolveMediaSpaceAccess(session: Session, churchId: string): Promise<MediaSpaceAccess> {
  if (session.user.isSuperAdmin) {
    return { visuals: true, social: true, browse: true, collections: true };
  }

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  const canManage = userPermissions.has("events:manage");

  const [isProductionMember, isCommMember] = await Promise.all([
    isProductionMediaMember(session, churchId),
    isCommunicationMember(session, churchId),
  ]);

  return {
    visuals: canManage || isProductionMember,
    social: canManage || isCommMember,
    browse: userPermissions.has("media:view") || isProductionMember || isCommMember,
    collections: userPermissions.has("media:manage") || isProductionMember || isCommMember,
  };
}
