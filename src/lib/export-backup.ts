import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export async function exportFullUserBackupJSON() {
  const toastId = toast.loading("Generating complete JSON backup...");
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("User not authenticated", { id: toastId });
      return;
    }

    const tables = [
      'accounts',
      'transactions',
      'categories',
      'counterparties',
      'receivables',
      'payables',
      'ipos',
      'ipo_applications',
      'investments',
      'investment_transactions',
      'budgets',
      'savings_goals',
      'classification_rules',
      'tax_records',
      'documents',
      'monthly_closings',
      'audit_logs'
    ];

    const backupData: Record<string, any> = {
      _meta: {
        appName: "NisFlow Finance",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        userId: user.id,
        userEmail: user.email,
      },
      data: {},
    };

    for (const table of tables) {
      try {
        const { data, error } = await (supabase.from(table) as any).select('*');
        if (!error && data) {
          backupData.data[table] = data;
        }
      } catch (err) {
        console.warn(`Failed to fetch table ${table} for backup`, err);
      }
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `nisflow_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("JSON backup downloaded successfully!", { id: toastId });
  } catch (err) {
    console.error("Backup export failed", err);
    toast.error("Failed to generate backup", { id: toastId });
  }
}

export async function exportFullUserBackupSQL() {
  const toastId = toast.loading("Generating SQL database dump...");
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("User not authenticated", { id: toastId });
      return;
    }

    const tables = [
      'accounts',
      'transactions',
      'counterparties',
      'receivables',
      'payables',
      'ipos',
      'ipo_applications',
      'investments',
      'investment_transactions',
      'budgets',
      'savings_goals',
      'classification_rules',
      'tax_records'
    ];

    let sqlDump = `-- NisFlow Finance SQL Data Export\n`;
    sqlDump += `-- Exported At: ${new Date().toISOString()}\n`;
    sqlDump += `-- User: ${user.email} (${user.id})\n\n`;

    for (const table of tables) {
      try {
        const { data, error } = await (supabase.from(table) as any).select('*');
        if (!error && data && data.length > 0) {
          sqlDump += `-- Data for table: ${table} (${data.length} rows)\n`;
          for (const row of data) {
            const keys = Object.keys(row);
            const columns = keys.join(', ');
            const values = keys.map(k => {
              const val = row[k];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number' || typeof val === 'boolean') return val;
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(', ');

            sqlDump += `INSERT INTO public.${table} (${columns}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET updated_at = NOW();\n`;
          }
          sqlDump += `\n`;
        }
      } catch (err) {
        console.warn(`Failed SQL export for ${table}`, err);
      }
    }

    const blob = new Blob([sqlDump], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `nisflow_backup_${dateStr}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("SQL backup downloaded successfully!", { id: toastId });
  } catch (err) {
    console.error("SQL backup export failed", err);
    toast.error("Failed to generate SQL backup", { id: toastId });
  }
}
