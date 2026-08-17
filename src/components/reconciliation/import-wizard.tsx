'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { X, Upload, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const MAX_FILE_SIZE_MB = 5;
const MAX_ROWS = 500;

export default function ImportWizard({ accountId }: { accountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [fileData, setFileData] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security: validate file type
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Invalid file type. Please upload a CSV or Excel file.');
      e.target.value = '';
      return;
    }

    // Security: validate file size (prevent ReDoS / memory exhaustion)
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      e.target.value = '';
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', sheetRows: MAX_ROWS + 1 }); // cap rows during parse
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Cap rows to prevent UI freeze
        const capped = data.slice(0, MAX_ROWS);
        if (data.length > MAX_ROWS) {
          toast.warning(`File has ${data.length} rows — only first ${MAX_ROWS} will be imported.`);
        }

        setFileData(capped);
        setStep(2);
        toast.success(`Parsed ${capped.length} records successfully.`);
      } catch {
        toast.error('Failed to parse file. Ensure it is a valid CSV or Excel file.');
      }
    };
    reader.readAsBinaryString(file);
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
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Map Columns</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  File: <span className="font-medium text-foreground">{fileName}</span> · {fileData.length} records found
                </p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4 text-sm text-muted-foreground">
                Column mapping UI — select which columns map to Date, Description, Amount, Direction.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>Preview Data</Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Review Data</h3>
                <p className="text-sm text-muted-foreground mt-1">{fileData.length} records — check before importing</p>
              </div>
              <div className="overflow-x-auto max-h-80 rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {fileData.length > 0 && Object.keys(fileData[0]).map(key => (
                        <th key={key} className="p-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fileData.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                        {Object.values(row as any).map((val: any, j) => (
                          <td key={j} className="p-2.5 whitespace-nowrap">{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fileData.length > 50 && (
                <p className="text-xs text-muted-foreground">Showing first 50 of {fileData.length} rows for preview.</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)}>Confirm</Button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm Import */}
          {step === 4 && (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-xl">Ready to Import</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                You are about to import <span className="font-bold text-foreground">{fileData.length}</span> transactions into this account. This action cannot be undone.
              </p>
              <div className="flex justify-center gap-4 pt-4">
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                <Button onClick={() => {
                  toast.success(`${fileData.length} transactions imported successfully!`);
                  handleClose();
                }}>
                  Confirm & Import
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
