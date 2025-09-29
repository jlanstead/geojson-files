import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import * as L from "leaflet";

type Row = { lat?: number; lon?: number; label?: string; tt?: string };

export class Visual implements powerbi.extensibility.visual.IVisual {
  private el: HTMLDivElement;
  private map?: L.Map;
  private group?: L.LayerGroup;

  constructor(opts: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.el = document.createElement("div");
    this.el.style.width = "100%";
    this.el.style.height = "100%";
    opts.element.appendChild(this.el);

    this.map = L.map(this.el).setView([37.8, -96.9], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(this.map);
    this.group = L.layerGroup().addTo(this.map);
  }

  public update(o: powerbi.extensibility.visual.VisualUpdateOptions) {
    if (!this.map || !this.group) return;
    this.el.style.width  = o.viewport.width + "px";
    this.el.style.height = o.viewport.height + "px";
    this.map.invalidateSize();

    const dv = o.dataViews?.[0];
    const tbl = dv?.table;
    const rows: Row[] = [];
    if (tbl) {
      const latIdx = tbl.columns.findIndex(c => c.roles?.["lat"]);
      const lonIdx = tbl.columns.findIndex(c => c.roles?.["lon"]);
      const catIdx = tbl.columns.findIndex(c => c.roles?.["cat"]);
      const ttIdx  = tbl.columns.findIndex(c => c.roles?.["tooltips"]);
      for (const r of tbl.rows) {
        const lat = latIdx >= 0 ? Number(r[latIdx]) : undefined;
        const lon = lonIdx >= 0 ? Number(r[lonIdx]) : undefined;
        if (isFinite(lat!) && isFinite(lon!)) {
          rows.push({
            lat, lon,
            label: catIdx >= 0 ? String(r[catIdx]) : undefined,
            tt: ttIdx >= 0 ? String(r[ttIdx]) : undefined
          });
        }
      }
    }

    this.group.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    for (const p of rows) {
      const m = L.circleMarker([p.lat!, p.lon!], { radius: 6 }).addTo(this.group);
      if (p.label || p.tt) m.bindPopup(`<b>${p.label ?? ""}</b><br>${p.tt ?? ""}`);
      bounds.push([p.lat!, p.lon!]);
    }
    if (bounds.length) this.map.fitBounds(bounds as any, { padding: [20, 20] });
  }

  public destroy() { this.map?.remove(); }
}
