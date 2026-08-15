import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface TransactionReportData {
  date: string;
  description: string;
  category: string;
  amount: number;
  direction: "in" | "out";
}

export function generateTransactionPDF(
  transactions: TransactionReportData[],
  month: string,
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
  doc.text(`Monthly Statement: ${month} ${year}`, 14, 30);
  doc.text(`Account Holder: ${userName}`, 14, 36);
  doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 14, 42);

  // Table Data
  const tableColumn = ["Date", "Description", "Category", "Type", "Amount"];
  const tableRows = transactions.map(tx => [
    format(new Date(tx.date), 'dd MMM yyyy'),
    tx.description,
    tx.category || "Uncategorized",
    tx.direction === "in" ? "Credit" : "Debit",
    `Rs. ${Math.abs(tx.amount).toFixed(2)}`
  ]);

  // Total calculations
  const totalIn = transactions.filter(t => t.direction === 'in').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalOut = transactions.filter(t => t.direction === 'out').reduce((sum, t) => sum + Number(t.amount), 0);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { textColor: [100, 116, 139] }, // Type
      4: { halign: 'right', fontStyle: 'bold' } // Amount
    },
    didParseCell: function(data) {
      // Color code the Amount column
      if (data.section === 'body' && data.column.index === 4) {
        const type = (data.row.raw as any)[3];
        if (type === 'Credit') {
          data.cell.styles.textColor = [16, 185, 129]; // emerald-500
        } else {
          data.cell.styles.textColor = [239, 68, 68]; // red-500
        }
      }
    }
  });

  // Footer Summary
  const finalY = (doc as any).lastAutoTable.finalY || 50;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Credits: Rs. ${totalIn.toFixed(2)}`, 14, finalY + 10);
  doc.text(`Total Debits: Rs. ${totalOut.toFixed(2)}`, 14, finalY + 16);
  doc.text(`Net Cash Flow: Rs. ${(totalIn - totalOut).toFixed(2)}`, 14, finalY + 22);

  // Save the PDF
  doc.save(`NisFlow_Statement_${month}_${year}.pdf`);
}
