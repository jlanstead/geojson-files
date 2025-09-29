// This file serves as the main entry point for the Power BI custom table visual.
// It initializes the visual, handles data updates, and manages the rendering of the table.

import "core-js/stable";
import "regenerator-runtime/runtime";
import * as powerbi from "powerbi-visuals-api";
import { VisualSettings } from "./settings";
import { TableVisual } from "./tableVisual";

export class Visual implements powerbi.extensibility.visual.IVisual {
    private target: HTMLElement;
    private tableVisual: TableVisual;
    private settings: VisualSettings;

    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.target = options.element;
        this.tableVisual = new TableVisual(this.target);
    }

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
        this.settings = this.getSettings(options);
        this.tableVisual.update(options.dataViews, this.settings);
    }

    private getSettings(options: powerbi.extensibility.visual.VisualUpdateOptions): VisualSettings {
        // Logic to retrieve and parse settings from the options
        return new VisualSettings(); // Placeholder for actual settings retrieval logic
    }

    public destroy(): void {
        this.tableVisual.destroy();
    }
}