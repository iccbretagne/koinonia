/** Configuration dynamique Traefik des domaines dédiés (spec 084) : pure, testable. */
export function traefikConfig(hosts: string[], serviceUrl = `http://127.0.0.1:${process.env.PORT ?? 3000}`) {
  const routers = Object.fromEntries(
    hosts.map((host, i) => [
      `koinonia-site-${i}`,
      { rule: `Host(\`${host}\`)`, entryPoints: ["websecure"], service: "koinonia-app", tls: { certResolver: "letsencrypt" } },
    ])
  );
  return {
    http: {
      routers,
      services: { "koinonia-app": { loadBalancer: { servers: [{ url: serviceUrl }] } } },
    },
  };
}
