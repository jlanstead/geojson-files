import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualObjectInstance = powerbi.VisualObjectInstance;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
export declare class Visual implements powerbi.extensibility.visual.IVisual {
    private root;
    private map;
    private panel;
    private settings;
    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions);
    update(options: powerbi.extensibility.visual.VisualUpdateOptions): void;
    private ensurePolygonLayer;
    private ensurePointLayer;
    private fitBoundsOnce;
    private buildPanel;
    private readSettings;
    enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[];
}
