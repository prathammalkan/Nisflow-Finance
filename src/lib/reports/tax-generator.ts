import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface TaxReportData {
  category: string;
  totalIncome: number;
  totalExpense: number;
  netImpact: number;
}

export function generateTaxPDF(
  taxData: TaxReportData[],
  year: string,
  userName: string
) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("NisFlow Finance", 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Annual Tax & PnL Summary: FY ${year}`, 14, 30);
  doc.text(`Account Holder: ${userName}`, 14, 36);
  doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 14, 42);

  // Table Data
  const tableColumn = ["Category", "Total Income (Credits)", "Total Expense (Debits)", "Net Impact"];
  const tableRows = taxData.map(row => [
    row.category,
    `Rs. ${Math.abs(row.totalIncome).toFixed(2)}`,
    `Rs. ${Math.abs(row.totalExpense).toFixed(2)}`,
    `Rs. ${Math.abs(row.netImpact).toFixed(2)}`
  ]);

  // Total calculations
  const totalIn = taxData.reduce((sum, row) => sum + Number(row.totalIncome), 0);
  const totalOut = taxData.reduce((sum, row) => sum + Number(row.totalExpense), 0);
  const finalNet = totalIn - totalOut;

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: 'right', textColor: [16, 185, 129] }, // Income
      2: { halign: 'right', textColor: [239, 68, 68] }, // Expense
      3: { halign: 'right', fontStyle: 'bold' } // Net Impact
    },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 3) {
        const netValue = taxData[data.row.index].netImpact;
        if (netValue >= 0) {
          data.cell.styles.textColor = [16, 185, 129];
        } else {
          data.cell.styles.textColor = [239, 68, 68];
        }
      }
    }
  });

  // Footer Summary
  const finalY = (doc as any).lastAutoTable.finalY || 50;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Gross Income: Rs. ${totalIn.toFixed(2)}`, 14, finalY + 10);
  doc.text(`Total Gross Expenses: Rs. ${totalOut.toFixed(2)}`, 14, finalY + 16);
  doc.text(`Net Retained Cash: Rs. ${finalNet.toFixed(2)}`, 14, finalY + 22);

  // Save the PDF
  doc.save(`NisFlow_TaxSummary_FY${year}.pdf`);
}
