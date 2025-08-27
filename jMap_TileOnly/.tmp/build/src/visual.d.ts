import powerbi from "powerbi-visuals-api";
export declare class Visual implements powerbi.extensibility.visual.IVisual {
    private root;
    private map;
    private didAddDebug;
    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions);
    update(_options: powerbi.extensibility.visual.VisualUpdateOptions): void;
    private addDebugPoint;
}
