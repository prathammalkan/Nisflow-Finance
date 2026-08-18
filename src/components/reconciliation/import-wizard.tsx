'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { X, Upload, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const MAX_FILE_SIZE_MB = 5;
const MAX_ROWS = 500;

import {
  sanitizeImportText,
  parseDateString,
  parseCleanAmount,
} from '@/lib/reconciliation/import-sanitizer';

interface NormalizedTransaction {
  date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  reference: string;
  balance: number | null;
}

export default function ImportWizard({
  accountId,
  onImportComplete,
}: {
  accountId: string;
  onImportComplete?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Column Mapping state
  const [amountMode, setAmountMode] = useState<'single' | 'dual'>('single');
  const [dateCol, setDateCol] = useState('');
  const [descCol, setDescCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [debitCol, setDebitCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [refCol, setRefCol] = useState('');
  const [balCol, setBalCol] = useState('');

  const queryClient = useQueryClient();
  const supabase = createClient();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Invalid file type. Please upload a CSV or Excel file.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      e.target.value = '';
      return;
    }

    setFileName(file.name);

    try {
      let rawJson: any[] = [];

      if (ext === 'csv' || file.type === 'text/csv') {
        // Safe CSV parsing via papaparse (treats formulas as raw strings, disarms injection)
        const text = await file.text();
        const parsed = Papa.parse<Record<string, any>>(text, {
          header: true,
          skipEmptyLines: 'greedy',
          transform: (val) => sanitizeImportText(val),
        });

        rawJson = (parsed.data || []).filter((row) =>
          Object.values(row).some((v) => v !== '' && v !== null && v !== undefined)
        );
      } else {
        // Safe XLSX parsing via ExcelJS (extracts values without formula execution)
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet || worksheet.rowCount === 0) {
          toast.error('The uploaded file contains no data rows.');
          return;
        }

        const headers: string[] = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value || `Column_${colNumber}`).trim();
        });

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          if (rawJson.length >= MAX_ROWS) return;

          const rowData: Record<string, any> = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colName = headers[colNumber - 1] || `Col_${colNumber}`;
            let cellVal = cell.value;

            // Disarm ExcelJS formula cells and extract static evaluated/text result
            if (cellVal && typeof cellVal === 'object') {
              if ('result' in cellVal) {
                cellVal = (cellVal as any).result;
              } else if ('text' in cellVal) {
                cellVal = (cellVal as any).text;
              } else if (cellVal instanceof Date) {
                // Preserve native Date
              } else {
                cellVal = String(cellVal);
              }
            }

            if (typeof cellVal === 'string') {
              cellVal = sanitizeImportText(cellVal);
            }

            rowData[colName] = cellVal ?? '';
          });

          if (Object.values(rowData).some((v) => v !== '' && v !== null && v !== undefined)) {
            rawJson.push(rowData);
          }
        });
      }

      if (!rawJson || rawJson.length === 0) {
        toast.error('The uploaded file contains no data rows.');
        return;
      }

      const capped = rawJson.slice(0, MAX_ROWS);
      const cols = Object.keys(capped[0]);
      setColumns(cols);
      setFileData(capped);

      // Auto-detect columns
      const lowerCols = cols.map((c) => ({ original: c, lower: c.toLowerCase() }));

      const dCol = lowerCols.find((c) => c.lower.includes('date') || c.lower.includes('txn dt'))?.original || cols[0] || '';
      const desc = lowerCols.find((c) => c.lower.includes('narration') || c.lower.includes('desc') || c.lower.includes('particular') || c.lower.includes('remark'))?.original || cols[1] || '';
      const deb = lowerCols.find((c) => c.lower.includes('debit') || c.lower.includes('withdrawal') || c.lower === 'dr')?.original || '';
      const cred = lowerCols.find((c) => c.lower.includes('credit') || c.lower.includes('deposit') || c.lower === 'cr')?.original || '';
      const amt = lowerCols.find((c) => c.lower.includes('amount') || c.lower.includes('txn amt'))?.original || '';
      const ref = lowerCols.find((c) => c.lower.includes('ref') || c.lower.includes('cheque') || c.lower.includes('chq') || c.lower.includes('utr') || c.lower.includes('upi'))?.original || '';
      const bal = lowerCols.find((c) => c.lower.includes('balance') || c.lower.includes('bal'))?.original || '';

      setDateCol(dCol);
      setDescCol(desc);
      setRefCol(ref);
      setBalCol(bal);

      if (deb && cred) {
        setAmountMode('dual');
        setDebitCol(deb);
        setCreditCol(cred);
      } else {
        setAmountMode('single');
        setAmountCol(amt || cols[2] || '');
      }

      setStep(2);
      toast.success(`Parsed ${capped.length} records successfully.`);
    } catch (err: any) {
      toast.error('Failed to parse file. Ensure it is a valid CSV or Excel file.');
    }
  };

  // Normalize all rows according to the mapping
  const normalizedRows: NormalizedTransaction[] = fileData
    .map((row) => {
      const date = parseDateString(row[dateCol]);
      const description = String(row[descCol] || 'Bank Transaction').trim();
      const reference = refCol ? String(row[refCol] || '').trim() : '';
      const balance = balCol && row[balCol] ? parseCleanAmount(row[balCol]) : null;

      let amount = 0;
      let direction: 'in' | 'out' = 'out';

      if (amountMode === 'dual') {
        const debitAmt = parseCleanAmount(row[debitCol]);
        const creditAmt = parseCleanAmount(row[creditCol]);
        if (creditAmt > 0) {
          amount = creditAmt;
          direction = 'in';
        } else {
          amount = debitAmt;
          direction = 'out';
        }
      } else {
        const rawAmt = String(row[amountCol] || '0');
        amount = parseCleanAmount(rawAmt);
        // If string contains "-" or "DR", direction is out; otherwise if "+" or "CR", direction is in
        if (rawAmt.includes('-') || rawAmt.toUpperCase().includes('DR')) {
          direction = 'out';
        } else if (rawAmt.includes('+') || rawAmt.toUpperCase().includes('CR')) {
          direction = 'in';
        } else {
          direction = 'out'; // default expense/debit
        }
      }

      return {
        date,
        description,
        amount,
        direction,
        reference,
        balance,
      };
    })
    .filter((r) => r.amount > 0);

  const handleConfirmImport = async () => {
    if (!accountId) {
      toast.error('No account selected for import');
      return;
    }

    if (normalizedRows.length === 0) {
      toast.error('No valid transactions to import after column mapping.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // 1. Create bank_statements header
      const { data: stmtData, error: stmtError } = await (supabase.from('bank_statements') as any)
        .insert({
          user_id: userData.user.id,
          account_id: accountId,
          file_name: fileName,
          imported_at: new Date().toISOString(),
          status: 'imported',
        })
        .select()
        .single();

      if (stmtError) throw stmtError;

      // 2. Insert statement transactions
      const txsToInsert = normalizedRows.map((tx) => ({
        statement_id: stmtData.id,
        date: tx.date,
        description: tx.description,
        amount: new Decimal(tx.amount).toNumber(),
        direction: tx.direction,
        reference: tx.reference || null,
        balance: tx.balance ? new Decimal(tx.balance).toNumber() : null,
        is_matched: false,
      }));

      const { error: txError } = await (supabase.from('bank_statement_transactions') as any)
        .insert(txsToInsert);

      if (txError) throw txError;

      toast.success(`Successfully imported ${normalizedRows.length} statement transactions!`);
      queryClient.invalidateQueries({ queryKey: ['bank_statement_transactions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      
      onImportComplete?.();
      handleClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import bank statement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep(1);
    setFileData([]);
    setFileName('');
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} disabled={!accountId} variant="outline">
        <Upload className="mr-2 h-4 w-4" /> Import Bank Statement
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card text-foreground border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">Import Bank Statement</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Step {step} of 4</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Progress bar */}
          <div className="flex gap-1 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Upload className="h-4 w-4" /> Choose File
              </label>
              <p className="text-sm text-muted-foreground mt-3">
                CSV or Excel (.csv, .xlsx, .xls) · Max {MAX_FILE_SIZE_MB}MB · Max {MAX_ROWS} rows
              </p>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg">Map Columns</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  File: <span className="font-medium text-foreground">{fileName}</span> · {fileData.length} rows loaded
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Date Column *</label>
                  <select
                    value={dateCol}
                    onChange={(e) => setDateCol(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  >
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Description / Narration Column *</label>
                  <select
                    value={descCol}
                    onChange={(e) => setDescCol(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  >
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">
                    Amount Mode
                  </label>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="amountMode"
                        checked={amountMode === 'single'}
                        onChange={() => setAmountMode('single')}
                      />
                      Single Amount Column (with +/- or direction)
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="amountMode"
                        checked={amountMode === 'dual'}
                        onChange={() => setAmountMode('dual')}
                      />
                      Separate Debit & Credit Columns
                    </label>
                  </div>
                </div>

                {amountMode === 'single' ? (
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Amount Column *</label>
                    <select
                      value={amountCol}
                      onChange={(e) => setAmountCol(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                    >
                      {columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold uppercase text-muted-foreground">Debit / Withdrawal Column *</label>
                      <select
                        value={debitCol}
                        onChange={(e) => setDebitCol(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                      >
                        <option value="">-- None / Select --</option>
                        {columns.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-muted-foreground">Credit / Deposit Column *</label>
                      <select
                        value={creditCol}
                        onChange={(e) => setCreditCol(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                      >
                        <option value="">-- None / Select --</option>
                        {columns.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Reference / UTR Column (Optional)</label>
                  <select
                    value={refCol}
                    onChange={(e) => setRefCol(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  >
                    <option value="">-- None --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Running Balance Column (Optional)</label>
                  <select
                    value={balCol}
                    onChange={(e) => setBalCol(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  >
                    <option value="">-- None --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>
                  Preview Mapped Data <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Review Mapped Data</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {normalizedRows.length} valid transactions ready for import.
                </p>
              </div>

              <div className="overflow-x-auto max-h-80 rounded-lg border border-border">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="bg-muted sticky top-0 font-medium text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-left">Direction</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-left">Reference</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {normalizedRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 whitespace-nowrap">{row.date}</td>
                        <td className="p-3 max-w-[240px] truncate">{row.description}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                              row.direction === 'in'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {row.direction === 'in' ? 'Deposit' : 'Withdrawal'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold whitespace-nowrap">
                          {formatINR(row.amount)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{row.reference || '-'}</td>
                        <td className="p-3 text-right text-muted-foreground">
                          {row.balance ? formatINR(row.balance) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {normalizedRows.length > 50 && (
                <p className="text-xs text-muted-foreground">
                  Showing first 50 of {normalizedRows.length} transactions.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)}>Proceed to Import</Button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm Import */}
          {step === 4 && (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-xl">Confirm Bank Statement Import</h3>
              <p className="text-muted-foreground max-w-md mx-auto text-sm">
                You are about to import <span className="font-bold text-foreground">{normalizedRows.length}</span> bank statement transactions into this account. NisFlow will automatically match them against your ledger.
              </p>
              <div className="flex justify-center gap-4 pt-4">
                <Button variant="outline" onClick={() => setStep(3)} disabled={isSubmitting}>
                  Back
                </Button>
                <Button onClick={handleConfirmImport} disabled={isSubmitting}>
                  {isSubmitting ? 'Importing...' : 'Confirm & Import Transactions'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
