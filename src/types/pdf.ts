export type PageFormat = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
export type MarginSide = 'top' | 'right' | 'bottom' | 'left';

export interface PdfOptions {
  format?: PageFormat;
  landscape?: boolean;
  margin?: Partial<Record<MarginSide, string>>;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}
