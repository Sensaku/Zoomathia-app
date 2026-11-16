/** Saves a Blob as `filename` through a temporary `<a download>` link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // The browser reads the Blob asynchronously: release the URL a little later.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
