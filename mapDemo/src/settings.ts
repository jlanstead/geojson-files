// src/settings.ts
export class VisualSettings {
  public points = {
    enable: true,
    sizePx: 6,
    strokePx: 0,
    jitterEps: 0.5
  };

  public polygons = {
    enable: true,
    strokePx: 1,
    opacity: 0.4
  };

  public layers = {
    orderCsv: "",
    hiddenCsv: "",
    colorJson: "{}"
  };
}
