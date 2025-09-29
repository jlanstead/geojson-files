import { IVisualSettings } from "powerbi-visuals-api";

export interface IHeaderSettings {
    fontSize: number;
    fontColor: string;
    backgroundColor: string;
    textAlign: string;
    rotation: number; // Rotation in degrees
}

export interface ITableVisualSettings extends IVisualSettings {
    header: IHeaderSettings;
}

export const defaultSettings: ITableVisualSettings = {
    header: {
        fontSize: 12,
        fontColor: "#000000",
        backgroundColor: "#FFFFFF",
        textAlign: "left",
        rotation: 0,
    },
};