import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sanitizeImportText } from '@/lib/reconciliation/import-sanitizer';

export function exportToCSV(data: any[], filename: string) {
  // Defensive hardening: Sanitize data against CSV formula injection (=, +, -, @)
  const sanitizedData = data.map((row) => {
    if (typeof row !== 'object' || row === null) return row;
    const cleanRow: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      cleanRow[k] = sanitizeImportText(v);
    }
    return cleanRow;
  });

  const csv = Papa.unparse(sanitizedData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export async function exportToExcel(sheets: { name: string; data: any[] }[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach((sheet) => {
    const ws = workbook.addWorksheet(sheet.name);
    if (sheet.data && sheet.data.length > 0) {
      const headers = Object.keys(sheet.data[0]);
      ws.columns = headers.map((h) => ({ header: h, key: h }));
      ws.addRows(sheet.data);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function exportToPDF(title: string, data: any[], filename: string) {
  const doc = new jsPDF();
  doc.text(title, 14, 15);
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    const body = data.map(row => headers.map(header => String(row[header])));
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 20
    });
  }
  doc.save(`${filename}.pdf`);
}
