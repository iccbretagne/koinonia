"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER";

interface GuideContentProps {
  defaultRole: RoleKey;
}

const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SECRETARY: "Secrétaire",
  MINISTER: "Ministre",
  DEPARTMENT_HEAD: "Resp. Département",
  DISCIPLE_MAKER: "Faiseur de Disciples",
  REPORTER: "Reporter (Comptes rendus)",
};

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Accès complet à toutes les fonctionnalités et toutes les églises.",
  ADMIN: "Gestion complète d'une église : planning, membres, événements, discipolat et comptes rendus.",
  SECRETARY: "Vision globale en lecture avec gestion des événements, discipolat et comptes rendus.",
  MINISTER: "Gestion du planning et des membres pour les départements de son ministère.",
  DEPARTMENT_HEAD: "Gestion du planning et des membres pour ses départements assignés. Accès au discipolat.",
  DISCIPLE_MAKER: "Suivi des disciples et de leur arbre de lignée.",
  REPORTER: "Accès en lecture et écriture aux comptes rendus d'événements et statistiques.",
};

type AccessLevel = "edit" | "read" | "none";

const GUIDE_ASSETS_BASE =
  "https://github.com/iccbretagne/koinonia/releases/download/guide-assets";

interface Feature {
  name: string;
  description: string;
  category: string;
  screenshotTitle: string;
  screenshotFile: string;
  access: Record<RoleKey, AccessLevel>;
}

const FEATURES: Feature[] = [
  {
    name: "Voir le planning",
    description: "Consultez la grille de planning avec les STAR et leurs statuts de service pour chaque événement.",
    category: "Planning",
    screenshotTitle: "Vue planning",
    screenshotFile: "guide-planning-view.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "read", REPORTER: "none" },
  },
  {
    name: "Modifier le planning",
    description: "Changez les statuts de service des STAR directement depuis la grille.",
    category: "Planning",
    screenshotTitle: "Édition du planning",
    screenshotFile: "guide-planning-edit.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Voir les membres (STAR)",
    description: "Consultez la liste des STAR avec leurs départements et informations.",
    category: "Membres",
    screenshotTitle: "Liste des STAR",
    screenshotFile: "guide-members-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "read", REPORTER: "none" },
  },
  {
    name: "Gérer les membres (STAR)",
    description: "Ajoutez, modifiez ou supprimez des STAR et gérez leurs affectations.",
    category: "Membres",
    screenshotTitle: "Gestion des STAR",
    screenshotFile: "guide-members-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Voir les événements",
    description: "Consultez la liste et le calendrier des événements planifiés.",
    category: "Événements",
    screenshotTitle: "Liste des événements",
    screenshotFile: "guide-events-list.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "read", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "read", REPORTER: "read" },
  },
  {
    name: "Gérer les événements",
    description: "Créez, modifiez ou supprimez des événements pour votre église.",
    category: "Événements",
    screenshotTitle: "Gestion des événements",
    screenshotFile: "guide-events-manage.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Gérer les départements",
    description: "Configurez les ministères et départements de votre église.",
    category: "Administration",
    screenshotTitle: "Gestion des départements",
    screenshotFile: "guide-admin-departments.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "edit", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Gérer l'église",
    description: "Configurez les paramètres généraux de votre église.",
    category: "Administration",
    screenshotTitle: "Paramètres de l'église",
    screenshotFile: "guide-admin-church.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Gérer les utilisateurs",
    description: "Attribuez des rôles et permissions aux utilisateurs.",
    category: "Administration",
    screenshotTitle: "Gestion des utilisateurs",
    screenshotFile: "guide-admin-users.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "none", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Comptes rendus",
    description: "Saisie et consultation des comptes rendus d'événements avec statistiques par département.",
    category: "Événements",
    screenshotTitle: "Comptes rendus",
    screenshotFile: "guide-reports.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "edit" },
  },
  {
    name: "Annonces",
    description: "Soumission d'annonces et suivi des demandes de service (secrétariat, visuels, communication).",
    category: "Annonces",
    screenshotTitle: "Mes annonces",
    screenshotFile: "guide-announcements.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "edit", MINISTER: "edit", DEPARTMENT_HEAD: "edit", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
  {
    name: "Discipolat",
    description: "Suivi des relations de discipolat, appel de présence et statistiques.",
    category: "Discipolat",
    screenshotTitle: "Tableau de bord discipolat",
    screenshotFile: "guide-discipleship.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "read", MINISTER: "none", DEPARTMENT_HEAD: "read", DISCIPLE_MAKER: "edit", REPORTER: "none" },
  },
  {
    name: "Accès & rôles",
    description: "Attribution des ministres, responsables de département (principal/adjoint) et accès aux comptes rendus.",
    category: "Administration",
    screenshotTitle: "Accès & rôles",
    screenshotFile: "guide-access-roles.png",
    access: { SUPER_ADMIN: "edit", ADMIN: "edit", SECRETARY: "none", MINISTER: "none", DEPARTMENT_HEAD: "none", DISCIPLE_MAKER: "none", REPORTER: "none" },
  },
];

const ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER"];

function AccessBadge({ level }: { level: AccessLevel }) {
  switch (level) {
    case "edit":
      return <span className="inline-flex items-center text-sm text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✓ Édition</span>;
    case "read":
      return <span className="inline-flex items-center text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">👁 Lecture</span>;
    case "none":
      return <span className="inline-flex items-center text-sm text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">✗ Pas d&apos;accès</span>;
  }
}

export default function GuideContent({ defaultRole }: GuideContentProps) {
  const [activeRole, setActiveRole] = useState<RoleKey>(defaultRole);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const router = useRouter();

  const visibleFeatures = FEATURES.filter((f) => f.access[activeRole] !== "none");
  const categories = Array.from(new Set(visibleFeatures.map((f) => f.category)));

  return (
    <div>
      {/* Bouton tour guide interactif */}
      <div className="mb-6 flex items-center gap-3 p-4 bg-icc-violet/5 border border-icc-violet/20 rounded-lg">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-800">Decouvrir l&apos;interface</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Lancez un tour guide interactif pour decouvrir les fonctionnalites principales.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard?tour=1")}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:bg-icc-violet/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Lancer le tour guide
        </button>
      </div>

      {/* Onglets par rôle */}
      <div className="flex overflow-x-auto gap-1 border-b border-gray-200 mb-6 pb-px -mx-1 px-1">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors shrink-0 ${
              activeRole === role
                ? "bg-icc-violet text-white"
                : "text-gray-600 hover:text-icc-violet hover:bg-gray-50"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {/* Description du rôle */}
      <div className="mb-6 p-4 bg-icc-violet/5 border border-icc-violet/20 rounded-lg">
        <h2 className="text-lg font-semibold text-icc-violet">{ROLE_LABELS[activeRole]}</h2>
        <p className="text-sm text-gray-600 mt-1">{ROLE_DESCRIPTIONS[activeRole]}</p>
        {activeRole === "MINISTER" && (
          <p className="text-xs text-gray-500 mt-2 italic">
            * Le ministre a accès uniquement aux départements de son ministère assigné.
          </p>
        )}
      </div>

      {/* Fonctionnalités par catégorie */}
      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="text-base font-semibold text-gray-800 mb-4 border-b pb-2">{category}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleFeatures.filter((f) => f.category === category).map((feature) => (
                <div key={feature.name} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-gray-700">{feature.name}</h4>
                    <AccessBadge level={feature.access[activeRole]} />
                  </div>
                  <p className="text-xs text-gray-500">{feature.description}</p>
                  <button
                    type="button"
                    onClick={() => setZoomedImage({ src: `${GUIDE_ASSETS_BASE}/${feature.screenshotFile}`, alt: feature.screenshotTitle })}
                    className="w-full aspect-video bg-gray-50 rounded-lg border border-gray-200 overflow-hidden cursor-zoom-in group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${GUIDE_ASSETS_BASE}/${feature.screenshotFile}`}
                      alt={feature.screenshotTitle}
                      className="w-full h-full object-contain transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Modale zoom image */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedImage.src}
            alt={zoomedImage.alt}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
