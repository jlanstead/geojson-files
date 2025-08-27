export class VisualSettings {
  points = new PointsSettings();
  polygons = new PolygonsSettings();
  layers = new LayersSettings();
}

class PointsSettings {
  enable: boolean = true;
  sizePx: number = 5;
  strokePx: number = 0;
  jitterEps: number = 0; // 0..0.1 degrees
}

class PolygonsSettings {
  enable: boolean = true;
  strokePx: number = 1;
  opacity: number = 0.4; // 0..1
}

class LayersSettings {
  orderCsv: string = "";
  hiddenCsv: string = "";
  colorJson: string = "{}";
}
