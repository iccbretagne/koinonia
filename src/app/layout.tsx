import type { Metadata, Viewport } from "next";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import { TriangleAlert } from "lucide-react";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import {
  STAGING_BUILD_VERSION,
  STAGING_BANNER_HEIGHT_CLASS,
  STAGING_BANNER_BODY_PADDING_CLASS,
} from "@/lib/env-banner";
import "./globals.css";

// Montserrat (charte ICC) pour les titres, boutons et navigation ; Source Sans 3 pour le texte
// courant et les données, plus compacte à corps égal (spec 055, docs/design-system/README.md).
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

// Applique le thème choisi dans « Mon profil » (localStorage) avant le premier rendu, pour
// éviter un flash du thème clair. Sans choix explicite, prefers-color-scheme décide (globals.css).
const THEME_SCRIPT = `try{var t=localStorage.getItem("koinonia-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: "Koinonia",
  description: "Le back-office opérationnel de votre église, en une seule application.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Koinonia",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191427" },
  ],
};

// Fixe (pas sticky) et à hauteur constante (STAGING_BANNER_HEIGHT_CLASS) pour rester visible en
// permanence au défilement, sur mobile comme sur desktop — un bandeau qui défile avec la page
// perd sa raison d'être dès qu'on scrolle. Rayures + icône + majuscules : reconnaissable d'un
// coup d'œil périphérique, pas seulement à la lecture du texte. `pt-*` sur `<body>` et le header
// sticky de AuthLayoutShell (@/lib/env-banner) réservent la place pour ne pas passer dessous.
function StagingBanner() {
  if (!STAGING_BUILD_VERSION) return null;

  return (
    <div
      role="status"
      className={`fixed top-0 inset-x-0 z-[100] ${STAGING_BANNER_HEIGHT_CLASS} flex items-center justify-center gap-2 px-3 bg-accent text-on-accent shadow-float`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(0,0,0,0.12) 0 14px, transparent 14px 28px)",
      }}
    >
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="font-display font-bold uppercase tracking-wider text-xs sm:text-sm truncate">
        Recette — pas la production
      </span>
      <span className="hidden sm:inline text-xs opacity-70">(build {STAGING_BUILD_VERSION})</span>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${montserrat.variable} ${sourceSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="icon" href="/brand/koinonia-app-icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/brand/koinonia-app-icon.svg" />
      </head>
      <body
        className={`font-sans antialiased bg-bg text-ink ${STAGING_BUILD_VERSION ? STAGING_BANNER_BODY_PADDING_CLASS : ""}`}
      >
        <StagingBanner />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
