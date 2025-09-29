import { IVisual } from "powerbi-visuals-api";
import { VisualUpdateOptions } from "powerbi-visuals-api";
import { DataView } from "powerbi-visuals-api";
import { settings } from "./settings";

export class TableVisual implements IVisual {
    private tableElement: HTMLElement;

    constructor(options: VisualUpdateOptions) {
        this.tableElement = options.element;
        this.tableElement.classList.add("table-visual");
    }

    public update(options: VisualUpdateOptions): void {
        const dataView: DataView = options.dataViews[0];
        this.renderTable(dataView);
    }

    private renderTable(dataView: DataView): void {
        const rows = this.extractRows(dataView);
        this.tableElement.innerHTML = this.createTableHTML(rows);
        this.applyHeaderFormatting();
    }

    private extractRows(dataView: DataView): any[] {
        // Logic to extract rows from the dataView
        return [];
    }

    private createTableHTML(rows: any[]): string {
        let html = "<table><thead><tr>";
        // Create header row
        html += this.createHeaderHTML();
        html += "</tr></thead><tbody>";
        // Create data rows
        rows.forEach(row => {
            html += "<tr>";
            row.forEach(cell => {
                html += `<td>${cell}</td>`;
            });
            html += "</tr>";
        });
        html += "</tbody></table>";
        return html;
    }

    private createHeaderHTML(): string {
        const headers = settings.getHeaders(); // Assuming settings has a method to get headers
        return headers.map(header => `<th style="${this.getHeaderStyle(header)}">${header}</th>`).join("");
    }

    private getHeaderStyle(header: string): string {
        // Logic to determine header style based on settings
        return "";
    }

    private applyHeaderFormatting(): void {
        // Logic to apply header formatting, alignment, and rotation
    }
}