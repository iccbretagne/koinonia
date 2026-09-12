import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import {
  STAGING_BUILD_VERSION,
  STAGING_BANNER_HEIGHT_CLASS,
  STAGING_BANNER_BODY_PADDING_CLASS,
} from "@/lib/env-banner";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Koinonia",
  description: "Gestion des plannings de service",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Koinonia",
  },
};

export const viewport: Viewport = {
  themeColor: "#5E17EB",
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
      className={`fixed top-0 inset-x-0 z-[100] ${STAGING_BANNER_HEIGHT_CLASS} flex items-center justify-center gap-2 px-3 bg-icc-jaune text-black shadow-[0_1px_4px_rgba(0,0,0,0.3)]`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(0,0,0,0.12) 0 14px, transparent 14px 28px)",
      }}
    >
      <span aria-hidden="true" className="text-base leading-none">⚠️</span>
      <span className="font-extrabold uppercase tracking-wide text-xs sm:text-sm truncate">
        Recette — pas la production
      </span>
      <span className="hidden sm:inline text-xs opacity-70">(build {STAGING_BUILD_VERSION})</span>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body
        className={`${montserrat.variable} font-sans antialiased ${STAGING_BUILD_VERSION ? STAGING_BANNER_BODY_PADDING_CLASS : ""}`}
      >
        <StagingBanner />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
