import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "PlanningCenter",
  description: "Gestion des plannings de service",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PlanningCenter",
  },
};

export const viewport: Viewport = {
  themeColor: "#5E17EB",
};

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
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
