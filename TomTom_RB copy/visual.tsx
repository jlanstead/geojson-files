import { TomTomMap } from "./components/TomTomMap";

export class Visual implements IVisual {
  private target: HTMLElement;

  constructor(options: VisualConstructorOptions) {
    this.target = options.element;
    this.target.innerHTML = "";
    const mapContainer = document.createElement("div");
    mapContainer.id = "map";
    mapContainer.style.width = "100%";
    mapContainer.style.height = "100%";
    this.target.appendChild(mapContainer);
    TomTomMap.init("x10wLdMTZk1FrwDa2ab439Ghi4ZVTrj1", "map");
  }

  public update(options: VisualUpdateOptions): void {
    // Update logic for data points
  }
}