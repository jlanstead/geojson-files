import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;
// Use browser bundle (no Node shims in PBI sandbox)
// @ts-ignore
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

type MapSettings = { zoom: number; centerLat: number; centerLon: number; };

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private mapDiv: HTMLDivElement;
  private map?: maplibregl.Map;
  private userInteracted = false;
  private ro?: ResizeObserver;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;
    this.root.classList.add("pbi-maplibre-root");

    // create container that will accept pointer/wheel events
    this.mapDiv = document.createElement("div");
    this.mapDiv.className = "map-container";
    this.mapDiv.style.width = "100%";
    this.mapDiv.style.height = "100%";
    this.mapDiv.style.position = "relative";
    this.mapDiv.style.zIndex = "1";
    this.mapDiv.style.pointerEvents = "auto";
    this.mapDiv.style.touchAction = "none"; // let MapLibre handle gestures
    this.mapDiv.tabIndex = 0;
    this.root.appendChild(this.mapDiv);
  }

  // ---- Read pane settings if present; otherwise defaults ----
  private readSettings(dv?: DataView): MapSettings {
    const defaults: MapSettings = { zoom: 3, centerLat: 39.8, centerLon: -98.5 };
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

  // ---- Create map once; let MapLibre own interactions ----
  private buildMapIfNeeded(center: [number, number], zoom: number, styleUrl?: string) {
    if (this.map) return;

    const styleToUse = styleUrl || "https://demotiles.maplibre.org/style.json";

    this.map = new maplibregl.Map({
      container: this.mapDiv,
      style: styleToUse,
      center,
      zoom,
      dragRotate: false
    });

    // Ensure MapLibre interactions are enabled
    try {
      this.map.scrollZoom.enable();
      this.map.dragPan.enable();
      this.map.doubleClickZoom.enable();
      this.map.boxZoom.enable();
      this.map.keyboard.enable();
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }));
    } catch (e) { /* ignore if older map builds */ }

    // On load: ensure canvas allows pointer events and apply dark paint overrides
    this.map.on("load", () => {
      try { console.log("MAP LAYERS:", (this.map as any).getStyle().layers.map((l:any)=>l.id)); } catch {}

      const oceanGray = "#5b6166";
      const landBlack = "#000000";
      const lineGray = "#3a3a3a";
      const labelGray = "#bfbfbf";

      try {
        const layers = (this.map as any).getStyle().layers || [];
        // set background first (base ocean)
        try { this.map!.setPaintProperty((layers.find((l:any)=>l.type==="background")||{}).id || "background", "background-color", oceanGray); } catch {}

        layers.forEach((layer: any) => {
          const id = layer.id || "";
          try {
            // hide raster base tiles that may be painting water/land
            if (layer.type === "raster") {
              try { this.map!.setPaintProperty(id, "raster-opacity", 0); } catch {}
              try { this.map!.setPaintProperty(id, "raster-opacity-transition", { duration: 0 }); } catch {}
              return;
            }

            // background
            if (layer.type === "background") {
              try { this.map!.setPaintProperty(id, "background-color", oceanGray); } catch {}
              return;
            }

            // fill layers: force opacity and colors; remove patterns if present
            if (layer.type === "fill") {
              const isWater = /water|ocean|sea|hydro|river|marine/i.test(id) ||
                              (layer.source && /water|hydro|ocean|marine/i.test(String(layer.source)));
              if (isWater) {
                try { this.map!.setPaintProperty(id, "fill-color", oceanGray); } catch {}
                try { this.map!.setPaintProperty(id, "fill-opacity", 1); } catch {}
                try { this.map!.setPaintProperty(id, "fill-pattern", ""); } catch {}
              } else {
                try { this.map!.setPaintProperty(id, "fill-color", landBlack); } catch {}
                try { this.map!.setPaintProperty(id, "fill-outline-color", landBlack); } catch {}
                try { this.map!.setPaintProperty(id, "fill-opacity", 1); } catch {}
                try { this.map!.setPaintProperty(id, "fill-pattern", ""); } catch {}
              }
              return;
            }

            // line layers -> subtle gray and fully visible
            if (layer.type === "line") {
              try { this.map!.setPaintProperty(id, "line-color", lineGray); } catch {}
              try { this.map!.setPaintProperty(id, "line-opacity", 1); } catch {}
              try { this.map!.setPaintProperty(id, "line-width", 1); } catch {}
              return;
            }

            // symbols (labels/icons): color adjustments
            if (layer.type === "symbol") {
              try { this.map!.setPaintProperty(id, "text-color", labelGray); } catch {}
              try { this.map!.setPaintProperty(id, "text-halo-color", "#000000"); } catch {}
              try { this.map!.setPaintProperty(id, "icon-color", labelGray); } catch {}
              try { this.map!.setLayoutProperty(id, "visibility", "visible"); } catch {}
              return;
            }

            // other types: attempt safe ops
            try { this.map!.setPaintProperty(id, "opacity", 1); } catch {}
          } catch (e) { /* per-layer ignore */ }
        });
      } catch (e) { /* overall ignore */ }

      this.map?.resize();
    });

    // Prevent Power BI host from intercepting pointer/wheel events before MapLibre receives them
    const stop = (e: Event) => {
      e.stopPropagation();
    };
    const passiveOptions = { passive: false } as AddEventListenerOptions;
    ["wheel", "pointerdown", "pointerup", "pointermove", "touchstart", "touchmove", "touchend"].forEach(evt =>
      this.mapDiv.addEventListener(evt, stop, passiveOptions)
    );

    // mark that user has interacted after gestures
    const mark = () => { this.userInteracted = true; };
    this.map.on("dragstart", mark);
    this.map.on("zoomstart", mark);
    this.map.on("rotatestart", mark);
    this.map.on("pitchstart", mark);

    // Keep canvas sized with PBI layout
    this.ro = new ResizeObserver(() => this.map?.resize());
    this.ro.observe(this.root);
  }

  // ---- Optional: plot from Latitude/Longitude ----
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
          // expecting a GeoJSON ring string like: "[[[lon,lat],...]]]"
          const coords = typeof polyText === "string" ? JSON.parse(polyText) : polyText;
          polygonFeatures.push({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: coords[0] ? coords[0] : coords },
            properties: { name, kind }
          });
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    // build GeoJSON sources
    const ptsGeo = { type: "FeatureCollection", features: pointFeatures };
    const polysGeo = { type: "FeatureCollection", features: polygonFeatures };

    // helpers to ensure sources and layers exist or are updated
    const ensureSource = (id: string, data: any) => {
      const map = this.map as any;
      if (map.getSource(id)) {
        try { (map.getSource(id) as any).setData(data); } catch {}
      } else {
        try {
          map.addSource(id, { type: "geojson", data });
        } catch {}
      }
    };

    const safeAddLayer = (layer: any, beforeId?: string) => {
      const map = this.map as any;
      if (!map.getLayer(layer.id)) {
        try { map.addLayer(layer, beforeId); } catch {}
      } else {
        // update paint/layout where possible
        try { map.setPaintProperty(layer.id, "fill-color", layer.paint && layer.paint["fill-color"]); } catch {}
      }
    };

    // remove previous layers if sources are empty to avoid stale visuals
    try {
      const map = this.map as any;
      // remove layers referencing our sources if present
      ["user-polygons-fill", "user-polygons-line", "user-points-circle"].forEach(id => {
        if (map.getLayer(id)) {
          try { map.removeLayer(id); } catch {}
        }
      });
      ["user-polygons", "user-points"].forEach(id => {
        if (map.getSource(id)) {
          try { map.removeSource(id); } catch {}
        }
      });
    } catch {}

    // add sources
    if (polygonFeatures.length) ensureSource("user-polygons", polysGeo);
    if (pointFeatures.length) ensureSource("user-points", ptsGeo);

    // add polygon fill + outline
    if (polygonFeatures.length) {
      try {
        (this.map as any).addLayer({
          id: "user-polygons-fill",
          type: "fill",
          source: "user-polygons",
          paint: {
            "fill-color": "#000000",
            "fill-opacity": 1
          }
        });
      } catch {}
      try {
        (this.map as any).addLayer({
          id: "user-polygons-line",
          type: "line",
          source: "user-polygons",
          paint: {
            "line-color": "#3a3a3a",
            "line-width": 1
          }
        });
      } catch {}
    }

    // add point layer (circle)
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

    // fit map to features if no user interaction yet and features exist
    if (!this.userInteracted) {
      try {
        const allFeatures = [...polygonFeatures, ...pointFeatures];
        if (allFeatures.length) {
          const bbox = this.featureCollectionBBox(allFeatures);
          if (bbox) {
            (this.map as any).fitBounds(bbox, { padding: 20, animate: false });
          }
        }
      } catch {}
    }

    return !!(pointFeatures.length || polygonFeatures.length);
  }

  // compute bbox [sw, ne] from features
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

  // ---- Update ----
  public update(opts: VisualUpdateOptions): void {
    const dv = (opts.dataViews && opts.dataViews[0]) ? opts.dataViews[0] : undefined;
    const s = this.readSettings(dv);
    const center: [number, number] = [s.centerLon, s.centerLat];

    // pick style url and pass to builder so the map will use correct basemap
    const styleUrl = this.pickStyleURL(s);
    this.buildMapIfNeeded(center, s.zoom, styleUrl);

    if (!this.map) return;

    // Only honor settings before first user gesture
    if (!this.userInteracted) {
      if (Math.abs(this.map.getZoom() - s.zoom) > 0.01) this.map.setZoom(s.zoom);
      const c = this.map.getCenter();
      if (Math.abs(c.lng - s.centerLon) > 1e-6 || Math.abs(c.lat - s.centerLat) > 1e-6) {
        this.map.setCenter(center);
      }
    }

    // always re-apply theme/colors from settings (cheap, safe)
    this.applySettingsTheme(s);

    // If table-format data present, prefer it
    if (dv && dv.table && this.updateFromTable(dv)) {
      // drawn from table
    } else if (dv) {
      // fallback to categorical / other handlers
      if (!this.updateFromCategorical(dv)) {
        // nothing
      }
    }

    this.map.resize();
  }

  public destroy(): void {
    this.ro?.disconnect(); this.ro = undefined;
    this.map?.remove(); this.map = undefined;
    this.root.innerHTML = "";
  }

  // Force black land and gray water; safe (skips missing layers)
  private applyBlackLandGrayWater(): void {
    if (!this.map) return;
    const map = this.map as any;

    const setIf = (id: string, prop: string, val: any) => {
      try { if (map.getLayer(id)) map.setPaintProperty(id, prop, val); } catch {}
    };

    // Land / country fills → black
    const landIds = ["country", "countries", "land", "landcover", "landuse", "admin0", "admin-0-fill", "admin-0"];
    landIds.forEach(id => {
      setIf(id, "fill-color", "#000000");
      setIf(id, "background-color", "#000000");
      setIf(id, "fill-outline-color", "#000000");
    });

    // Ocean / water → gray
    const oceanGrey = "#4f5357";
    const waterIds = ["water", "waterway", "ocean", "water-shadow"];
    waterIds.forEach(id => {
      setIf(id, "fill-color", oceanGrey);
      setIf(id, "line-color", oceanGrey);
    });

    // Borders → subtle gray
    const borderIds = ["admin-0-boundary", "admin-1-boundary", "boundary", "country-outline", "state-outline"];
    borderIds.forEach(id => {
      setIf(id, "line-color", "#2b2b2b");
      setIf(id, "line-width", 1);
    });

    // Dim roads and other features so countries remain black focal point
    const dimIds = ["road", "road-primary", "road-secondary", "road-street", "road-minor", "rail", "railway"];
    dimIds.forEach(id => setIf(id, "line-color", "#222222"));

    // Labels → light gray
    const labelIds = ["place-label","country-label","state-label","settlement-label","place-city-label","water-label","road-label"];
    labelIds.forEach(id => {
      setIf(id, "text-color", "#bfbfbf");
      setIf(id, "text-halo-color", "#000000");
      setIf(id, "text-halo-width", 1.0);
    });
  }

  // quick helper to choose a style url (keeps demo as safe fallback)
  private pickStyleURL(s: MapSettings): string {
    // If you later add a TOMTOM key or settings, return that style here.
    return "https://demotiles.maplibre.org/style.json";
  }

  // apply visual/theme settings from the property pane (minimal implementation)
  private applySettingsTheme(s: MapSettings): void {
    // currently we just enforce the black-land / gray-water appearance
    // keep this method small so callers can safely call it every update()
    try { this.applyBlackLandGrayWater(); } catch { /* ignore */ }
  }

  // basic categorical handler: look for latitude/longitude (or lat/lon) role names and render points
  private updateFromCategorical(dv: DataView): boolean {
    try {
      const cat = (dv as any).categorical;
      if (!cat) return false;
      const vals = cat.values || [];

      const findByRoles = (names: string[]) =>
        vals.find((v: any) => v && v.source && v.source.roles && names.some(n => (v.source.roles as any)[n]));

      const latVal = findByRoles(["latitude", "lat"]);
      const lonVal = findByRoles(["longitude", "lon"]);
      if (!latVal || !lonVal) return false;

      const latArr = latVal.values || [];
      const lonArr = lonVal.values || [];
      const feats: any[] = [];
      const n = Math.min(latArr.length, lonArr.length);

      for (let i = 0; i < n; i++) {
        const la = Number(String(latArr[i]).trim().replace(",", "."));
        const lo = Number(String(lonArr[i]).trim().replace(",", "."));
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          feats.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lo, la] },
            properties: {}
          });
        }
      }

      if (!feats.length || !this.map) return false;
      const fc = { type: "FeatureCollection", features: feats } as any;

      // add/update source + layer (safe/no-throw attempts)
      try {
        const map = this.map as any;
        const srcId = "user-points";
        const layerId = "user-points-circle";
        if (map.getSource(srcId)) {
          try { (map.getSource(srcId) as any).setData(fc); } catch {}
        } else {
          try { map.addSource(srcId, { type: "geojson", data: fc }); } catch {}
        }

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
      } catch {}

      // fit bounds if the user hasn't interacted
      try {
        if (!this.userInteracted && feats.length) {
          const coords = feats.map(f => f.geometry.coordinates) as [number, number][];
          const bounds = coords.reduce(
            (b: any, c: any) => b.extend(c),
            new (maplibregl as any).LngLatBounds(coords[0], coords[0])
          );
          try { (this.map as any).fitBounds(bounds, { padding: 20, animate: false }); } catch {}
        }
      } catch {}

      return true;
    } catch {
      return false;
    }
  }
}
