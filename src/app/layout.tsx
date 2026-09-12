import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
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

// NEXT_PUBLIC_BUILD_VERSION n'est inliné que par deploy-staging.yml (voir footer de
// (auth)/layout.tsx) : sa seule présence dans le bundle suffit à distinguer une recette
// d'une production, sans variable dédiée supplémentaire.
function StagingBanner() {
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION;
  if (!buildVersion) return null;

  return (
    <div className="w-full bg-icc-jaune text-black text-center text-xs font-semibold py-1 px-2">
      🧪 Environnement de recette (build {buildVersion}) — ceci n&apos;est pas la production
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
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <StagingBanner />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
