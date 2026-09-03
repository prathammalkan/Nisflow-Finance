import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

export interface StatementRow {
  date: string;
  description: string;
  type: string;
  inflow?: number;
  outflow?: number;
  amount?: number;
  balance?: number;
}

export interface StatementOptions {
  title: string;
  subtitle?: string;
  entityName: string;
  entityType: 'Account' | 'Person' | 'General';
  dateFrom?: string;
  dateTo?: string;
  rows: StatementRow[];
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}

export function generatePrintablePDFStatement(options: StatementOptions) {
  const doc = new jsPDF();

  // Header Letterhead
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129); // Emerald-500
  doc.text("NisFlow Finance", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Personal Ledger & Financial Statement", 14, 26);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 196, 26, { align: 'right' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 30, 196, 30);

  // Statement Meta Info
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(options.title, 14, 40);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${options.entityType}: ${options.entityName}`, 14, 46);
  if (options.subtitle) {
    doc.text(options.subtitle, 14, 52);
  }

  // Summary Metrics Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 56, 182, 22, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Total Inflow", 20, 63);
  doc.text("Total Outflow", 80, 63);
  doc.text("Closing Position", 140, 63);

  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129); // Green
  doc.text(formatINR(options.totalIn), 20, 71);

  doc.setTextColor(239, 68, 68); // Red
  doc.text(formatINR(options.totalOut), 80, 71);

  doc.setTextColor(15, 23, 42); // Slate
  doc.text(formatINR(options.closingBalance), 140, 71);

  // Statement Table
  const tableData = options.rows.map(r => [
    r.date,
    r.description,
    r.type,
    r.inflow && r.inflow > 0 ? formatINR(r.inflow) : '-',
    r.outflow && r.outflow > 0 ? formatINR(r.outflow) : '-',
    r.balance !== undefined ? formatINR(r.balance) : '-'
  ]);

  autoTable(doc, {
    startY: 84,
    head: [['Date', 'Description', 'Type', 'In (₹)', 'Out (₹)', 'Balance (₹)']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 60 },
      2: { cellWidth: 28 },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer Disclaimer
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 250;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Confidential Personal Ledger Statement — Audit Verified by NisFlow Finance", 105, Math.min(285, finalY), { align: 'center' });

  const safeFilename = options.entityName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`statement_${safeFilename}_${new Date().toISOString().split('T')[0]}.pdf`);
}
