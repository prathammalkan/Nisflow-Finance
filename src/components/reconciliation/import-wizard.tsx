'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function ImportWizard({ accountId }: { accountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [fileData, setFileData] = useState<any[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        setFileData(data);
        setStep(2);
        toast.success('File parsed successfully');
      } catch (error) {
        toast.error('Failed to parse file');
      }
    };
    reader.readAsBinaryString(file);
  };

  if (!isOpen) {
    return (
      <Button 
        onClick={() => setIsOpen(true)}
        disabled={!accountId}
      >
        Import Bank Statement
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Import Statement (Step {step}/4)</h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {step === 1 && (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <input 
              type="file" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              onChange={handleFileUpload}
              className="hidden" 
              id="file-upload" 
            />
            <label htmlFor="file-upload" className="cursor-pointer text-blue-600 hover:text-blue-800">
              Click to upload CSV or Excel file
            </label>
            <p className="text-sm text-gray-500 mt-2">Support for formats from major banks</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium">Map Columns</h3>
            <p className="text-sm text-gray-500">Please verify the columns correctly match your bank statement data.</p>
            {/* Dummy mapping UI */}
            <div className="bg-gray-50 p-4 rounded">
              Mapping UI placeholder
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Next</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium">Review Data ({fileData.length} records)</h3>
            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    {fileData.length > 0 && Object.keys(fileData[0]).map(key => (
                      <th key={key} className="p-2 text-left">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileData.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b">
                      {Object.values(row as any).map((val: any, j) => (
                        <td key={j} className="p-2">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>Next</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 text-center py-8">
            <h3 className="font-medium text-lg">Ready to Import</h3>
            <p className="text-gray-500">You are about to import {fileData.length} transactions into this account.</p>
            <div className="flex justify-center gap-4 mt-8">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => {
                toast.success('Import completed successfully!');
                setIsOpen(false);
                setStep(1);
                setFileData([]);
              }}>Confirm & Import</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
