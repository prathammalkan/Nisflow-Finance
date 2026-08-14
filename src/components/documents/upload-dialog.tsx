'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useUploadDocument } from '@/lib/hooks/use-documents';

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
    } catch (error) {
      toast.error('Failed to upload document');
    }
  };

  if (!isOpen) {
    return <Button onClick={() => setIsOpen(true)}>Upload Document</Button>;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Upload Document</h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input 
                type="file" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden" 
                id="doc-upload" 
              />
              <label htmlFor="doc-upload" className="cursor-pointer text-blue-600 hover:text-blue-800">
                {file ? file.name : 'Click to select a file'}
              </label>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Related To (Optional)</label>
            <select
              className="w-full rounded-md border border-gray-300 p-2"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              <option value="transaction">Transaction</option>
              <option value="account">Account</option>
              <option value="ipo">IPO</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the document"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
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
