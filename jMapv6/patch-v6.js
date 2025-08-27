// patch-v6.js
const fs = require("fs");
const path = require("path");

function up(f, mut) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) return console.log(f, "(skip, not found)");
  const before = fs.readFileSync(p, "utf8");
  const after = mut(before);
  if (after !== before) {
    fs.writeFileSync(p, after);
    console.log("patched", f);
  } else {
    console.log("ok     ", f);
  }
}

/* ---- pbiviz.json ---- */
up("pbiviz.json", (txt) => {
  const j = JSON.parse(txt);
  j.apiVersion = "6.0.0";
  j.supportUrl = j.supportUrl || "https://powerbi.microsoft.com";
  j.visual = j.visual || {};
  j.visual.name = j.visual.name || "JMapv6";
  j.visual.displayName = j.visual.displayName || "JMap v6";
  j.visual.guid =
    j.visual.guid || "JMapV6_" + Math.random().toString(36).slice(2, 10);
  return JSON.stringify(j, null, 2);
});

/* ---- capabilities.json ---- */
up("capabilities.json", (txt) => {
  const want = {
    dataRoles: [
      { name: "LegendType", displayName: "Legend", kind: "Grouping" },
      {
        name: "Lat",
        displayName: "Latitude",
        kind: "Grouping",
        requiredTypes: [{ numeric: true }],
      },
      {
        name: "Lon",
        displayName: "Longitude",
        kind: "Grouping",
        requiredTypes: [{ numeric: true }],
      },
      { name: "LocationId", displayName: "Location ID", kind: "Grouping" },
      { name: "PolyId", displayName: "Polygon ID", kind: "Grouping" },
      {
        name: "PolygonCoordinates",
        displayName: "Polygon WKT",
        kind: "Grouping",
      },
    ],
    dataViewMappings: [
      {
        table: {
          rows: {
            select: [
              { for: { in: "LegendType" } },
              { for: { in: "Lat" } },
              { for: { in: "Lon" } },
              { for: { in: "LocationId" } },
              { for: { in: "PolyId" } },
              { for: { in: "PolygonCoordinates" } },
            ],
          },
        },
      },
    ],
    objects: {
      points: {
        displayName: "Points",
        properties: {
          enable: { displayName: "Enable", type: { bool: true } },
          sizePx: { displayName: "Size (px)", type: { numeric: true } },
          strokePx: { displayName: "Stroke (px)", type: { numeric: true } },
          jitterEps: { displayName: "Jitter", type: { numeric: true } },
        },
      },
      polygons: {
        displayName: "Polygons",
        properties: {
          enable: { displayName: "Enable", type: { bool: true } },
          strokePx: { displayName: "Stroke (px)", type: { numeric: true } },
          opacity: { displayName: "Opacity", type: { numeric: true } },
        },
      },
      layers: {
        displayName: "Layers",
        properties: {
          orderCsv: { displayName: "Order (CSV)", type: { text: true } },
          hiddenCsv: { displayName: "Hidden (CSV)", type: { text: true } },
          colorJson: { displayName: "Colors (JSON)", type: { text: true } },
        },
      },
    },
    privileges: [],
  };
  let cur;
  try {
    cur = JSON.parse(txt);
  } catch {
    cur = want;
  }
  cur.dataRoles = want.dataRoles;
  cur.dataViewMappings = want.dataViewMappings;
  cur.objects = want.objects;
  cur.privileges = want.privileges;
  return JSON.stringify(cur, null, 2);
});

/* ---- tsconfig.json ---- */
up("tsconfig.json", (txt) => {
  const j = JSON.parse(txt);
  j.compilerOptions = j.compilerOptions || {};
  Object.assign(j.compilerOptions, {
    target: "ES2017",
    module: "commonjs",
    moduleResolution: "node",
    lib: ["ES2017", "DOM"],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    sourceMap: true,
    outDir: "./.tmp/build/",
    declaration: true,
  });
  return JSON.stringify(j, null, 2);
});

console.log("done.");
