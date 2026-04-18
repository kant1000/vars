export function fmtPrice(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

export function fmtDuration(blocks: number): string {
  const m = blocks * 30;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}hr ${rem}min` : `${h}hr`;
}

export function fmtTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
