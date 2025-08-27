// Minimal tile-only visual
import powerbi from "powerbi-visuals-api";
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private map: maplibregl.Map | null = null;
  private resizeObs?: ResizeObserver;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;

    // clean root
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);

    // container
    const div = document.createElement("div");
    div.id = "tile-map";
    div.setAttribute("style", "position:absolute;inset:0;");
    this.root.appendChild(div);

    // MapLibre basemap (no data)
    this.map = new maplibregl.Map({
      container: div,
      style: "https://demotiles.maplibre.org/style.json", // public demo style
      attributionControl: true,
      interactive: true
    });

    // add nav controls
    try {
      this.map.addControl(new (maplibregl as any).NavigationControl(), "top-left");
    } catch {}

    // resize safety
    this.resizeObs = new ResizeObserver(() => {
      try { this.map && this.map.resize(); } catch {}
    });
    this.resizeObs.observe(this.root);
  }

  public update(_options: powerbi.extensibility.visual.VisualUpdateOptions) {
    // If you want to fit somewhere by default, do it once when style is loaded
    if (!this.map) return;
    if (!this.map.isStyleLoaded()) {
      this.map.once("load", () => {
        try {
          this.map!.fitBounds([[-180, -85], [180, 85]], { padding: 24, animate: false });
        } catch {}
      });
      return;
    }
    // ensure it keeps filling the viewport
    try { this.map.resize(); } catch {}
  }

  public destroy?(): void {
    try { this.resizeObs?.disconnect(); } catch {}
    try { this.map?.remove(); } catch {}
    this.map = null;
  }
}
