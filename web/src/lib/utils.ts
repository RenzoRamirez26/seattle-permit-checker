/** Joins class names, skipping empty ones. (shadcn's `cn`, without the two packages it usually needs.) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
