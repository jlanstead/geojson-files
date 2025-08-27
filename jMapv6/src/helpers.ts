// Secure uniform in (-0.5, 0.5)
function randMinusHalfToHalf(): number {
  const buf = new Uint32Array(1);
  // PBIViz sandbox provides window.crypto
  window.crypto.getRandomValues(buf);
  return (buf[0] / 0xFFFFFFFF) - 0.5;
}

export function parsePolygonCoordinates(dbStr: string): GeoJSON.Polygon | null {
  if (!dbStr) return null;
  const parts = dbStr.split(/\s*;\s*/).filter(Boolean);
  const ring: [number, number][] = [];

  for (const raw of parts) {
    const t = raw.replace(/[()]/g, "").replace(/\s+/g, "");
    const i = t.indexOf(",");
    if (i < 0) continue;
    const lon = parseFloat(t.slice(0, i));
    const lat = parseFloat(t.slice(i + 1));
    if (Number.isFinite(lon) && Number.isFinite(lat)) ring.push([lon, lat]);
  }

  if (ring.length < 3) return null;
  const [fx, fy] = ring[0], [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: "Polygon", coordinates: [ring] };
}

export function jitterIfDuplicate(lat: number, lon: number, used: Set<string>, eps: number): [number, number] {
  let la = lat, lo = lon, key = `${la.toFixed(8)},${lo.toFixed(8)}`, tries = 0;
  while (used.has(key) && tries < 50) {
    la += randMinusHalfToHalf() * eps;   // ← secure RNG
    lo += randMinusHalfToHalf() * eps;   // ← secure RNG
    key = `${la.toFixed(8)},${lo.toFixed(8)}`;
    tries++;
  }
  used.add(key);
  return [la, lo];
}

export const palette = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];

export function colorFor(layer: string, overrides: Record<string,string>): string {
  if (overrides && overrides[layer]) return overrides[layer];
  let h = 0; for (let i = 0; i < layer.length; i++) h = (h*31 + layer.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}
