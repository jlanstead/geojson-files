import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {
  private root: HTMLElement;
  constructor(options: any) {
    this.root = options.element;
    this.root.innerHTML = "<div style='padding:12px;font-family:Segoe UI, Arial, sans-serif;color:#222'>Minimal Custom Table Visual</div>";
  }
  public update(options: VisualUpdateOptions) {}
  public destroy() {}
}
