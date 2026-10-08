export interface Rect { x: number; y: number; width: number; height: number }
export interface PageInfo {
  index: number;
  width_pt: number;
  height_pt: number;
  width_mm: number;
  height_mm: number;
  rotation: number;
  preview_url: string;
}
export interface PDFDocument {
  id: string;
  filename: string;
  page_count: number;
  pages: PageInfo[];
}
export interface TextRegion {
  id: string;
  page: number;
  text: string;
  rect: Rect;
  confidence: number;
  font_size: number;
  bold: boolean;
  source: 'ocr' | 'native' | 'manual';
}
export interface TextEdit {
  id: string;
  page: number;
  rect: Rect;
  text: string;
  font_family: 'Arial' | 'Noto Sans SC';
  font_size: number;
  bold: boolean;
  text_color: string;
  background_color: string;
  fit: boolean;
}
export type Language = 'latin' | 'chinese';
export interface Recognition {
  regions: TextRegion[];
  engine: string;
  elapsed_ms: number;
  warnings: string[];
}

export type Tool = 'select' | 'region';
