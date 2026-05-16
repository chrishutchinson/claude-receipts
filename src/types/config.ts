// Configuration file types

export type PrinterModel = "t88v" | "t88vii";

export const PRINTER_MODELS: PrinterModel[] = ["t88v", "t88vii"];

export interface ReceiptConfig {
  version: string;
  location?: string;
  timezone?: string;
  printer?: string;
  printermodel?: PrinterModel;
}

export const DEFAULT_CONFIG: ReceiptConfig = {
  version: "1.0.0",
};
