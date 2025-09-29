/* eslint-disable */
declare module "maplibre-gl/dist/maplibre-gl-csp" {
  export * from "maplibre-gl";
  import maplibregl from "maplibre-gl";
  export default maplibregl;
}
declare module "maplibre-gl/dist/maplibre-gl-csp-worker" {
  const MapLibreWorker: any;
  export default MapLibreWorker;
}
