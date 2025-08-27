import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;

// Use the browser build to avoid Node shims (maplibre-gl 3.x)
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

import { VisualSettings } from "./visualSettings";

/* ===== helpers ===== */

function parsePolygonCoordinates(dbStr: string): GeoJSON.Polygon | null {
  if (!dbStr) return null;
  const parts = dbStr.split(/\s*;\s*/).filter(Boolean);
  const ring: [number, number][] = [];

  for (const raw of parts) {
    const t = raw.replace(/[()]/g, "").replace(/\s+/g, "");
    const i = t.indexOf(",");
    if (i < 0) continue;
    const lon = parseFloat(t.slice(0, i));
    const lat = parseFloat(t.slice(i + 1));
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      ring.push([lon, lat]);
    }
  }

  if (ring.length < 3) return null;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: "Polygon", coordinates: [ring] };
}

// secure RNG in (-0.5, 0.5)
function randMinusHalfToHalf(): number {
  const buf = new Uint32Array(1);
  window.crypto.getRandomValues(buf);
  return buf[0] / 0xffffffff - 0.5;
}

function jitterIfDuplicate(
  lat: number,
  lon: number,
  used: Set<string>,
  eps: number
): [number, number] {
  let la = lat,
    lo = lon,
    key = `${la.toFixed(8)},${lo.toFixed(8)}`,
    tries = 0;
  while (used.has(key) && tries < 50) {
    la += randMinusHalfToHalf() * eps;
    lo += randMinusHalfToHalf() * eps;
    key = `${la.toFixed(8)},${lo.toFixed(8)}`;
    tries++;
  }
  used.add(key);
  return [la, lo];
}

const palette = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf"
];
function colorFor(layer: string, overrides: Record<string, string>): string {
  if (overrides && overrides[layer]) return overrides[layer];
  let h = 0;
  for (let i = 0; i < layer.length; i++) h = (h * 31 + layer.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

/* ===== visual ===== */

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private map: maplibregl.Map | null = null;
  private panel: HTMLDivElement | null = null;
  private settings: VisualSettings = new VisualSettings();

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;

    // clear root safely
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);

    // map container
    const mapDiv = document.createElement("div");
    mapDiv.id = "jmap-map";
    mapDiv.setAttribute("style", "position:absolute; inset:0;");
    this.root.appendChild(mapDiv);

    // layer panel
    this.panel = document.createElement("div");
    this.panel.id = "jmap-panel";
    this.panel.setAttribute(
      "style",
      "position:absolute; right:8px; top:8px; max-height:70%; overflow:auto;" +
        "background:#fff; border:1px solid #ccc; border-radius:8px; padding:8px;" +
        "font:12px 'Segoe UI'; box-shadow:0 2px 6px rgba(0,0,0,.1)"
    );
    this.root.appendChild(this.panel);

    // maplibre
    this.map = new maplibregl.Map({
      container: mapDiv,
      style: { version: 8, sources: {}, layers: [] } as any,
      attributionControl: false,
      interactive: true
    });
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
    const dv = options.dataViews?.[0];
    if (!dv || !dv.table || !this.map) return;

    this.settings = this.readSettings(dv);

    const cols = dv.table.columns;
    const idx = {
      legend: cols.findIndex((c) => c.roles?.["LegendType"]),
      lat: cols.findIndex((c) => c.roles?.["Lat"]),
      lon: cols.findIndex((c) => c.roles?.["Lon"]),
      locid: cols.findIndex((c) => c.roles?.["LocationId"]),
      polyid: cols.findIndex((c) => c.roles?.["PolyId"]),
      polyc: cols.findIndex((c) => c.roles?.["PolygonCoordinates"])
    };

    const pointsByLayer = new Map<string, GeoJSON.Feature[]>();
    const polysByLayer = new Map<string, GeoJSON.Feature[]>();
    const used = new Set<string>();

    // STRICT-TS SAFE ROW LOOP
    const rows = (dv.table?.rows ?? []) as powerbi.PrimitiveValue[][];
    for (const r of rows) {
      const layer = String((idx.legend >= 0 ? r[idx.legend] : undefined) ?? "Layer");

      const polyStr = idx.polyc >= 0 ? String(r[idx.polyc] ?? "") : "";
      if (polyStr) {
        const geom = parsePolygonCoordinates(polyStr);
        if (geom) {
          const f: GeoJSON.Feature = {
            type: "Feature",
            properties: { __layer: layer, __polyId: idx.polyid >= 0 ? (r[idx.polyid] ?? "") : "" },
            geometry: geom
          };
          if (!polysByLayer.has(layer)) polysByLayer.set(layer, []);
          polysByLayer.get(layer)!.push(f);
        }
        continue;
      }

      if (idx.lat >= 0 && idx.lon >= 0 && r[idx.lat] != null && r[idx.lon] != null) {
        let lat = Number(r[idx.lat]),
          lon = Number(r[idx.lon]);
        [lat, lon] = jitterIfDuplicate(
          lat,
          lon,
          used,
          Number(this.settings.points.jitterEps) || 0
        );
        const f: GeoJSON.Feature = {
          type: "Feature",
          properties: { __layer: layer, __id: idx.locid >= 0 ? (r[idx.locid] ?? "") : "" },
          geometry: { type: "Point", coordinates: [lon, lat] }
        };
        if (!pointsByLayer.has(layer)) pointsByLayer.set(layer, []);
        pointsByLayer.get(layer)!.push(f);
      }
    }

    const allLayers = Array.from(
      new Set([...pointsByLayer.keys(), ...polysByLayer.keys()])
    );
    const hidden = new Set(
      String(this.settings.layers.hiddenCsv || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    let order = String(this.settings.layers.orderCsv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    order = [...new Set([...order, ...allLayers])];

    let colorOverrides: Record<string, string> = {};
    try {
      colorOverrides = JSON.parse(this.settings.layers.colorJson || "{}");
    } catch {
      colorOverrides = {};
    }

    for (const name of order) {
      const visible = !hidden.has(name);
      const color = colorFor(name, colorOverrides);

      const pgs = polysByLayer.get(name);
      if (pgs && this.settings.polygons.enable) {
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pgs };
        this.ensurePolygonLayer(
          name,
          fc,
          visible,
          color,
          Number(this.settings.polygons.opacity) || 0,
          Number(this.settings.polygons.strokePx) || 0
        );
      }

      const pts = pointsByLayer.get(name);
      if (pts && this.settings.points.enable) {
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pts };
        this.ensurePointLayer(
          name,
          fc,
          visible,
          color,
          Math.max(1, Number(this.settings.points.sizePx) || 1),
          Math.max(0, Number(this.settings.points.strokePx) || 0)
        );
      }
    }

    this.fitBoundsOnce(order, pointsByLayer, polysByLayer);
    this.buildPanel(order, hidden, colorOverrides);
  }

  private ensurePolygonLayer(
    name: string,
    fc: GeoJSON.FeatureCollection,
    visible: boolean,
    color: string,
    opacity: number,
    stroke: number
  ) {
    const map = this.map!;
    const src = `pg-${name}`,
      fill = `${src}-fill`,
      line = `${src}-line`;

    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: fc } as any);
    else (map.getSource(src) as any).setData(fc);

    if (!map.getLayer(fill)) {
      map.addLayer({
        id: fill,
        type: "fill",
        source: src,
        paint: { "fill-color": color, "fill-opacity": opacity }
      } as any);
    } else {
      map.setPaintProperty(fill, "fill-color", color);
      map.setPaintProperty(fill, "fill-opacity", opacity);
    }

    if (!map.getLayer(line)) {
      map.addLayer({
        id: line,
        type: "line",
        source: src,
        paint: { "line-color": "#000000", "line-width": stroke }
      } as any);
    } else {
      map.setPaintProperty(line, "line-width", stroke);
    }

    map.setLayoutProperty(fill, "visibility", visible ? "visible" : "none");
    map.setLayoutProperty(line, "visibility", visible ? "visible" : "none");
  }

  private ensurePointLayer(
    name: string,
    fc: GeoJSON.FeatureCollection,
    visible: boolean,
    color: string,
    size: number,
    stroke: number
  ) {
    const map = this.map!;
    const src = `pt-${name}`,
      lyr = `${src}-circle`;

    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: fc } as any);
    else (map.getSource(src) as any).setData(fc);

    if (!map.getLayer(lyr)) {
      map.addLayer({
        id: lyr,
        type: "circle",
        source: src,
        paint: {
          "circle-radius": Math.max(1, size),
          "circle-stroke-width": Math.max(0, stroke),
          "circle-color": color
        }
      } as any);
    } else {
      map.setPaintProperty(lyr, "circle-radius", Math.max(1, size));
      map.setPaintProperty(lyr, "circle-stroke-width", Math.max(0, stroke));
      map.setPaintProperty(lyr, "circle-color", color);
    }

    map.setLayoutProperty(lyr, "visibility", visible ? "visible" : "none");
  }

  private fitBoundsOnce(
    order: string[],
    pts: Map<string, GeoJSON.Feature[]>,
    pgs: Map<string, GeoJSON.Feature[]>
  ) {
    const mapAny = this.map as any;
    if (mapAny.__fitDone) return;

    let minX = +Infinity,
      minY = +Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const push = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const l of order) {
      // point features
      for (const f of pts.get(l) || []) {
        const coords = (f.geometry as any).coordinates as [number, number];
        const x = Number(coords[0]);
        const y = Number(coords[1]);
        push(x, y);
      }

      // polygon / multipolygon features
      for (const f of pgs.get(l) || []) {
        const g: any = f.geometry;
        if (!g) continue;

        if (g.type === "Polygon") {
          for (const ring of g.coordinates) {
            for (const c of ring) {
              push(Number(c[0]), Number(c[1]));
            }
          }
        } else if (g.type === "MultiPolygon") {
          for (const poly of g.coordinates) {
            for (const ring of poly) {
              for (const c of ring) {
                push(Number(c[0]), Number(c[1]));
              }
            }
          }
        }
      }
    }

    if (isFinite(minX)) {
      (this.map as any).fitBounds(
        [
          [minX, minY],
          [maxX, maxY]
        ],
        { padding: 24, animate: false }
      );
      mapAny.__fitDone = true;
    }
  }

  private buildPanel(
    order: string[],
    hidden: Set<string>,
    colorOverrides: Record<string, string>
  ) {
    const panel = this.panel!;
    // clear
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    const header = document.createElement("div");
    header.textContent = "Layers";
    header.style.fontWeight = "600";
    header.style.marginBottom = "6px";
    panel.appendChild(header);

    const persist = () => {
      const rows = Array.from(panel.querySelectorAll<HTMLElement>("[data-layer]"));
      const names = rows.map((r) => r.dataset.layer!);
      const hiddenNow: string[] = [];
      const colorsNow: Record<string, string> = {};
      for (const row of rows) {
        const name = row.dataset.layer!;
        const chk = row.querySelector<HTMLInputElement>("input[type=checkbox]")!;
        const sw = row.querySelector<HTMLDivElement>(".sw")!;
        if (!chk.checked) hiddenNow.push(name);
        colorsNow[name] = sw.style.backgroundColor || sw.style.background || "";
      }
      this.settings.layers.orderCsv = names.join(",");
      this.settings.layers.hiddenCsv = hiddenNow.join(",");
      this.settings.layers.colorJson = JSON.stringify(colorsNow);
    };

    for (const name of order) {
      const row = document.createElement("div");
      row.dataset.layer = name;
      row.setAttribute(
        "style",
        "display:flex;align-items:center;gap:8px;margin-bottom:6px"
      );

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !hidden.has(name);
      chk.addEventListener("change", persist);
      row.appendChild(chk);

      const sw = document.createElement("div");
      sw.className = "sw";
      sw.setAttribute(
        "style",
        "width:14px;height:14px;border-radius:3px;border:1px solid #999;cursor:pointer;"
      );
      const clr = colorOverrides[name] || colorFor(name, {});
      sw.style.backgroundColor = clr;
      sw.addEventListener("click", () => {
        const pal = palette;
        const current = sw.style.backgroundColor || clr;
        const idx = Math.max(0, pal.indexOf(current as any));
        sw.style.backgroundColor = pal[(idx + 1) % pal.length];
        persist();
      });
      row.appendChild(sw);

      const label = document.createElement("span");
      label.textContent = name;
      label.style.flex = "1";
      row.appendChild(label);

      const upBtn = document.createElement("button");
      upBtn.textContent = "▲";
      upBtn.setAttribute(
        "style",
        "border:1px solid #ccc;background:#f8f8f8;border-radius:4px;cursor:pointer;"
      );
      upBtn.addEventListener("click", () => {
        const prev = row.previousElementSibling;
        if (prev && prev !== header) {
          panel.insertBefore(row, prev);
          persist();
        }
      });
      row.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.textContent = "▼";
      downBtn.setAttribute(
        "style",
        "border:1px solid #ccc;background:#f8f8f8;border-radius:4px;cursor:pointer;"
      );
      downBtn.addEventListener("click", () => {
        const next = row.nextElementSibling;
        if (next) {
          panel.insertBefore(next, row);
          persist();
        }
      });
      row.appendChild(downBtn);

      panel.appendChild(row);
    }
  }

  private readSettings(dv: DataView): VisualSettings {
    const s = new VisualSettings();
    const o = dv.metadata.objects || {};
    const pick = (obj: string, prop: string, def: any) =>
      (o as any)[obj] && (o as any)[obj][prop] != null ? (o as any)[obj][prop] : def;

    s.points.enable = pick("points", "enable", s.points.enable);
    s.points.sizePx = pick("points", "sizePx", s.points.sizePx);
    s.points.strokePx = pick("points", "strokePx", s.points.strokePx);
    s.points.jitterEps = pick("points", "jitterEps", s.points.jitterEps);

    s.polygons.enable = pick("polygons", "enable", s.polygons.enable);
    s.polygons.strokePx = pick("polygons", "strokePx", s.polygons.strokePx);
    s.polygons.opacity = pick("polygons", "opacity", s.polygons.opacity);

    s.layers.orderCsv = pick("layers", "orderCsv", s.layers.orderCsv);
    s.layers.hiddenCsv = pick("layers", "hiddenCsv", s.layers.hiddenCsv);
    s.layers.colorJson = pick("layers", "colorJson", s.layers.colorJson);

    return s;
  }

  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstance[] {
    const instances: VisualObjectInstance[] = [];

    switch (options.objectName) {
      case "points":
        instances.push({
          objectName: "points",
          properties: {
            enable: !!this.settings.points.enable,
            sizePx: Number(this.settings.points.sizePx),
            strokePx: Number(this.settings.points.strokePx),
            jitterEps: Number(this.settings.points.jitterEps)
          },
          selector: (null as unknown as powerbi.data.Selector)
        });
        break;

      case "polygons":
        instances.push({
          objectName: "polygons",
          properties: {
            enable: !!this.settings.polygons.enable,
            strokePx: Number(this.settings.polygons.strokePx),
            opacity: Number(this.settings.polygons.opacity)
          },
          selector: (null as unknown as powerbi.data.Selector)
        });
        break;

      case "layers":
        instances.push({
          objectName: "layers",
          properties: {
            orderCsv: String(this.settings.layers.orderCsv || ""),
            hiddenCsv: String(this.settings.layers.hiddenCsv || ""),
            colorJson: String(this.settings.layers.colorJson || "{}")
          },
          selector: (null as unknown as powerbi.data.Selector)
        });
        break;
    }

    return instances;
  }
}
