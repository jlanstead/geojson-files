import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;
// Use browser bundle (no Node shims in PBI sandbox)
// @ts-ignore
import * as maplibregl from "maplibre-gl";

type MapSettings = { zoom: number; centerLat: number; centerLon: number; };

// ── TomTom raster style ────────────────────────────────────────────────
const TOMTOM_KEY = "x10wLdMTZk1FrwDa2ab439Ghi4ZVTrj1"; // <-- put your key here

const TOMTOM_RASTER_STYLE: maplibregl.StyleSpecification = {
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

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private mapDiv: HTMLDivElement;
  private map?: maplibregl.Map;
  private userInteracted = false;
  private ro?: ResizeObserver;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;
    this.root.classList.add("pbi-maplibre-root");

    this.mapDiv = document.createElement("div");
    this.mapDiv.className = "map-container";
    this.mapDiv.style.width = "100%";
    this.mapDiv.style.height = "100%";
    this.mapDiv.style.position = "relative";
    this.mapDiv.style.zIndex = "1";
    this.mapDiv.style.pointerEvents = "auto";
    this.mapDiv.style.touchAction = "none";
    this.mapDiv.tabIndex = 0;
    this.root.appendChild(this.mapDiv);
  }

  private readSettings(dv?: DataView): MapSettings {
    const defaults: MapSettings = { zoom: 11, centerLat: 35.2271, centerLon: -80.8431 }; // Charlotte
    try {
      const objs = (dv?.metadata as any)?.objects || {};
      const map = objs.map || {};
      const zoom = Number(map.zoom?.numeric ?? map.zoom ?? defaults.zoom);
      const centerLat = Number(map.centerLat?.numeric ?? map.centerLat ?? defaults.centerLat);
      const centerLon = Number(map.centerLon?.numeric ?? map.centerLon ?? defaults.centerLon);
      return {
        zoom: Number.isFinite(zoom) ? zoom : defaults.zoom,
        centerLat: Number.isFinite(centerLat) ? centerLat : defaults.centerLat,
        centerLon: Number.isFinite(centerLon) ? centerLon : defaults.centerLon
      };
    } catch { return defaults; }
  }

  // Create once; default to TomTom raster style
  private buildMapIfNeeded(center: [number, number], zoom: number, styleSpec?: maplibregl.StyleSpecification | string) {
    if (this.map) return;

    const styleToUse = styleSpec ?? TOMTOM_RASTER_STYLE;

    this.map = new maplibregl.Map({
      container: this.mapDiv,
      style: styleToUse,
      center,
      zoom,
      dragRotate: false
    });

    try {
      this.map.scrollZoom.enable();
      this.map.dragPan.enable();
      this.map.doubleClickZoom.enable();
      this.map.boxZoom.enable();
      this.map.keyboard.enable();
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }));
    } catch {}

    // NO style overrides here — keep raster visible

    const stop = (e: Event) => { e.stopPropagation(); };
    const passiveOptions = { passive: false } as AddEventListenerOptions;
    ["wheel","pointerdown","pointerup","pointermove","touchstart","touchmove","touchend"].forEach(evt =>
      this.mapDiv.addEventListener(evt, stop, passiveOptions)
    );

    const mark = () => { this.userInteracted = true; };
    this.map.on("dragstart", mark);
    this.map.on("zoomstart", mark);
    this.map.on("rotatestart", mark);
    this.map.on("pitchstart", mark);

    this.ro = new ResizeObserver(() => this.map?.resize());
    this.ro.observe(this.root);
  }

  private updateFromTable(dv: DataView): boolean {
    if (!dv || !dv.table || !this.map) return false;
    const table = dv.table;
    const cols = (table.columns || []).map((c: any) => (c && (c.displayName || c.roles && Object.keys(c.roles)[0])) || "");
    const idx = (name: string) => {
      const lower = name.toLowerCase();
      for (let i = 0; i < cols.length; i++) if ((cols[i] || "").toLowerCase() === lower) return i;
      return -1;
    };

    const iKind = idx("Kind");
    const iName = idx("Name");
    const iLat = idx("Latitude");
    const iLon = idx("Longitude");
    const iPoly = idx("Polygon");

    const pointFeatures: any[] = [];
    const polygonFeatures: any[] = [];

    for (const row of table.rows || []) {
      const kind = typeof iKind === "number" && iKind >= 0 ? String(row[iKind] ?? "") : "";
      const name = iName >= 0 ? String(row[iName] ?? "") : "";
      const lat = iLat >= 0 && row[iLat] != null ? Number(row[iLat]) : null;
      const lon = iLon >= 0 && row[iLon] != null ? Number(row[iLon]) : null;
      const polyText = iPoly >= 0 ? (row[iPoly] ?? null) : null;

      if (/point/i.test(kind) && lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
        pointFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [Number(lon), Number(lat)] },
          properties: { name, kind }
        });
      } else if (/polygon/i.test(kind) && polyText) {
        try {
          const coords = typeof polyText === "string" ? JSON.parse(polyText) : polyText;
          polygonFeatures.push({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: coords[0] ? coords[0] : coords },
            properties: { name, kind }
          });
        } catch {}
      }
    }

    const ptsGeo = { type: "FeatureCollection", features: pointFeatures };
    const polysGeo = { type: "FeatureCollection", features: polygonFeatures };

    const ensureSource = (id: string, data: any) => {
      const map = this.map as any;
      if (map.getSource(id)) {
        try { (map.getSource(id) as any).setData(data); } catch {}
      } else {
        try { map.addSource(id, { type: "geojson", data }); } catch {}
      }
    };

    try {
      const map = this.map as any;
      ["user-polygons-fill","user-polygons-line","user-points-circle"].forEach(id => { if (map.getLayer(id)) try { map.removeLayer(id); } catch {} });
      ["user-polygons","user-points"].forEach(id => { if (map.getSource(id)) try { map.removeSource(id); } catch {} });
    } catch {}

    if (polygonFeatures.length) ensureSource("user-polygons", polysGeo);
    if (pointFeatures.length) ensureSource("user-points", ptsGeo);

    if (polygonFeatures.length) {
      try {
        (this.map as any).addLayer({
          id: "user-polygons-fill",
          type: "fill",
          source: "user-polygons",
          paint: { "fill-color": "#000000", "fill-opacity": 0.4 }
        });
      } catch {}
      try {
        (this.map as any).addLayer({
          id: "user-polygons-line",
          type: "line",
          source: "user-polygons",
          paint: { "line-color": "#3a3a3a", "line-width": 1 }
        });
      } catch {}
    }

    if (pointFeatures.length) {
      try {
        (this.map as any).addLayer({
          id: "user-points-circle",
          type: "circle",
          source: "user-points",
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff3b30",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1
          }
        });
      } catch {}
    }

    if (!this.userInteracted) {
      try {
        const all = [...polygonFeatures, ...pointFeatures];
        if (all.length) {
          const bbox = this.featureCollectionBBox(all);
          if (bbox) (this.map as any).fitBounds(bbox, { padding: 20, animate: false });
        }
      } catch {}
    }

    return !!(pointFeatures.length || polygonFeatures.length);
  }

  private featureCollectionBBox(features: any[]): [[number, number],[number, number]] | null {
    if (!features || !features.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const visit = (coords: any) => {
      if (typeof coords[0] === "number") {
        const x = coords[0], y = coords[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else {
        for (const c of coords) visit(c);
      }
    };
    try {
      for (const f of features) {
        const g = f.geometry;
        if (!g) continue;
        if (g.type === "Point") visit(g.coordinates);
        else if (g.type === "Polygon") visit(g.coordinates);
        else if (g.type === "MultiPolygon") visit(g.coordinates);
      }
      if (minX === Infinity) return null;
      return [[minX, minY], [maxX, maxY]];
    } catch { return null; }
  }

  public update(opts: VisualUpdateOptions): void {
    const dv = (opts.dataViews && opts.dataViews[0]) ? opts.dataViews[0] : undefined;
    const s = this.readSettings(dv);
    const center: [number, number] = [s.centerLon, s.centerLat];

    // default to TomTom style
    const styleSpec: maplibregl.StyleSpecification | undefined = undefined;
    this.buildMapIfNeeded(center, s.zoom, styleSpec);

    if (!this.map) return;

    if (!this.userInteracted) {
      if (Math.abs(this.map.getZoom() - s.zoom) > 0.01) this.map.setZoom(s.zoom);
      const c = this.map.getCenter();
      if (Math.abs(c.lng - s.centerLon) > 1e-6 || Math.abs(c.lat - s.centerLat) > 1e-6) {
        this.map.setCenter(center);
      }
    }

    // plot data if present
    if (dv && dv.table && this.updateFromTable(dv)) {
      // ok
    } else if (dv) {
      this.updateFromCategorical(dv);
    }

    this.map.resize();
  }

  public destroy(): void {
    this.ro?.disconnect(); this.ro = undefined;
    this.map?.remove(); this.map = undefined;
    this.root.innerHTML = "";
  }

  private applyBlackLandGrayWater(): void {
    // no-op for TomTom raster
  }

  private pickStyleURL(_s: MapSettings): string | undefined {
    // returning undefined makes buildMapIfNeeded use TOMTOM_RASTER_STYLE
    return undefined;
  }

  // Replace the whole updateFromCategorical with this version
  private updateFromCategorical(dv: DataView): boolean {
    if (!this.map) return false;
    const cat = (dv as any)?.categorical;
    if (!cat) return false;

    // Helpers: find a series by role name in values or categories
    const hasRole = (src: any, names: string[]) =>
      !!(src?.roles && names.some(n => (src.roles as any)[n]));

    const byDisplay = (src: any, names: string[]) =>
      !!(src?.displayName && names.map(n => n.toLowerCase()).includes(String(src.displayName).toLowerCase()));

    const findValues = (names: string[]) => {
      const v = (cat.values || []).find((s: any) => hasRole(s.source, names) || byDisplay(s.source, names));
      return v ? (v.values as any[]) : undefined;
    };

    const findCategories = (names: string[]) => {
      const c = (cat.categories || []).find((s: any) => hasRole(s.source, names) || byDisplay(s.source, names));
      return c ? (c.values as any[]) : undefined;
    };

    // Try values first (if your mapping uses measures), else categories (your current mapping)
    let latArr = findValues(["latitude","lat"]) ?? findCategories(["latitude","lat"]);
    let lonArr = findValues(["longitude","lon"]) ?? findCategories(["longitude","lon"]);

    if (!latArr || !lonArr) return false;

    const N = Math.min(latArr.length, lonArr.length);
    const feats: any[] = [];
    for (let i = 0; i < N; i++) {
      const la = Number(String(latArr[i]).trim().replace(",", "."));
      const lo = Number(String(lonArr[i]).trim().replace(",", "."));
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lo, la] }, properties: {} });
      }
    }
    if (!feats.length) return false;

    const fc = { type: "FeatureCollection", features: feats } as any;
    const map = this.map as any;
    const srcId = "user-points";
    const layerId = "user-points-circle";

    if (map.getSource(srcId)) { try { (map.getSource(srcId) as any).setData(fc); } catch {} }
    else { try { map.addSource(srcId, { type: "geojson", data: fc }); } catch {} }

    if (!map.getLayer(layerId)) {
      try {
        map.addLayer({
          id: layerId,
          type: "circle",
          source: srcId,
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff3b30",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1
          }
        });
      } catch {}
    }

    if (!this.userInteracted && feats.length) {
      try {
        const coords = feats.map(f => f.geometry.coordinates) as [number, number][];
        const bounds = coords.reduce(
          (b: any, c: any) => b.extend(c),
          new (maplibregl as any).LngLatBounds(coords[0], coords[0])
        );
        (this.map as any).fitBounds(bounds, { padding: 20, animate: false });
      } catch {}
    }

    return true;
  }

}
