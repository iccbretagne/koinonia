import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Modèle de sens de l'assistant (spec 075) : transformers.js et son binaire natif restent des
  // modules Node chargés à l'exécution, jamais regroupés par le bundler.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Limite la taille du corps transmis à travers le middleware (proxy.ts) vers les route handlers
    middlewareClientMaxBodySize: 100 * 1024 * 1024, // 100MB
  },
  // Spec 052 (ADR-0015) : qualification des RDV et dépôt connecté déplacés vers `care`.
  // `/agenda-public/[churchSlug]` (adresse publique diffusée) n'est volontairement pas
  // redirigée : elle reste la même adresse, propriétaire changé.
  async redirects() {
    return [
      { source: "/agenda/requests", destination: "/care", permanent: true },
      { source: "/agenda/requests/:path*", destination: "/care", permanent: true },
      { source: "/agenda/request", destination: "/care/request", permanent: true },
      { source: "/agenda/request/:path*", destination: "/care/request", permanent: true },
      // Lien erroné des anciennes notifications d'affectation d'intégration (#629).
      { source: "/admin/integration/requests/:id", destination: "/integration/requests/:id", permanent: true },
    ];
  },
};

export default nextConfig;
