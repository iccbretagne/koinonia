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
  // Anciennes adresses d'écran (spec 052, #629, spec 092) : redirigées par le proxy depuis
  // `src/lib/legacy-paths.ts` (307, GET/HEAD seulement) — plus aucune redirection ici.
};

export default nextConfig;
