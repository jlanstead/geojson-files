import powerbi from "powerbi-visuals-api";
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  private map: maplibregl.Map | null = null;
  private didAddDebug = false;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;

    // Clear the host element
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);

    // Map container
    const mapDiv = document.createElement("div");
    mapDiv.id = "jmap-tileonly";
    mapDiv.setAttribute("style", "position:absolute; inset:0;");
    this.root.appendChild(mapDiv);

    // MapLibre: public demo style (no API key required)
    this.map = new maplibregl.Map({
      container: mapDiv,
      style: "https://demotiles.maplibre.org/style.json",
      attributionControl: true,
      interactive: true
    });

    // Keep the map sized within the visual
    const RO = (window as any).ResizeObserver as
      | (new (cb: () => void) => { observe: (el: Element) => void })
      | undefined;

    if (RO) {
      const ro = new RO(() => {
        try { this.map?.resize(); } catch {}
      });
      ro.observe(this.root as Element);
    } else {
      // Fallback for older environments
      window.addEventListener("resize", () => {
        try { this.map?.resize(); } catch {}
      });
    }
  }

  public update(_options: powerbi.extensibility.visual.VisualUpdateOptions) {
    if (!this.map) return;

    // Always keep it sized to the visual
    try { this.map.resize(); } catch {}

    // Add one debug point after style load (only once)
    if (!this.didAddDebug) {
      if (this.map.isStyleLoaded()) {
        this.addDebugPoint();
      } else {
        this.map.once("load", () => this.addDebugPoint());
      }
      this.didAddDebug = true;
    }
  }

  private addDebugPoint() {
    if (!this.map) return;

    const srcId = "debug-src";
    const lyrId = "debug-pt";

    if (!this.map.getSource(srcId)) {
      this.map.addSource(srcId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-74.0060, 40.7128] }, // NYC-ish
              properties: { name: "Hello Map!" }
            }
          ]
        }
      } as any);
    }

    if (!this.map.getLayer(lyrId)) {
      this.map.addLayer({
        id: lyrId,
        type: "circle",
        source: srcId,
        paint: {
          "circle-radius": 8,
          "circle-color": "#ff5722",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000000"
        }
      } as any);
    }

    try {
      // Frame the debug point
      this.map.fitBounds([[-74.02, 40.70], [-73.99, 40.73]], { padding: 24, animate: false });
    } catch {}
  }
}
