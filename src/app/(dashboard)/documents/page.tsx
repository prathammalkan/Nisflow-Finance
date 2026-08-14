'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDocuments } from '@/lib/hooks/use-documents';
import UploadDialog from '@/components/documents/upload-dialog';

export default function DocumentVaultPage() {
  const { data: documents, isLoading } = useDocuments();
  const [filter, setFilter] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Document Vault</h1>
        <UploadDialog />
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4">
          <select 
            className="rounded-md border border-gray-300 p-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="transaction">Transactions</option>
            <option value="account">Accounts</option>
            <option value="ipo">IPO</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          <p>Loading documents...</p>
        ) : documents?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-lg shadow">
            No documents found. Upload a document to get started.
          </div>
        ) : (
          documents?.filter((d: any) => !filter || d.entity_type === filter).map((doc: any) => (
            <div key={doc.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📄</span>
                  <h3 className="font-medium truncate" title={doc.name}>{doc.name}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-1">Type: {doc.entity_type || 'General'}</p>
                <p className="text-xs text-gray-500">Date: {new Date(doc.created_at).toLocaleDateString()}</p>
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{doc.description}</p>
              </div>
              <div className="mt-4 pt-4 border-t flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank')}>View</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
