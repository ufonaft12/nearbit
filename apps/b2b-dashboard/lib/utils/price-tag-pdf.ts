import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { Product } from "@/types/database";

export interface PriceTagPDFOptions {
  products: Product[];
  storeName: string;
  /** Tag size in mm. Defaults to credit-card size 85×54 */
  tagWidth?: number;
  tagHeight?: number;
  /** Tags per row in the PDF sheet */
  cols?: number;
}

const DEFAULTS = {
  tagWidth: 85,
  tagHeight: 54,
  cols: 2,
  margin: 10,
  padding: 4,
};

async function generateQRDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, { width: 80, margin: 1 });
}

/**
 * Generates a print-ready A4 PDF of price tags.
 * Each tag contains:
 *  - Hebrew product name (RTL, right-aligned)
 *  - Russian product name
 *  - Price (large font, ILS)
 *  - Sale badge if applicable
 *  - Barcode / QR code
 *  - Store name footer
 */
export async function generatePriceTagPDF(
  options: PriceTagPDFOptions
): Promise<Blob> {
  const {
    products,
    storeName,
    tagWidth = DEFAULTS.tagWidth,
    tagHeight = DEFAULTS.tagHeight,
    cols = DEFAULTS.cols,
  } = options;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageHeight = 297;
  const margin = DEFAULTS.margin;
  const pad = DEFAULTS.padding;

  const rows = Math.floor((pageHeight - margin * 2) / tagHeight);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;

    if (i > 0 && col === 0 && row === 0) {
      doc.addPage();
    }

    const x = margin + col * (tagWidth + 5);
    const y = margin + row * (tagHeight + 5);

    // Tag border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, tagWidth, tagHeight, 2, 2);

    // Price — uses B2C `price` column
    const displayPrice = product.sale_price ?? product.price;
    const priceText = displayPrice !== null ? `₪${displayPrice.toFixed(2)}` : "—";
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(priceText, x + pad, y + 16);

    // Hebrew name — right-aligned for RTL (B2C `name_he` column)
    const hebName = product.name_he ?? product.normalized_name ?? product.raw_name;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(hebName, x + tagWidth - pad, y + 26, { align: "right" });

    // Russian name (B2C `name_ru` column)
    if (product.name_ru) {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(product.name_ru, x + pad, y + 33);
    }

    // Sale badge
    if (product.sale_price !== null && product.price !== null) {
      doc.setFillColor(239, 68, 68);
      doc.roundedRect(x + tagWidth - 22, y + 2, 20, 8, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(
        `מבצע ₪${product.sale_price.toFixed(2)}`,
        x + tagWidth - 12,
        y + 7,
        { align: "center" }
      );
    }

    // QR code (barcode or product ID)
    const qrValue = product.barcode ?? product.id;
    try {
      const qrDataUrl = await generateQRDataUrl(qrValue);
      doc.addImage(qrDataUrl, "PNG", x + pad, y + tagHeight - 18, 14, 14);
    } catch {
      doc.setDrawColor(150);
      doc.rect(x + pad, y + tagHeight - 18, 14, 14);
      doc.setFontSize(5);
      doc.text("QR", x + pad + 4, y + tagHeight - 11);
    }

    // Store name footer
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(storeName, x + tagWidth - pad, y + tagHeight - 3, {
      align: "right",
    });
  }

  return doc.output("blob");
}

/** Triggers browser download of the generated PDF */
export function downloadPDF(blob: Blob, filename = "price-tags.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
