/**
 * Géolocalisation pour l'intégration familles.
 * - Géocode une adresse via api.adresse.data.gouv.fr
 * - Détermine la famille d'impact correspondante via le GeoJSON de familles.iccrennes.fr
 */

const FAMILIES_API_URL =
  process.env.FAMILIES_API_URL ?? "https://familles.iccrennes.fr";

interface GeocodedAddress {
  lat: number;
  lng: number;
  label: string;
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, label: feature.properties.label };
  } catch {
    return null;
  }
}

interface FamilyGeoResult {
  familyId: number;
  familyName: string;
}

interface FamilyApiZone {
  geojson?: { geometry?: { type: string; coordinates: unknown } };
}

interface FamilyApiItem {
  id: number;
  name: string;
  communes?: FamilyApiZone[];
  quartiers?: FamilyApiZone[];
}

export async function findFamilyByCoords(lat: number, lng: number): Promise<FamilyGeoResult | null> {
  try {
    const res = await fetch(`${FAMILIES_API_URL}/api/geojson`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: FamilyApiItem[] = await res.json();

    for (const family of data) {
      const zones = [...(family.communes ?? []), ...(family.quartiers ?? [])];
      for (const zone of zones) {
        const geom = zone.geojson?.geometry;
        if (!geom) continue;
        if (pointInGeometry(lat, lng, geom as { type: string; coordinates: unknown })) {
          return { familyId: family.id, familyName: family.name };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Ray-casting algorithm — works for Polygon and MultiPolygon GeoJSON geometries. */
function pointInGeometry(lat: number, lng: number, geometry: { type: string; coordinates: unknown }): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygon(lat, lng, geometry.coordinates as number[][][]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).some((poly) =>
      pointInPolygon(lat, lng, poly)
    );
  }
  return false;
}

function pointInPolygon(lat: number, lng: number, rings: number[][][]): boolean {
  // Only test the outer ring (rings[0]); holes ignored for simplicity
  const ring = rings[0];
  if (!ring || ring.length < 3) return false;

  let inside = false;
  const x = lng;
  const y = lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
