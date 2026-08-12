type ClassValue = string | number | false | null | undefined

/** Joins truthy class names together, filtering out falsy values. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
