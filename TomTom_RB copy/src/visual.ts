import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
// @ts-ignore (browser bundle)
import * as maplibregl from "maplibre-gl";

/*───────────────────────────────────────────────────────────────────────────*
 * Helpers for reading pane values (preserve 0 / false)
 *───────────────────────────────────────────────────────────────────────────*/
const numOr = (v: any, d: number) => {
  const n = Number(v?.numeric ?? v?.value ?? v);
  return Number.isFinite(n) ? n : d;
};
const boolOr = (v: any, d: boolean) =>
  typeof v === "boolean" ? v : (v?.value !== undefined ? Boolean(v.value) : d);
const colorOr = (v: any, d: string) =>
  v?.solid?.color ? String(v.solid.color) : (typeof v === "string" ? v : d);

/*───────────────────────────────────────────────────────────────────────────*
 * Settings
 *───────────────────────────────────────────────────────────────────────────*/
type MapSettings = {
  centerLat: number;
  centerLon: number;
  zoom: number;
  baseStyle: "streets" | "dark" | "gray" | "darkgray";
};
type BubbleSettings = {
  scaleBySize: boolean;
  radiusFixed: number;
  radiusMin: number;
  radiusMax: number;
  fillColor: string;
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
};
type AllSettings = MapSettings & BubbleSettings;

/*───────────────────────────────────────────────────────────────────────────*
 * TomTom styles (Raster)
 *───────────────────────────────────────────────────────────────────────────*/
const TOMTOM_KEY = "x10wLdMTZk1FrwDa2ab439Ghi4ZVTrj1";

// (kept for future vector use if you add layer toggles)
const ttVectorStyle = (theme: "main" | "night") =>
  `https://api.tomtom.com/style/2/style/standard.json?key=${TOMTOM_KEY}&theme=${theme}`;

function tomtomRaster(theme: "main" | "night"): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      tomtom: {
        type: "raster",
        tiles: [
          `https://a.api.tomtom.com/map/1/tile/basic/${theme}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
          `https://b.api.tomtom.com/map/1/tile/basic/${theme}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
          `https://c.api.tomtom.com/map/1/tile/basic/${theme}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
          `https://d.api.tomtom.com/map/1/tile/basic/${theme}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`
        ],
        tileSize: 256
      }
    },
    layers: [{ id: "tomtom", type: "raster", source: "tomtom" }]
  };
}

/*───────────────────────────────────────────────────────────────────────────*
 * Visual
 *───────────────────────────────────────────────────────────────────────────*/
export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private mapDiv: HTMLDivElement;
  private map?: maplibregl.Map;
  private ro?: ResizeObserver;
  private userInteracted = false;

  private settings: AllSettings = {
    // defaults (Charlotte)
    centerLat: 35.2271, centerLon: -80.8431, zoom: 11, baseStyle: "streets",
    scaleBySize: false, radiusFixed: 6, radiusMin: 3, radiusMax: 16,
    fillColor: "#ff3b30", opacity: 0.9, strokeColor: "#ffffff", strokeWidth: 1
  };

  private lastBaseStyle: AllSettings["baseStyle"] | undefined;
  private ptsFC: any | undefined;
  private polysFC: any | undefined;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;
    this.root.classList.add("pbi-maplibre-root");

    this.mapDiv = document.createElement("div");
    this.mapDiv.className = "map-container";
    Object.assign(this.mapDiv.style, {
      width: "100%", height: "100%", position: "relative",
      zIndex: "1", pointerEvents: "auto", touchAction: "none"
    });
    this.mapDiv.tabIndex = 0;
    this.root.appendChild(this.mapDiv);
  }

  /*─────────────────────────────────────────────────────────────────────*
   * Settings
   *─────────────────────────────────────────────────────────────────────*/
  private readSettings(dv?: DataView) {
    const objs = (dv?.metadata as any)?.objects || {};
    const map = objs.map || {};
    const bub = objs.bubble || {};

    // Map
    this.settings.baseStyle = (String(map.baseStyle ?? this.settings.baseStyle) as any);
    this.settings.zoom      = numOr(map.zoom,      this.settings.zoom);
    this.settings.centerLat = numOr(map.centerLat, this.settings.centerLat);
    this.settings.centerLon = numOr(map.centerLon, this.settings.centerLon);

    // Bubbles
    this.settings.scaleBySize = boolOr(bub.scaleBySize, this.settings.scaleBySize);
    this.settings.radiusFixed = numOr(bub.radiusFixed,  this.settings.radiusFixed);
    this.settings.radiusMin   = numOr(bub.radiusMin,    this.settings.radiusMin);
    this.settings.radiusMax   = numOr(bub.radiusMax,    this.settings.radiusMax);
    this.settings.fillColor   = colorOr(bub.fillColor,  this.settings.fillColor);
    this.settings.opacity     = numOr(bub.opacity,      this.settings.opacity);
    this.settings.strokeColor = colorOr(bub.strokeColor,this.settings.strokeColor);
    this.settings.strokeWidth = numOr(bub.strokeWidth,  this.settings.strokeWidth);
  }

  /*─────────────────────────────────────────────────────────────────────*
   * Map creation / style switching
   *─────────────────────────────────────────────────────────────────────*/
  private applyGrayTweaks(mode: "light" | "dark") {
    const id = "tomtom";
    try { this.map!.setPaintProperty(id, "raster-saturation", -1); } catch {}
    const b = mode === "dark" ? 0.38 : 0.90;
    const c = mode === "dark" ? 0.25 : 0.0;
    try { this.map!.setPaintProperty(id, "raster-brightness-min", b); } catch {}
    try { this.map!.setPaintProperty(id, "raster-brightness-max", b); } catch {}
    try { this.map!.setPaintProperty(id, "raster-contrast", c); } catch {}
  }

  private currentStyleSpec(): maplibregl.StyleSpecification {
    // Only "dark" uses night tiles; gray variants start from main then recolor.
    if (this.settings.baseStyle === "dark") return tomtomRaster("night");
    return tomtomRaster("main");
  }

  private buildMapIfNeeded() {
    if (this.map) return;

    this.lastBaseStyle = this.settings.baseStyle;

    this.map = new maplibregl.Map({
      container: this.mapDiv,
      style: this.currentStyleSpec(),
      center: [this.settings.centerLon, this.settings.centerLat],
      zoom: this.settings.zoom,
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

    this.map.on("load", () => {
      if (this.settings.baseStyle === "gray")     this.applyGrayTweaks("light");
      if (this.settings.baseStyle === "darkgray") this.applyGrayTweaks("dark");
      // re-add data if we already had any
      this.readdDataLayersIfNeeded();
    });

    // When style changes (setStyle), re-apply tweaks and re-add layers
    this.map.on("styledata", () => {
      if (!this.map) return;
      if (this.settings.baseStyle === "gray")     this.applyGrayTweaks("light");
      if (this.settings.baseStyle === "darkgray") this.applyGrayTweaks("dark");
      this.readdDataLayersIfNeeded();
      this.applyBubbleStyle(); // restyle circles after re-add
    });

    // keep gestures within the map (PBI host otherwise intercepts)
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

  private ensureMapStyleUpToDate() {
    if (!this.map) return;
    if (this.lastBaseStyle !== this.settings.baseStyle) {
      this.lastBaseStyle = this.settings.baseStyle;
      try { this.map.setStyle(this.currentStyleSpec()); } catch {}
    }
  }

  /*─────────────────────────────────────────────────────────────────────*
   * Data rendering (table / categorical) + bubble styling
   *─────────────────────────────────────────────────────────────────────*/
  private applyBubbleStyle() {
    if (!this.map) return;
    const map: any = this.map;
    const layerId = "user-points-circle";
    if (!map.getLayer(layerId)) return;

    const paint: any = {
      "circle-color": this.settings.fillColor,
      "circle-opacity": this.settings.opacity,
      "circle-stroke-color": this.settings.strokeColor,
      "circle-stroke-width": this.settings.strokeWidth
    };
    // radius is set when we know about size domain; if no size, use fixed:
    if (!("circle-radius" in paint)) {
      try { map.setPaintProperty(layerId, "circle-radius", this.settings.radiusFixed); } catch {}
    }
    try {
      for (const k of Object.keys(paint)) map.setPaintProperty(layerId, k, paint[k]);
    } catch {}
  }

  private updateFromTable(dv: DataView): boolean {
    if (!dv || !dv.table || !this.map) return false;
    const table = dv.table;
    const cols = (table.columns || []).map((c: any) => (c && (c.displayName || (c.roles && Object.keys(c.roles)[0])) ) || "");
    const idx = (name: string) => {
      const n = name.toLowerCase();
      for (let i = 0; i < cols.length; i++) if ((cols[i] || "").toLowerCase() === n) return i;
      return -1;
    };

    const iKind = idx("Kind");
    const iName = idx("Name");
    const iLat  = idx("Latitude");
    const iLon  = idx("Longitude");
    const iPoly = idx("Polygon");
    const iSize = idx("Size");

    const pointFeatures: any[] = [];
    const polygonFeatures: any[] = [];
    let minS: number|undefined, maxS: number|undefined;

    for (const r of table.rows || []) {
      const kind = iKind >= 0 ? String(r[iKind] ?? "") : "";
      const name = iName >= 0 ? String(r[iName] ?? "") : "";
      const lat  = iLat  >= 0 ? Number(r[iLat]) : NaN;
      const lon  = iLon  >= 0 ? Number(r[iLon]) : NaN;
      const sz   = iSize >= 0 ? Number(r[iSize]) : undefined;

      if (/polygon/i.test(kind) && iPoly >= 0 && r[iPoly] != null) {
        const raw = r[iPoly] as powerbi.PrimitiveValue; // number | string | Date | etc.

        let coords: any;
        if (typeof raw === "string") {
          // raw is now narrowed to string – safe to parse
          try { coords = JSON.parse(raw as string); } catch { coords = undefined; }
        } else {
          // already an object/array? just use it; if it’s a number/other, this will be ignored below
          coords = raw as any;
        }

        if (coords) {
          // normalize: allow either [[...],[...]] or a single ring
          const normalized = Array.isArray(coords[0]) ? coords : [coords];
          polygonFeatures.push({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: normalized[0] ? normalized[0] : normalized },
            properties: { name, kind }
          });
        }
        continue;
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (Number.isFinite(sz as any)) {
          minS = minS === undefined ? (sz as number) : Math.min(minS, sz as number);
          maxS = maxS === undefined ? (sz as number) : Math.max(maxS, sz as number);
        }
        pointFeatures.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { name, kind, size: sz } });
      }
    }

    const ptsGeo = { type: "FeatureCollection", features: pointFeatures };
    const polysGeo = { type: "FeatureCollection", features: polygonFeatures };
    this.ptsFC = ptsGeo; this.polysFC = polysGeo;

    const map = this.map as any;
    const ensureSource = (id: string, data: any) => {
      if (map.getSource(id)) { try { (map.getSource(id) as any).setData(data); } catch {} }
      else { try { map.addSource(id, { type: "geojson", data }); } catch {} }
    };

    // clear old layers/sources
    try {
      ["user-polygons-fill","user-polygons-line","user-points-circle"].forEach(id => { if (map.getLayer(id)) try { map.removeLayer(id); } catch {} });
      ["user-polygons","user-points"].forEach(id => { if (map.getSource(id)) try { map.removeSource(id); } catch {} });
    } catch {}

    if (polygonFeatures.length) ensureSource("user-polygons", polysGeo);
    if (pointFeatures.length)   ensureSource("user-points", ptsGeo);

    if (polygonFeatures.length) {
      try { map.addLayer({ id: "user-polygons-fill", type: "fill", source: "user-polygons", paint: { "fill-color": "#000000", "fill-opacity": 0.4 } }); } catch {}
      try { map.addLayer({ id: "user-polygons-line", type: "line", source: "user-polygons", paint: { "line-color": "#3a3a3a", "line-width": 1 } }); } catch {}
    }

    if (pointFeatures.length) {
      const paint: any = {
        "circle-color": this.settings.fillColor,
        "circle-opacity": this.settings.opacity,
        "circle-stroke-color": this.settings.strokeColor,
        "circle-stroke-width": this.settings.strokeWidth
      };
      if (this.settings.scaleBySize && minS !== undefined && maxS !== undefined && maxS > minS) {
        paint["circle-radius"] = [
          "interpolate", ["linear"], ["coalesce", ["get","size"], minS],
          minS, this.settings.radiusMin,
          maxS, this.settings.radiusMax
        ];
      } else {
        paint["circle-radius"] = this.settings.radiusFixed;
      }

      try { map.addLayer({ id: "user-points-circle", type: "circle", source: "user-points", paint }); } catch {}
    }

    if (!this.userInteracted && (pointFeatures.length || polygonFeatures.length)) {
      try {
        const all = [...polygonFeatures, ...pointFeatures];
        const bbox = this.featureCollectionBBox(all);
        if (bbox) (this.map as any).fitBounds(bbox, { padding: 20, animate: false });
      } catch {}
    }

    return !!(pointFeatures.length || polygonFeatures.length);
  }

  private updateFromCategorical(dv: DataView): boolean {
    if (!this.map) return false;
    const cat = (dv as any)?.categorical;
    if (!cat) return false;

    const hasRole = (src: any, names: string[]) => !!(src?.roles && names.some(n => (src.roles as any)[n]));
    const byDisplay = (src: any, names: string[]) => !!(src?.displayName && names.map(n => n.toLowerCase()).includes(String(src.displayName).toLowerCase()));

    const findValues = (names: string[]) => {
      const v = (cat.values || []).find((s: any) => hasRole(s.source, names) || byDisplay(s.source, names));
      return v ? (v.values as any[]) : undefined;
    };
    const findCategories = (names: string[]) => {
      const c = (cat.categories || []).find((s: any) => hasRole(s.source, names) || byDisplay(s.source, names));
      return c ? (c.values as any[]) : undefined;
    };

    const latArr  = findValues(["latitude","lat"])  ?? findCategories(["latitude","lat"]);
    const lonArr  = findValues(["longitude","lon"]) ?? findCategories(["longitude","lon"]);
    const sizeArr = findValues(["size"]);
    if (!latArr || !lonArr) return false;

    const feats: any[] = [];
    let minS: number|undefined, maxS: number|undefined;
    const n = Math.min(latArr.length, lonArr.length);

    for (let i = 0; i < n; i++) {
      const la = Number(String(latArr[i]).trim().replace(",", "."));
      const lo = Number(String(lonArr[i]).trim().replace(",", "."));
      let sz: number|undefined;
      if (sizeArr && sizeArr[i] != null) {
        const v = Number(sizeArr[i]);
        if (Number.isFinite(v)) { sz = v; minS = minS === undefined ? v : Math.min(minS, v); maxS = maxS === undefined ? v : Math.max(maxS, v); }
      }
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lo, la] }, properties: { size: sz } });
      }
    }

    const fc = { type: "FeatureCollection", features: feats } as any;
    this.ptsFC = fc;

    const map = this.map as any;
    const srcId = "user-points";
    const layerId = "user-points-circle";

    if (map.getSource(srcId)) { try { (map.getSource(srcId) as any).setData(fc); } catch {} }
    else { try { map.addSource(srcId, { type: "geojson", data: fc }); } catch {} }

    const paint: any = {
      "circle-color": this.settings.fillColor,
      "circle-opacity": this.settings.opacity,
      "circle-stroke-color": this.settings.strokeColor,
      "circle-stroke-width": this.settings.strokeWidth
    };
    if (this.settings.scaleBySize && minS !== undefined && maxS !== undefined && maxS > minS) {
      paint["circle-radius"] = [
        "interpolate", ["linear"], ["coalesce", ["get","size"], minS],
        minS, this.settings.radiusMin,
        maxS, this.settings.radiusMax
      ];
    } else {
      paint["circle-radius"] = this.settings.radiusFixed;
    }

    if (!map.getLayer(layerId)) { try { map.addLayer({ id: layerId, type: "circle", source: srcId, paint }); } catch {} }
    else {
      for (const k of Object.keys(paint)) { try { map.setPaintProperty(layerId, k, paint[k]); } catch {} }
    }

    if (!this.userInteracted && feats.length) {
      try {
        const coords = feats.map(f => f.geometry.coordinates) as [number, number][];
        const bounds = coords.reduce((b: any, c: any) => b.extend(c), new (maplibregl as any).LngLatBounds(coords[0], coords[0]));
        (this.map as any).fitBounds(bounds, { padding: 20, animate: false });
      } catch {}
    }
    return true;
  }

  private readdDataLayersIfNeeded() {
    if (!this.map) return;
    const map: any = this.map;

    // re-add points
    if (this.ptsFC) {
      if (!map.getSource("user-points")) {
        try { map.addSource("user-points", { type: "geojson", data: this.ptsFC }); } catch {}
      }
      if (!map.getLayer("user-points-circle")) {
        try { map.addLayer({ id: "user-points-circle", type: "circle", source: "user-points" }); } catch {}
      }
    }
    // re-add polys
    if (this.polysFC) {
      if (!map.getSource("user-polygons")) {
        try { map.addSource("user-polygons", { type: "geojson", data: this.polysFC }); } catch {}
      }
      if (!map.getLayer("user-polygons-fill")) {
        try { map.addLayer({ id: "user-polygons-fill", type: "fill", source: "user-polygons", paint: { "fill-color": "#000", "fill-opacity": 0.4 } }); } catch {}
      }
      if (!map.getLayer("user-polygons-line")) {
        try { map.addLayer({ id: "user-polygons-line", type: "line", source: "user-polygons", paint: { "line-color": "#3a3a3a", "line-width": 1 } }); } catch {}
      }
    }
  }

  private featureCollectionBBox(features: any[]): [[number, number],[number, number]] | null {
    if (!features || !features.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const visit = (coords: any) => {
      if (typeof coords[0] === "number") {
        const x = coords[0], y = coords[1];
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      } else for (const c of coords) visit(c);
    };
    try {
      for (const f of features) {
        const g = f.geometry; if (!g) continue;
        if (g.type === "Point") visit(g.coordinates);
        else if (g.type === "Polygon") visit(g.coordinates);
        else if (g.type === "MultiPolygon") visit(g.coordinates);
      }
      if (minX === Infinity) return null;
      return [[minX, minY], [maxX, maxY]];
    } catch { return null; }
  }

  /*─────────────────────────────────────────────────────────────────────*
   * Power BI lifecycle
   *─────────────────────────────────────────────────────────────────────*/
  public update(opts: VisualUpdateOptions): void {
    const dv = (opts.dataViews && opts.dataViews[0]) ? opts.dataViews[0] : undefined;

    this.readSettings(dv);
    this.buildMapIfNeeded();
    this.ensureMapStyleUpToDate();

    if (!this.map) return;

    // honor zoom/center until first interaction
    if (!this.userInteracted) {
      if (Math.abs(this.map.getZoom() - this.settings.zoom) > 0.01) this.map.setZoom(this.settings.zoom);
      const c = this.map.getCenter();
      if (Math.abs(c.lng - this.settings.centerLon) > 1e-6 || Math.abs(c.lat - this.settings.centerLat) > 1e-6) {
        this.map.setCenter([this.settings.centerLon, this.settings.centerLat]);
      }
    }

    // draw data
    if (dv && dv.table && this.updateFromTable(dv)) {
      // done
    } else if (dv) {
      this.updateFromCategorical(dv);
    }

    // make sure bubble style reflects latest pane values (covers strokeWidth=0 etc.)
    this.applyBubbleStyle();

    this.map.resize();
  }

  public destroy(): void {
    this.ro?.disconnect(); this.ro = undefined;
    this.map?.remove(); this.map = undefined;
    this.root.innerHTML = "";
  }

  /*─────────────────────────────────────────────────────────────────────*
   * Formatting Pane (cards)
   *─────────────────────────────────────────────────────────────────────*/
  public enumerateObjectInstances(
    options: powerbi.EnumerateVisualObjectInstancesOptions
  ): powerbi.VisualObjectInstance[] {
    if (options.objectName === "map") {
      return [{
        objectName: "map",
        properties: {
          baseStyle: this.settings.baseStyle,
          zoom: this.settings.zoom,
          centerLat: this.settings.centerLat,
          centerLon: this.settings.centerLon
        },
        selector: null
      }];
    }

    if (options.objectName === "bubble") {
      return [{
        objectName: "bubble",
        properties: {
          scaleBySize: this.settings.scaleBySize,
          radiusFixed: this.settings.radiusFixed,
          radiusMin:   this.settings.radiusMin,
          radiusMax:   this.settings.radiusMax,
          fillColor:   { solid: { color: this.settings.fillColor } },
          opacity:     this.settings.opacity,
          strokeColor: { solid: { color: this.settings.strokeColor } },
          strokeWidth: this.settings.strokeWidth
        },
        selector: null
      }];
    }

    return [];
  }
}
