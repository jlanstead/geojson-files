export class VisualSettings {
  public points = { enable: true, sizePx: 5, strokePx: 0, jitterEps: 0 };
  public polygons = { enable: true, strokePx: 1, opacity: 0.4 };
  public layers = { orderCsv: "", hiddenCsv: "", colorJson: "{}" };

  // simple parser used defensively by visual.readSettings
  static parse(_dv: any): VisualSettings {
    // implement real parsing from DataView.objects if you have it.
    // returning defaults is safe for compilation and initial run.
    return new VisualSettings();
  }
}