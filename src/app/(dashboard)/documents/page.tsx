'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDocuments } from '@/lib/hooks/use-documents';
import UploadDialog from '@/components/documents/upload-dialog';
import { FileText, ExternalLink } from 'lucide-react';

export default function DocumentVaultPage() {
  const { data: documents, isLoading } = useDocuments();
  const [filter, setFilter] = useState('');

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Document Vault</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Store and manage tax slips, bank statements, receipts, and identity documents.
          </p>
        </div>
        <UploadDialog />
      </div>

      <div className="bg-card p-4 rounded-xl border border-border">
        <div className="flex gap-4">
          <select 
            className="rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All Document Types</option>
            <option value="transaction">Transactions & Receipts</option>
            <option value="account">Bank Statements</option>
            <option value="ipo">IPO Documents</option>
            <option value="tax">Tax Records</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">Loading documents...</div>
        ) : documents?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl">
            No documents found. Upload a document to get started.
          </div>
        ) : (
          documents?.filter((d: any) => !filter || d.entity_type === filter).map((doc: any) => (
            <div key={doc.id} className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <h3 className="font-medium text-foreground truncate" title={doc.name}>{doc.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Type: <span className="capitalize text-foreground">{doc.entity_type || 'General'}</span></p>
                <p className="text-xs text-muted-foreground">Date: {new Date(doc.created_at).toLocaleDateString()}</p>
                {doc.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{doc.description}</p>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-border flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank')} className="gap-1 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
