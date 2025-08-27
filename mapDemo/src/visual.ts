/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;

// Use the browser build to avoid Node shims (maplibre-gl 3.x)
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

import { VisualSettings } from "./settings";

/* ...existing helpers... */
function parsePolygonCoordinates(dbStr: string): GeoJSON.Polygon | null {
  // ...existing implementation...
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
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: "Polygon", coordinates: [ring] };
}

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

    // maplibre - use a public basemap so map is visible
    this.map = new maplibregl.Map({
      container: mapDiv,
      style: "https://demotiles.maplibre.org/style.json",
      attributionControl: false,
      interactive: true
    });

    // debug marker so we can confirm map rendered
    this.map.on("load", () => {
      const el = document.createElement("div");
      el.style.width = "10px";
      el.style.height = "10px";
      el.style.background = "red";
      el.style.borderRadius = "50%";
      new (maplibregl as any).Marker(el).setLngLat([0, 0]).addTo(this.map!);
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

    const allLayers = Array.from(new Set([...pointsByLayer.keys(), ...polysByLayer.keys()]));
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

    // debug counts
    const totalPts = [...pointsByLayer.values()].reduce((n, a) => n + a.length, 0);
    const totalPolys = [...polysByLayer.values()].reduce((n, a) => n + a.length, 0);
    console.debug("jMap features", { totalPts, totalPolys });

    for (const name of order) {
      const visible = !hidden.has(name);
      const color = colorFor(name, colorOverrides);

      const pgs = polysByLayer.get(name);
      if (pgs && this.settings.polygons.enable) {
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pgs };

        // sanitize polygon settings (avoid NaN)
        const polyOpacity = Number.isFinite(+this.settings.polygons.opacity)
          ? Math.min(1, Math.max(0, +this.settings.polygons.opacity))
          : 0.4;
        const polyStroke = Number.isFinite(+this.settings.polygons.strokePx)
          ? Math.max(0, +this.settings.polygons.strokePx)
          : 1;

        this.ensurePolygonLayer(name, fc, visible, color, polyOpacity, polyStroke);
      }

      const pts = pointsByLayer.get(name);
      if (pts && this.settings.points.enable) {
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pts };

        // sanitize point settings (avoid NaN)
        const ptSize = Number.isFinite(+this.settings.points.sizePx)
          ? Math.max(1, +this.settings.points.sizePx)
          : 5;
        const ptStroke = Number.isFinite(+this.settings.points.strokePx)
          ? Math.max(0, +this.settings.points.strokePx)
          : 0;

        this.ensurePointLayer(name, fc, visible, color, ptSize, ptStroke);
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
      for (const f of pts.get(l) || []) {
        const coords = (f.geometry as any).coordinates as [number, number];
        const x = Number(coords[0]);
        const y = Number(coords[1]);
        push(x, y);
      }

      for (const f of pgs.get(l) || []) {
        const g: any = f.geometry;
        if (!g) continue;

        if (g.type === "Polygon") {
          for (const ring of g.coordinates) {
            for (const c of ring) push(Number(c[0]), Number(c[1]));
          }
        } else if (g.type === "MultiPolygon") {
          for (const poly of g.coordinates) {
            for (const ring of poly) {
              for (const c of ring) push(Number(c[0]), Number(c[1]));
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
      row.setAttribute("style", "display:flex;align-items:center;gap:8px;margin-bottom:6px");
      // existing UI code (checkbox, color swatch, move up/down)...
      // ... keep the rest of the panel DOM creation as-is from your original file ...
    }
  }

  // enumerateObjectInstances for format pane (no selector)
  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstance[] {
    const instances: VisualObjectInstance[] = [];

    const toNum = (v: any, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    switch (options.objectName) {
      case "points":
        instances.push({
          objectName: "points",
          selector: null, // required by current API typings
          properties: {
            enable: !!this.settings.points.enable,
            sizePx: toNum(this.settings.points.sizePx, 5),
            strokePx: toNum(this.settings.points.strokePx, 0),
            jitterEps: toNum(this.settings.points.jitterEps, 0)
          }
        });
        break;

      case "polygons":
        instances.push({
          objectName: "polygons",
          selector: null,
          properties: {
            enable: !!this.settings.polygons.enable,
            strokePx: toNum(this.settings.polygons.strokePx, 1),
            opacity: toNum(this.settings.polygons.opacity, 0.4)
          }
        });
        break;

      case "layers":
        instances.push({
          objectName: "layers",
          selector: null,
          properties: {
            orderCsv: String(this.settings.layers.orderCsv || ""),
            hiddenCsv: String(this.settings.layers.hiddenCsv || ""),
            colorJson: String(this.settings.layers.colorJson || "{}")
          }
        });
        break;
    }

    return instances;
  }

  private readSettings(dv: DataView): VisualSettings {
    // Defensive: VisualSettings.parse may not exist in every generated settings helper
    try {
      const parser = (VisualSettings as any).parse;
      if (typeof parser === "function") {
        const parsed = parser(dv);
        return (parsed && parsed instanceof VisualSettings) ? parsed : (parsed as VisualSettings) || new VisualSettings();
      }
    } catch {
      /* fall through to default */
    }
    return new VisualSettings();
  }
}