/** Dates and numbers in the reader's locale (Vercel: Intl for dates and numbers). */
export function formatDate(iso: string, locale?: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale ?? undefined, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function formatNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? undefined, { maximumFractionDigits: 1 }).format(n);
}
