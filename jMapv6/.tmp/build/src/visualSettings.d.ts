export declare class VisualSettings {
    points: PointsSettings;
    polygons: PolygonsSettings;
    layers: LayersSettings;
}
declare class PointsSettings {
    enable: boolean;
    sizePx: number;
    strokePx: number;
    jitterEps: number;
}
declare class PolygonsSettings {
    enable: boolean;
    strokePx: number;
    opacity: number;
}
declare class LayersSettings {
    orderCsv: string;
    hiddenCsv: string;
    colorJson: string;
}
export {};
