/**
 * Fills the `{name}` placeholders of a translated template in one pass. Values are inserted
 * as they are: a name containing `$&` or `{date}` is never read as a pattern or a placeholder.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}
