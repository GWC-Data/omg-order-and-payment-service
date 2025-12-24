import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Response } from 'express';

type AnyObj = Record<string, any>;

function safe(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function money(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(2);
  return String(v);
}

function hr(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').stroke();
  doc.strokeColor('black');
}

function findLogoPath(): string | null {
  const candidates = [
    // build output (babel --copy-files keeps folder structure)
    path.join(process.cwd(), 'dist', 'asset', 'OMG-Logo.png'),
    // dev/source
    path.join(process.cwd(), 'src', 'asset', 'OMG-Logo.png'),
    // fallback if cwd is already /dist
    path.join(process.cwd(), 'asset', 'OMG-Logo.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Single-file invoice utility:
 * - streams a live invoice PDF into the HTTP response
 * - includes all Order columns + OrderItems lines
 */
export function writeOrderInvoicePdf(
  res: Response,
  input: {
    invoiceNumber: string;
    issuedAt: Date;
    order: AnyObj;
    items: AnyObj[];
  }
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  // Branding (Company + logo)
  const logoPath = findLogoPath();
  const headerTop = 40;
  if (logoPath) {
    try {
      doc.image(logoPath, 50, headerTop, { width: 42 });
    } catch {
      // ignore logo render issues
    }
  }
  doc.fontSize(18).fillColor('#111827').text('OMG', 100, headerTop + 8, {
    align: 'left'
  });
  doc.fillColor('black');

  // Header
  doc.fontSize(22).text('INVOICE', 50, headerTop, { align: 'right' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151');
  doc.text(`Invoice #: ${input.invoiceNumber}`, { align: 'right' });
  doc.text(`Issued at: ${input.issuedAt.toISOString()}`, { align: 'right' });
  doc.fillColor('black');

  doc.moveDown(1.2);
  hr(doc, doc.y);
  doc.moveDown(1.0);

  const o = input.order ?? {};

  doc.fontSize(12).text('Order Details', { underline: true });
  doc.moveDown(0.6);
  doc.fontSize(10);

  // Include all Order columns (as per Order model)
  const fields: Array<[string, string]> = [
    ['Order ID', safe(o.id)],
    ['Order Number', safe(o.orderNumber)],
    ['Order Type', safe(o.orderType)],
    ['Status', safe(o.status)],
    ['Payment Status', safe(o.paymentStatus)],
    ['Payment Method', safe(o.paymentMethod)],
    ['Payment ID', safe(o.paymentId)],
    ['User ID', safe(o.userId)],
    ['Temple ID', safe(o.templeId)],
    ['Address ID', safe(o.addressId)],
    ['Fulfillment Type', safe(o.fulfillmentType)],
    ['Scheduled Date', safe(o.scheduledDate)],
    ['Scheduled Timestamp', safe(o.scheduledTimestamp)],
    ['Subtotal', money(o.subtotal)],
    ['Discount Amount', money(o.discountAmount)],
    ['Convenience Fee', money(o.convenienceFee)],
    ['Tax Amount', money(o.taxAmount)],
    ['Total Amount', money(o.totalAmount)],
    ['Currency', safe(o.currency)],
    ['Paid At', safe(o.paidAt)],
    ['Tracking Number', safe(o.trackingNumber)],
    ['Carrier', safe(o.carrier)],
    ['Shipped At', safe(o.shippedAt)],
    ['Delivered At', safe(o.deliveredAt)],
    ['Contact Name', safe(o.contactName)],
    ['Contact Phone', safe(o.contactPhone)],
    ['Contact Email', safe(o.contactEmail)],
    ['Cancelled At', safe(o.cancelledAt)],
    ['Cancellation Reason', safe(o.cancellationReason)],
    ['Refund Amount', money(o.refundAmount)],
    ['Created At', safe(o.createdAt)],
    ['Updated At', safe(o.updatedAt)]
  ];

  const leftX = 50;
  const rightX = 310;
  const startY = doc.y;
  const left = fields.slice(0, Math.ceil(fields.length / 2));
  const right = fields.slice(Math.ceil(fields.length / 2));

  doc.text(left.map(([k, v]) => `${k}: ${v || '-'}`).join('\n'), leftX, startY, {
    width: 240
  });
  doc.text(right.map(([k, v]) => `${k}: ${v || '-'}`).join('\n'), rightX, startY, {
    width: 235
  });

  doc.moveDown(8);
  if (doc.y < startY + 220) doc.y = startY + 220;

  doc.moveDown(0.8);
  hr(doc, doc.y);
  doc.moveDown(1.0);

  // Items
  doc.fontSize(12).text('Order Items', { underline: true });
  doc.moveDown(0.6);
  doc.fontSize(10);

  const headerY = doc.y;
  doc.fillColor('#111827');
  doc.text('Item', 50, headerY, { width: 210 });
  doc.text('Qty', 270, headerY, { width: 40 });
  doc.text('Unit', 320, headerY, { width: 80 });
  doc.text('Total', 410, headerY, { width: 135, align: 'right' });
  doc.fillColor('black');
  hr(doc, headerY + 14);

  let y = headerY + 20;
  const rowH = 18;
  const items = input.items ?? [];

  for (const it of items) {
    const name =
      safe(it.itemName) ||
      safe(it.itemType) ||
      safe(it.productId || it.pujaId || it.prasadId || it.dharshanId || it.itemId);

    doc.text(name, 50, y, { width: 210 });
    doc.text(safe(it.quantity ?? ''), 270, y, { width: 40 });
    doc.text(money(it.unitPrice ?? ''), 320, y, { width: 80 });
    doc.text(money(it.totalPrice ?? ''), 410, y, { width: 135, align: 'right' });

    y += rowH;
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
  }

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#6B7280').text(
    'This invoice is generated electronically and is valid without a signature.',
    { align: 'center' }
  );
  doc.fillColor('black');

  doc.end();
}


