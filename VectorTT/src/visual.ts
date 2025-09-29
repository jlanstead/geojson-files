import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;

// MapLibre (CSP build + worker) — required for Power BI sandbox
// @ts-ignore
import * as maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
// @ts-ignore
import MapLibreWorker from "maplibre-gl/dist/maplibre-gl-csp-worker";
// wire the CSP workerClass so MapLibre doesn't try to create blocked blob workers
(maplibregl as any).workerClass = MapLibreWorker;
// include MapLibre CSS
import "maplibre-gl/dist/maplibre-gl.css";

type BaseStyle = "streets" | "dark" | "gray" | "darkgray";
type BubbleSettings = {
  scaleBySize?: boolean;
  radiusFixed?: number;
  radiusMin?: number;
  radiusMax?: number;
  fillColor?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
};
type MapSettings = {
  zoom: number; centerLat: number; centerLon: number; baseStyle: BaseStyle;
  labelsOn: boolean; roadsOn: boolean; buildingsOn: boolean; bordersNatOn: boolean; bordersSubOn: boolean;
  bubble?: BubbleSettings;
};

const TOMTOM_KEY = "x10wLdMTZk1FrwDa2ab439Ghi4ZVTrj1";
const ttStyle = (theme: "main" | "night") =>
  `https://api.tomtom.com/style/2/style/standard.json?key=${TOMTOM_KEY}&theme=${theme}`;

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private mapDiv: HTMLDivElement;
  private map?: maplibregl.Map;
  private ro?: ResizeObserver;
  private userInteracted = false;
  private lastPointsFC?: GeoJSON.FeatureCollection;
  private lastSettings?: MapSettings;
  private cachedLayerIds: string[] = [];

  constructor(opts: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = opts.element;
    this.root.classList.add("pbi-maplibre-root");

    this.mapDiv = document.createElement("div");
    this.mapDiv.className = "map-container";
    Object.assign(this.mapDiv.style, {
      width: "100%", height: "100%", position: "relative", zIndex: "1",
      pointerEvents: "auto", touchAction: "none"
    });
    this.mapDiv.tabIndex = 0;
    this.root.appendChild(this.mapDiv);
  }

  // ---- Settings helpers ------------------------------------------------
  private num(v:any){ const n = Number(v?.numeric ?? v); return Number.isFinite(n) ? n : undefined; }
  private color(v:any){ try { return v?.solid?.color ?? v ?? undefined; } catch { return undefined; } }

  private readSettings(dv?: DataView): MapSettings {
    const dflt: MapSettings = {
      zoom: 11, centerLat: 35.2271, centerLon: -80.8431, baseStyle: "streets",
      labelsOn: true, roadsOn: true, buildingsOn: true, bordersNatOn: true, bordersSubOn: true,
      bubble: undefined
    };
    try {
      const objs = (dv?.metadata as any)?.objects || {};
      const map = objs.map || {};
      const bubble = objs.bubble || {};

      const s: MapSettings = {
        zoom: this.num(map.zoom) ?? dflt.zoom,
        centerLat: this.num(map.centerLat) ?? dflt.centerLat,
        centerLon: this.num(map.centerLon) ?? dflt.centerLon,
        baseStyle: ((): BaseStyle => {
          const v = String(map.baseStyle?.value ?? map.baseStyle ?? dflt.baseStyle);
          return (["streets","dark","gray","darkgray"] as BaseStyle[]).includes(v as BaseStyle) ? (v as BaseStyle) : "streets";
        })(),
        labelsOn:     !!(map.labelsOn ?? dflt.labelsOn),
        roadsOn:      !!(map.roadsOn ?? dflt.roadsOn),
        buildingsOn:  !!(map.buildingsOn ?? dflt.buildingsOn),
        bordersNatOn: !!(map.bordersNatOn ?? dflt.bordersNatOn),
        bordersSubOn: !!(map.bordersSubOn ?? dflt.bordersSubOn),
        bubble: {
          scaleBySize: !!(bubble.scaleBySize ?? false),
          radiusFixed: this.num(bubble.radiusFixed),
          radiusMin:   this.num(bubble.radiusMin),
          radiusMax:   this.num(bubble.radiusMax),
          fillColor:   this.color(bubble.fillColor),
          opacity:     this.num(bubble.opacity),
          strokeColor: this.color(bubble.strokeColor),
          strokeWidth: this.num(bubble.strokeWidth)
        }
      };
      return s;
    } catch {
      return dflt;
    }
  }

  // ---- Map bootstrap (VECTOR) -----------------------------------------
  private buildMapIfNeeded(s: MapSettings) {
    if (this.map) return;

    const theme = (s.baseStyle === "dark" || s.baseStyle === "darkgray") ? "night" : "main";
    this.map = new maplibregl.Map({
      container: this.mapDiv,
      style: ttStyle(theme),
      center: [s.centerLon, s.centerLat],
      zoom: s.zoom,
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

    // After every style load, re-cache and apply toggles/theme
    const apply = () => {
      this.cacheLayerIds();
      this.applyToggles(s);
      if (s.baseStyle === "gray" || s.baseStyle === "darkgray") this.applyVectorGray(s.baseStyle);
      // re-apply points (style change drops sources/layers)
      if (this.lastPointsFC) this.paintPoints(this.lastPointsFC, s);
    };
    this.map.on("load", apply);
    this.map.on("styledata", () => { if (this.map?.isStyleLoaded()) apply(); });

    // keep gestures inside map
    const stop = (e: Event) => e.stopPropagation();
    const passive = { passive: false } as AddEventListenerOptions;
    ["wheel","pointerdown","pointerup","pointermove","touchstart","touchmove","touchend"]
      .forEach(evt => this.mapDiv.addEventListener(evt, stop, passive));

    const mark = () => { this.userInteracted = true; };
    this.map.on("dragstart", mark);
    this.map.on("zoomstart", mark);
    this.map.on("rotatestart", mark);
    this.map.on("pitchstart", mark);

    this.ro = new ResizeObserver(() => this.map?.resize());
    this.ro.observe(this.root);
  }

  private cacheLayerIds() {
    try {
      const layers = (this.map as any)?.getStyle()?.layers || [];
      this.cachedLayerIds = layers.map((l:any) => l.id);
    } catch { this.cachedLayerIds = []; }
  }

  // Heuristic groups for TomTom style
  private groups = {
    labels:     [/label/i, /text/i, /name/i],
    roads:      [/road|street|highway|transport/i],
    buildings:  [/building|extrusion/i],
    bordersNat: [/boundary|admin-0|country/i],
    bordersSub: [/admin-1|admin-2|state|province/i]
  };

  private setVisibility(matchers: RegExp[], on: boolean) {
    for (const id of this.cachedLayerIds) {
      if (matchers.some(rx => rx.test(id))) {
        try { this.map!.setLayoutProperty(id, "visibility", on ? "visible" : "none"); } catch {}
      }
    }
  }

  private applyToggles(s: MapSettings) {
    this.setVisibility(this.groups.labels,     s.labelsOn);
    this.setVisibility(this.groups.roads,      s.roadsOn);
    this.setVisibility(this.groups.buildings,  s.buildingsOn);
    this.setVisibility(this.groups.bordersNat, s.bordersNatOn);
    this.setVisibility(this.groups.bordersSub, s.bordersSubOn);
  }

  // Vector “Grayscale (Light/Dark)” – recolor common paint props
  private applyVectorGray(which: "gray" | "darkgray") {
    const layers = (this.map as any)?.getStyle()?.layers || [];
    const light = which === "gray";
    const text = light ? "#555" : "#cfcfcf";
    const line = light ? "#888" : "#4a4a4a";
    const fill = light ? "#e6e6e6" : "#303030";
    const water= light ? "#dcdcdc" : "#2a2a2a";
    const bg   = light ? "#f2f2f2" : "#1e1e1e";

    for (const layer of layers) {
      const id = layer.id; const type = layer.type;
      try {
        if (type === "background") { this.map!.setPaintProperty(id, "background-color", bg); continue; }
        if (type === "line")       { this.map!.setPaintProperty(id, "line-color", line); }
        if (type === "fill") {
          const isWater = /water|ocean|river|hydro/i.test(id);
          this.map!.setPaintProperty(id, "fill-color", isWater ? water : fill);
          try { this.map!.setPaintProperty(id, "fill-outline-color", line); } catch {}
        }
        if (type === "symbol") {
          try { this.map!.setPaintProperty(id, "text-color",  text); } catch {}
          try { this.map!.setPaintProperty(id, "icon-color",  text); } catch {}
          try { this.map!.setPaintProperty(id, "text-halo-color", light ? "#fff" : "#000"); } catch {}
        }
        if (type === "fill-extrusion") {
          this.map!.setPaintProperty(id, "fill-extrusion-color", fill);
        }
        if (type === "hillshade") {
          this.map!.setPaintProperty(id, "hillshade-shadow-color", light ? "#bbb" : "#222");
        }
      } catch { /* ignore layer-specific failures */ }
    }
  }

  // ---- Data → points ---------------------------------------------------
  private buildPointsFromTable(dv: DataView): GeoJSON.Feature[] {
    const t = dv.table; if (!t) return [];
    const cols = (t.columns || []).map((c:any)=> (c && (c.displayName || (c.roles && Object.keys(c.roles)[0])) ) || "");
    const idx = (n:string)=> { const q=n.toLowerCase(); for (let i=0;i<cols.length;i++) if ((cols[i]||"").toLowerCase()===q) return i; return -1; };

    const iLat = idx("Latitude"), iLon = idx("Longitude");
    const feats: GeoJSON.Feature[] = [];
    for (const r of t.rows || []) {
      const la = (iLat>=0 && r[iLat]!=null) ? Number(r[iLat]) : NaN;
      const lo = (iLon>=0 && r[iLon]!=null) ? Number(r[iLon]) : NaN;
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        feats.push({ type:"Feature", geometry:{ type:"Point", coordinates:[lo, la] }, properties:{} });
      }
    }
    return feats;
  }

  private buildPointsFromCategorical(dv: DataView): GeoJSON.Feature[] {
    const cat = (dv as any)?.categorical; if (!cat) return [];
    const hasRole = (src:any, names:string[]) => !!(src?.roles && names.some(n => (src.roles as any)[n]));
    const byName  = (src:any, names:string[]) => !!(src?.displayName && names.map(n=>n.toLowerCase()).includes(String(src.displayName).toLowerCase()));

    const findVals = (names:string[]) => {
      const v = (cat.values || []).find((s:any)=> hasRole(s.source, names) || byName(s.source, names));
      return v ? (v.values as any[]) : undefined;
    };
    const findCats = (names:string[]) => {
      const c = (cat.categories || []).find((s:any)=> hasRole(s.source, names) || byName(s.source, names));
      return c ? (c.values as any[]) : undefined;
    };

    const latArr = findVals(["latitude","lat"]) ?? findCats(["latitude","lat"]);
    const lonArr = findVals(["longitude","lon"]) ?? findCats(["longitude","lon"]);
    if (!latArr || !lonArr) return [];

    const n = Math.min(latArr.length, lonArr.length);
    const feats: GeoJSON.Feature[] = [];
    for (let i=0;i<n;i++){
      const la = Number(String(latArr[i]).trim().replace(",","."));
      const lo = Number(String(lonArr[i]).trim().replace(",","."));
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        feats.push({ type:"Feature", geometry:{ type:"Point", coordinates:[lo, la] }, properties:{} });
      }
    }
    return feats;
  }

  private paintPoints(fc: GeoJSON.FeatureCollection, s: MapSettings) {
    if (!this.map) return;
    const map = this.map as any;
    const srcId = "user-points", layerId = "user-points-circle";

    if (map.getSource(srcId)) { try { (map.getSource(srcId) as any).setData(fc); } catch {} }
    else { try { map.addSource(srcId, { type: "geojson", data: fc }); } catch {} }

    // typed bubble settings with safe numeric extraction (preserves zeros)
    const b: BubbleSettings = s.bubble ?? {};

    const num = (v: unknown, fallback: number) =>
      (typeof v === "number" && isFinite(v)) ? (v as number) : fallback;

    const r  = num(b.radiusFixed, 6);   // radius (allows 0)
    const sw = num(b.strokeWidth, 1);   // stroke width (allows 0)
    const op = num(b.opacity, 0.9);     // opacity

    if (!map.getLayer(layerId)) {
      try {
        map.addLayer({
          id: layerId, type: "circle", source: srcId,
          paint: {
            "circle-radius": r,
            "circle-color": b.fillColor || "#ff3b30",
            "circle-opacity": op,
            "circle-stroke-color": b.strokeColor || "#ffffff",
            "circle-stroke-width": sw
          }
        });
      } catch {}
    } else {
      try { map.setPaintProperty(layerId, "circle-radius", r); } catch {}
      try { map.setPaintProperty(layerId, "circle-color",  b.fillColor || "#ff3b30"); } catch {}
      try { map.setPaintProperty(layerId, "circle-opacity", op); } catch {}
      try { map.setPaintProperty(layerId, "circle-stroke-color", b.strokeColor || "#ffffff"); } catch {}
      try { map.setPaintProperty(layerId, "circle-stroke-width", sw); } catch {}
    }
  }

  private autofit(feats: GeoJSON.Feature[]) {
    if (!this.map || this.userInteracted || !feats.length) return;
    try {
      const coords = feats.map(f => (f.geometry as any).coordinates) as [number,number][];
      const b = coords.reduce((acc:any,c:any)=> acc.extend(c), new (maplibregl as any).LngLatBounds(coords[0], coords[0]));
      (this.map as any).fitBounds(b, { padding: 20, animate: false, maxZoom: 12 });
    } catch {}
  }

  // ---- Power BI lifecycle ---------------------------------------------
  public update(o: VisualUpdateOptions) {
    const dv = o.dataViews?.[0];
    const s = this.readSettings(dv);
    this.lastSettings = s;

    this.buildMapIfNeeded(s);
    if (!this.map) return;

    // honor center/zoom until first user gesture
    if (!this.userInteracted) {
      if (Math.abs(this.map.getZoom() - s.zoom) > 0.01) this.map.setZoom(s.zoom);
      const c = this.map.getCenter();
      if (Math.abs(c.lng - s.centerLon) > 1e-6 || Math.abs(c.lat - s.centerLat) > 1e-6) {
        this.map.setCenter([s.centerLon, s.centerLat]);
      }
    }

    // If baseStyle (light/dark/gray) changed, swap the vector theme
    const theme = (s.baseStyle === "dark" || s.baseStyle === "darkgray") ? "night" : "main";
    // If style URL differs, replace style and re-apply in styledata handler
    try {
      const current = (this.map as any).getStyle?.().sprite || "";
      if (!current || current.indexOf(`/style/2/`) === -1 || (theme === "night" && current.indexOf("night") === -1) || (theme === "main" && current.indexOf("night") !== -1)) {
        this.map.setStyle(ttStyle(theme));
      } else {
        // just re-apply toggles/theme on each update (cheap)
        this.applyToggles(s);
        if (s.baseStyle === "gray" || s.baseStyle === "darkgray") this.applyVectorGray(s.baseStyle);
      }
    } catch {}

    // points
    let feats: GeoJSON.Feature[] = [];
    if (dv?.table) feats = this.buildPointsFromTable(dv);
    if (!feats.length && dv) feats = this.buildPointsFromCategorical(dv);

    if (feats.length) {
      const fc: GeoJSON.FeatureCollection = { type:"FeatureCollection", features: feats };
      this.lastPointsFC = fc;
      this.paintPoints(fc, s);
      this.autofit(feats);
    }

    this.map.resize();
  }

  public destroy() {
    this.ro?.disconnect(); this.ro = undefined;
    this.map?.remove(); this.map = undefined;
    this.root.innerHTML = "";
  }
}

// Minimal local GeoJSON typings so TS doesn't require external @types/geojson
// (keeps the workspace runnable without changing npm deps)
declare namespace GeoJSON {
  interface Geometry {
    type: string;
    coordinates?: any;
  }
  interface Feature<P = any, G extends Geometry = Geometry> {
    type: "Feature";
    geometry: G;
    properties?: P;
  }
  interface FeatureCollection<P = any, G extends Geometry = Geometry> {
    type: "FeatureCollection";
    features: Feature<P, G>[];
  }
}
