// Reusable and secure spreadsheet import sanitization and normalization utilities

// Context-aware formula sanitizer for imported text/narration
export function sanitizeImportText(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return val.toISOString();

  let str = String(val).trim();

  // Preserve legitimate numeric amounts (e.g. -500, +1200, -12.50)
  const isNumeric = /^[+-]?\s*[\d,]+(\.\d+)?$/.test(str) || /^\([+-]?\s*[\d,]+(\.\d+)?\)$/.test(str);
  if (!isNumeric) {
    // Detect formula injection or DDE commands in textual fields (e.g. =SUM, @CMD, =HYPERLINK, +cmd, -cmd)
    if (/^[=@|]/.test(str) || /^[+-][a-zA-Z]/.test(str)) {
      str = `'${str}`;
    }
  }
  return str;
}

// Helper to parse dates into ISO YYYY-MM-DD
export function parseDateString(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
  }
  if (typeof val === 'number') {
    // Excel serial date format (days since Dec 30, 1899 with 1900 leap-year offset: 25569)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  // Try standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && str.length >= 8 && !/^\d+$/.test(str)) {
    return parsed.toISOString().split('T')[0];
  }
  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return new Date().toISOString().split('T')[0];
}

export function parseCleanAmount(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  let isNegative = false;

  // Check for Dr / dr debit indicator or accounting parentheses
  if (/\bdr\b/i.test(str) || (str.startsWith('(') && str.endsWith(')'))) {
    isNegative = true;
    str = str.replace(/[()]/g, '');
  }

  // Look for negative sign before or after currency symbols
  if (/-\s*[\d,]+(?:\.\d+)?/.test(str) || /[\d,]+(?:\.\d+)?\s*-/.test(str)) {
    isNegative = true;
  }

  // Extract the numeric portion ignoring currency symbols and commas
  const match = str.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return 0;

  const cleanNumStr = match[0].replace(/,/g, '');
  const num = parseFloat(cleanNumStr);
  if (isNaN(num)) return 0;

  return isNegative ? -Math.abs(num) : num;
}
