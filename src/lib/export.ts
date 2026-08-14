import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToCSV(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
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

export function exportToExcel(sheets: { name: string; data: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
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
