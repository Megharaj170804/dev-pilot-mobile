import type { EodSheetRow } from '../types';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const COPY_COLUMN_NAMES = ['no.', 'type', 'task', 'eod status', 'estimation hours'];

export interface ParsedSheetDate {
  y: number;
  m: number;
  d: number;
}

export function parseSheetDate(value: string): ParsedSheetDate | null {
  const t = String(value || '').trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) {
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(t))) {
    const yr = Number(m[3]);
    return { y: yr < 100 ? 2000 + yr : yr, m: Number(m[2]), d: Number(m[1]) };
  }
  if ((m = /^(\d{1,2})[ \-]([A-Za-z]{3})[a-z]*[ \-,]+(\d{4})/.exec(t))) {
    const idx = SHORT_MONTHS.findIndex(x => x.toLowerCase() === m![2].toLowerCase());
    if (idx >= 0) return { y: Number(m[3]), m: idx + 1, d: Number(m[1]) };
  }
  if ((m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(t))) {
    const idx = SHORT_MONTHS.findIndex(x => x.toLowerCase() === m![1].toLowerCase());
    if (idx >= 0) return { y: Number(m[3]), m: idx + 1, d: Number(m[2]) };
  }
  return null;
}

export function detectDateCol(rows: EodSheetRow[]): number {
  const header = rows[0]?.cells || [];
  const body = rows.slice(1);
  const named = header.findIndex(h => /date|day/i.test(h));
  if (named >= 0) return named;

  let best = -1;
  let bestCount = 0;
  header.forEach((_, idx) => {
    const n = body.filter(r => parseSheetDate(r.cells[idx] || '')).length;
    if (n > bestCount) {
      bestCount = n;
      best = idx;
    }
  });
  return bestCount >= Math.max(2, body.length / 2) ? best : -1;
}

export function monthKeyOfCell(cell: string): string | null {
  const parsed = parseSheetDate(cell);
  return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}` : null;
}

export function dateKeyOfCell(cell: string): string {
  const p = parseSheetDate(cell);
  return p ? `${p.y}-${p.m}-${p.d}` : String(cell || '').trim().toLowerCase();
}

export function todayLikeFormat(rows: EodSheetRow[], dateCol: number, now = new Date()): string {
  if (dateCol < 0) return '';
  const last = rows.slice(1).map(r => String(r.cells[dateCol] || '').trim()).filter(Boolean).pop() || '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = now.getDate();
  const mo = now.getMonth() + 1;
  const y = now.getFullYear();

  if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return `${y}-${pad(mo)}-${pad(d)}`;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(last)) return `${pad(d)}/${pad(mo)}/${y}`;
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(last)) return `${pad(d)}-${pad(mo)}-${y}`;
  let m = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(last);
  if (m) return `${pad(d)}-${m[2].length > 3 ? FULL_MONTHS[mo - 1] : SHORT_MONTHS[mo - 1]}-${y}`;
  m = /^(\d{1,2})[ ]([A-Za-z]+)[,]?[ ](\d{4})$/.exec(last);
  if (m) return `${pad(d)} ${m[2].length > 3 ? FULL_MONTHS[mo - 1] : SHORT_MONTHS[mo - 1]} ${y}`;
  m = /^([A-Za-z]+)[.]?[ ](\d{1,2}),?[ ](\d{4})$/.exec(last);
  if (m) return `${m[1].length > 3 ? FULL_MONTHS[mo - 1] : SHORT_MONTHS[mo - 1]} ${pad(d)}, ${y}`;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function nextNoForDate(rows: EodSheetRow[], dateCol: number, noCol: number, dateValue: string): string {
  if (noCol < 0 || dateCol < 0 || !dateValue.trim()) return '';
  const want = dateKeyOfCell(dateValue);
  const used = rows
    .slice(1)
    .filter(r => dateKeyOfCell(r.cells[dateCol] || '') === want)
    .map(r => parseInt(r.cells[noCol] || '', 10))
    .filter(n => Number.isFinite(n));
  return String(used.length ? Math.max(...used) + 1 : 1);
}

export function pickCopyColumns(header: string[], rows: string[][]): { header: string[]; rows: string[][] } {
  const idx = COPY_COLUMN_NAMES
    .map(name => header.findIndex(h => String(h).trim().toLowerCase().replace(/\.$/, '') === name.replace(/\.$/, '')))
    .filter(i => i >= 0);
  if (!idx.length) return { header, rows };
  return {
    header: idx.map(i => header[i]),
    rows: rows.map(r => idx.map(i => r[i] ?? '')),
  };
}

export function toTsv(matrix: string[][]): string {
  return matrix
    .map(row => row.map(v => (/[\t\n"]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join('\t'))
    .join('\n');
}

export function columnIndexByPattern(header: string[], pattern: RegExp): number {
  return header.findIndex(h => pattern.test(h));
}
