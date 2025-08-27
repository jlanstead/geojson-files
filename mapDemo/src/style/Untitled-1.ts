// src/visualSettings.ts
export class VisualSettings {
  public points = { enable: true, sizePx: 5, strokePx: 0, jitterEps: 0 };
  public polygons = { enable: true, strokePx: 1, opacity: 0.4 };
  public layers = { orderCsv: "", hiddenCsv: "", colorJson: "{}" };
  static parse(_dv: any) { return new VisualSettings(); }
}