/** The text of a form field, or an empty string (a file field or a missing field gives no text). */
export function formText(data: FormData, name: string): string {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}
