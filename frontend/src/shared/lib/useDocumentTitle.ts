import { useEffect } from 'react'

/**
 * Sets `document.title` to `<title> · Zoomathia` while the page is shown (RGAA: each page has
 * its own title). The previous title comes back when the page unmounts.
 *
 * @param title - The page title, already translated.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · Zoomathia`
    return () => {
      document.title = previous
    }
  }, [title])
}
