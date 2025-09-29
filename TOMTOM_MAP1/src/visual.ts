/// <reference path="./types/maplibre-csp.d.ts" />
import "./style/visual.less";

import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

// MapLibre (CSP build + worker)
import * as maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import MapLibreWorker from "maplibre-gl/dist/maplibre-gl-csp-worker";
(maplibregl as any).workerClass = MapLibreWorker;
import "maplibre-gl/dist/maplibre-gl.css";

// === KEEPING YOUR KEY ===
const TOMTOM_KEY = "x10wLdMTZk1FrwDa2ab439Ghi4ZVTrj1";

// Minimal embedded raster style (no external style.json)
const TOMTOM_RASTER_STYLE: any = {
  version: 8,
  sources: {
    tomtom: {
      type: "raster",
      tiles: [
        `https://a.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
        `https://b.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
        `https://c.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
        `https://d.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`
      ],
      tileSize: 256
    }
  },
  layers: [{ id: "tomtom", type: "raster", source: "tomtom" }]
};

export class Visual implements IVisual {
  private host: HTMLDivElement;
  private map?: maplibregl.Map;

  private readonly sourceId = "pts";
  private readonly layerId = "pts-circle";

  constructor(opts: powerbi.extensibility.visual.VisualConstructorOptions) {
    // Root
    this.host = document.createElement("div");
    this.host.className = "visualHost";
    Object.assign(this.host.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      margin: "0",
      padding: "0"
    });
    opts.element.appendChild(this.host);

    // Map container
    const mapDiv = document.createElement("div");
    mapDiv.className = "map";
    Object.assign(mapDiv.style, { position: "absolute", inset: "0" });
    this.host.appendChild(mapDiv);

    // Optional legend badge
    const legend = document.createElement("div");
    legend.className = "legendBadge";
    legend.textContent = "Legend";
    this.host.appendChild(legend);

    // Map
    this.map = new maplibregl.Map({
      container: mapDiv,
      style: TOMTOM_RASTER_STYLE,
      center: [-96.8, 37.6],
      zoom: 3
    });

    new ResizeObserver(() => this.map!.resize()).observe(this.host);
  }

  public update(options: VisualUpdateOptions) {
    const dv = options.dataViews?.[0];
    const table = dv?.table;
    if (!table || !this.map) return;

    // Find column indexes by role names (from capabilities.json)
    const cols = table.columns ?? [];
    const roleIdx = (role: string) => cols.findIndex(c => c.roles && (c.roles as any)[role]);

    let iLat = roleIdx("latitude");
    let iLon = roleIdx("longitude");
    let iLegend = roleIdx("legend");

    // Fallback by display name if roles aren’t set
    const nameIdx = (n: string) =>
      cols.findIndex(c => (c.displayName || "").toLowerCase() === n);
    if (iLat < 0) iLat = nameIdx("latitude") >= 0 ? nameIdx("latitude") : nameIdx("lat");
    if (iLon < 0) iLon = nameIdx("longitude") >= 0 ? nameIdx("longitude") : nameIdx("lon");
    if (iLegend < 0) iLegend = nameIdx("legend") >= 0 ? nameIdx("legend") : nameIdx("cat");
    if (iLat < 0 || iLon < 0) return;

    const safeNum = (v: any) => {
      if (v == null) return NaN;
      if (typeof v === "number") return v;
      return Number(String(v).trim().replace(",", "."));
    };

    // Build GeoJSON from table rows (guard rows)
    const rows = table.rows ?? [];
    const feats: GeoJSON.Feature[] = [];
    for (const r of rows) {
      const lat = safeNum(r[iLat]);
      const lon = safeNum(r[iLon]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        feats.push({
          type: "Feature",
          properties: { label: iLegend >= 0 ? String(r[iLegend] ?? "") : "" },
          geometry: { type: "Point", coordinates: [lon, lat] }
        });
      }
    }
    if (!feats.length) return;

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: feats };

    // Add/update source + layer
    const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(fc);
    else {
      this.map.addSource(this.sourceId, { type: "geojson", data: fc });
      this.map.addLayer({
        id: this.layerId,
        type: "circle",
        source: this.sourceId,
        paint: {
          "circle-radius": 5,
          "circle-color": "#1e90ff",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000",
          "circle-opacity": 0.9
        }
      });
    }

    // Fit to data
    const coords = feats.map(f => (f.geometry as any).coordinates) as [number, number][];
    const b = coords.reduce(
      (acc, c) => acc.extend(c as any),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    try {
      this.map.fitBounds(b, { padding: 36, maxZoom: 12, duration: 0 });
    } catch {
      this.map.jumpTo({ center: coords[0], zoom: 8 });
    }
  }
}