'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useUploadDocument } from '@/lib/hooks/use-documents';
import { Upload, FileUp } from 'lucide-react';

export default function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState('');
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: uploadDocument, isPending } = useUploadDocument();

  const resetForm = () => {
    setFile(null);
    setEntityType('');
    setDescription('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    setOpen(nextOpen);
  };

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
        },
      });
      toast.success('Document uploaded successfully');
      handleOpenChange(false);
    } catch {
      toast.error('Failed to upload document');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-semibold">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload Document
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" aria-hidden="true" />
            Upload Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* File selector */}
          <div>
            <label
              htmlFor="doc-upload"
              className="block text-xs font-semibold uppercase text-muted-foreground mb-1"
            >
              Select File
            </label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-muted/20 hover:bg-muted/30 transition-colors">
              <input
                ref={inputRef}
                type="file"
                id="doc-upload"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls"
                aria-describedby="doc-upload-hint"
              />
              <label
                htmlFor="doc-upload"
                className="cursor-pointer text-sm font-medium text-primary hover:underline block"
              >
                {file ? file.name : 'Click to select a file'}
              </label>
              <p
                id="doc-upload-hint"
                className="text-xs text-muted-foreground mt-1"
              >
                PDF, PNG, JPG, WEBP, CSV, XLSX — max 10 MB
              </p>
            </div>
          </div>

          {/* Related To */}
          <div>
            <label
              htmlFor="entity-type"
              className="block text-xs font-semibold uppercase text-muted-foreground mb-1"
            >
              Related To (Optional)
            </label>
            <select
              id="entity-type"
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

          {/* Description */}
          <div>
            <label
              htmlFor="doc-description"
              className="block text-xs font-semibold uppercase text-muted-foreground mb-1"
            >
              Description
            </label>
            <Input
              id="doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the document"
              className="text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isPending || !file}>
              {isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
