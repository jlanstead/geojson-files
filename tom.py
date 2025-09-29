#!/usr/bin/env python3
# scaffold_tomtom_min.py
import os, sys, json, base64, subprocess
from pathlib import Path

PBIVIZ_TOOLS_VERSION = "6.1.3"
PBI_API_VERSION = "5.11.0"

def w(path: Path, s: str, bin=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb" if bin else "w", encoding=None if bin else "utf-8") as f:
        f.write(s if bin else s)

def main():
    api_key = (os.environ.get("TOMTOM_API_KEY") or input("TomTom API key: ").strip())
    if not api_key: print("API key required"); sys.exit(1)
    proj = input("Folder name (no spaces): ").strip()
    if not proj: print("Folder name required"); sys.exit(1)
    display = input("Display name (shown in Power BI): ").strip() or "TomTom Map"

    root = Path(proj).resolve()
    if root.exists(): print("Folder exists; pick another."); sys.exit(1)
    root.mkdir(parents=True)

    # --- package.json (only what we need) ---
    package_json = {
        "name": proj, "version": "1.0.0", "private": True,
        "scripts": {
            "start": "pbiviz start",
            "package": "pbiviz package --verbose"
        },
        "devDependencies": {
            "powerbi-visuals-tools": PBIVIZ_TOOLS_VERSION,
            "typescript": "^5.6.2",
            "@typescript-eslint/parser": "^8.41.0",
            "@typescript-eslint/eslint-plugin": "^8.41.0",
            "eslint": "^9.14.0"
        },
        "dependencies": {
            "maplibre-gl": "^4.5.0",
            "powerbi-visuals-api": PBI_API_VERSION
        }
    }
    w(root / "package.json", json.dumps(package_json, indent=2))

    # --- pbiviz.json ---
    pbiviz_json = {
        "visual": {
            "name": proj,
            "displayName": display,
            "guid": f"{proj.replace('-', '')}GUID",
            "visualClassName": "Visual",
            "version": "1.0.0.0",
            "description": "Minimal MapLibre + TomTom points",
            "supportUrl": "https://www.maplibre.org/"
        },
        "apiVersion": PBI_API_VERSION,
        "assets": {"icon": "assets/icon.png"},
        "style": "style/visual.less",
        "capabilities": "capabilities.json",
        "dependencies": "dependencies.json",
        "stringResources": []
    }
    w(root / "pbiviz.json", json.dumps(pbiviz_json, indent=2))

    # --- tsconfig.json (simple) ---
    tsconfig = {
        "compilerOptions": {
            "target": "ES2020",
            "module": "ESNext",
            "moduleResolution": "bundler",
            "strict": False,
            "outDir": "./.tmp/build/",
            "rootDir": "./",
            "sourceMap": True,
            "skipLibCheck": True,
            "types": ["powerbi-visuals-api"]
        },
        "include": ["src/**/*"]
    }
    w(root / "tsconfig.json", json.dumps(tsconfig, indent=2))

    # --- eslint flat config to avoid tsconfigRootDir errors ---
    eslint_cfg = """\
import path from "path";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
const __ROOT = path.resolve(process.cwd());
export default [{
  files: ["src/**/*.ts"],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module", tsconfigRootDir: __ROOT, project: ["./tsconfig.json"] }
  },
  plugins: { "@typescript-eslint": tsPlugin },
  rules: { "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": "off" }
}];
"""
    w(root / "eslint.config.cjs", eslint_cfg)

    # --- capabilities: Legend (category), Latitude & Longitude (measures or groupings) ---
    capabilities = {
        "dataRoles": [
            {"name": "legend", "kind": "Grouping", "displayName": "Legend"},
            {"name": "latitude", "kind": "Grouping", "displayName": "Latitude"},
            {"name": "longitude", "kind": "Grouping", "displayName": "Longitude"}
        ],
        "dataViewMappings": [{
            "categorical": {
                "categories": [{ "for": {"in": "legend"} }],
                "values": {
                    "group": { "by": "legend", "select": [
                        {"bind": {"to": "latitude"}},
                        {"bind": {"to": "longitude"}}
                    ]}
                }
            }
        }],
        "suppressDefaultTitle": True
    }
    w(root / "capabilities.json", json.dumps(capabilities, indent=2))

    # --- dependencies.json: load maplibre js/css ---
    deps = {
        "externalJS": [],
        "resources": [
            {"resourceId":"maplibre-js","source":"node_modules/maplibre-gl/dist/maplibre-gl.js","type":"js"},
            {"resourceId":"maplibre-css","source":"node_modules/maplibre-gl/dist/maplibre-gl.css","type":"css"}
        ]
    }
    w(root / "dependencies.json", json.dumps(deps, indent=2))

    # --- minimal styles ---
    visual_less = """\
@import (less) "node_modules/maplibre-gl/dist/maplibre-gl.css";
.visualHost { position:relative; width:100%; height:100%; }
#map { position:absolute; inset:0; }
.legendBadge { position:absolute; top:8px; left:8px; background:rgba(255,255,255,.9); padding:6px 8px; border-radius:8px; font-size:12px; pointer-events:none; }
"""
    w(root / "style" / "visual.less", visual_less)

    # --- icon ---
    tiny_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABJ4oYVQAAAABJRU5ErkJggg==")
    w(root / "assets" / "icon.png", tiny_png, bin=True)

    # --- src/visual.ts (SUPER MINIMAL) ---
    visual_ts = f"""\
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
// @ts-ignore
import * as maplibregl from "maplibre-gl/dist/maplibre-gl.js";

let MAP:any=null; let READY=false;

export class Visual implements IVisual {{
  private host: HTMLElement;
  private legend: HTMLElement;
  private apiKey: string = "{api_key}";

  constructor(opts: powerbi.extensibility.visual.VisualConstructorOptions) {{
    this.host = document.createElement("div");
    this.host.className = "visualHost";
    opts.element.appendChild(this.host);

    const mapDiv = document.createElement("div");
    mapDiv.id = "map";
    this.host.appendChild(mapDiv);

    this.legend = document.createElement("div");
    this.legend.className = "legendBadge";
    this.legend.textContent = "Legend";
    this.host.appendChild(this.legend);

    const styleUrl = `https://api.tomtom.com/style/1/style/21.2.1-WTP-basic.json?key=${{this.apiKey}}`;
    MAP = new maplibregl.Map({{ container: mapDiv, style: styleUrl, center: [-98.5795,39.8283], zoom: 3 }});
    MAP.on("load", ()=>{{ READY=true; }});
  }}

  public update(o: VisualUpdateOptions) {{
    const dv: DataView | undefined = o.dataViews && o.dataViews[0];
    if (!dv || !dv.categorical) return;
    const cat = dv.categorical;
    const legends = cat.categories && cat.categories[0];
    const vals = cat.values;
    if (!legends || !vals || vals.length<2) return;
    const latCol = vals[0], lonCol = vals[1];

    const feats:any[]=[];
    for (let i=0;i<latCol.values.length;i++) {{
      const lat=Number(latCol.values[i]); const lon=Number(lonCol.values[i]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {{
        const label=String(legends.values[i]??"");
        feats.push({{ type:"Feature", geometry:{{type:"Point",coordinates:[lon,lat]}}, properties:{{label}} }});
      }}
    }}
    const fc={{ type:"FeatureCollection", features:feats }};
    const render=()=>{{
      if (MAP.getSource("pts")) (MAP.getSource("pts") as any).setData(fc);
      else {{
        MAP.addSource("pts",{{ type:"geojson", data:fc }});
        MAP.addLayer({{ id:"pts", type:"circle", source:"pts", paint:{{"circle-radius":5,"circle-opacity":0.85}} }});
      }}
      if (feats.length) {{
        const c=feats.map(f=>f.geometry.coordinates);
        const b=c.reduce((B:any,p:any)=>B.extend(p), new maplibregl.LngLatBounds(c[0],c[0]));
        try{{ MAP.fitBounds(b,{{padding:40,duration:0}}); }}catch(e){{}}
      }}
      const sample=[...new Set(feats.map(f=>f.properties.label))].slice(0,5);
      this.legend.textContent = sample.length ? "Legend: "+sample.join(", ") : "Legend";
    }};
    if (!READY) MAP.once("load", render); else render();
  }}
}}
"""
    w(root / "src" / "visual.ts", visual_ts)

    # --- tiny README ---
    readme = f"""\
# {display}

Minimal MapLibre + TomTom Power BI visual.
Fields:
- Legend (text)
- Latitude (number)
- Longitude (number)

## Build
npm install
npx -y powerbi-visuals-tools@{PBIVIZ_TOOLS_VERSION} --version
npm run package
"""
    w(root / "README.md", readme)

    # .gitignore
    w(root / ".gitignore", ".tmp/\ndist/\nnode_modules/\n")

    print(f"Created in: {root}")
    print("Next:")
    print(f"  cd {root}")
    print("  npm install")
    print(f"  npx -y powerbi-visuals-tools@{PBIVIZ_TOOLS_VERSION} --version")
    print("  npm run package")
    print("Import the .pbiviz from dist/ into Power BI and bind Legend/Latitude/Longitude.")

if __name__ == "__main__":
    main()
