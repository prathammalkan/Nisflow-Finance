'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useUploadDocument } from '@/lib/hooks/use-documents';
import { Upload, X, FileUp } from 'lucide-react';

export default function UploadDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState('');
  const [description, setDescription] = useState('');
  
  const { mutateAsync: uploadDocument, isPending } = useUploadDocument();

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }
    
    try {
      await uploadDocument({
        file,
        metadata: {
          entity_type: entityType,
          description,
        }
      });
      toast.success('Document uploaded successfully');
      setIsOpen(false);
      setFile(null);
      setEntityType('');
      setDescription('');
    } catch {
      toast.error('Failed to upload document');
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="gap-2 font-semibold">
        <Upload className="h-4 w-4" /> Upload Document
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-card text-card-foreground border border-border p-6 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" /> Upload Document
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Select File</label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-muted/20 hover:bg-muted/30 transition-colors">
              <input 
                type="file" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden" 
                id="doc-upload" 
              />
              <label htmlFor="doc-upload" className="cursor-pointer text-sm font-medium text-primary hover:underline block">
                {file ? file.name : 'Click to select a file (PDF, PNG, JPG, CSV)'}
              </label>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Related To (Optional)</label>
            <select
              className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              <option value="transaction">Transaction / Receipt</option>
              <option value="account">Bank Statement</option>
              <option value="ipo">IPO Application</option>
              <option value="tax">Tax Record</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the document"
              className="text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleUpload} disabled={isPending || !file}>
              {isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
