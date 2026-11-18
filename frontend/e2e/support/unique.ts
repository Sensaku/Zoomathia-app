let counter = 0

/** A label that no other test of the run uses: the database is shared and never reset. */
export function unique(prefix: string): string {
  counter += 1
  return `${prefix} ${Date.now().toString(36)}${counter}`
}

/**
 * Accessible name of an action button of a contribution: the action, then the subject ("Valider : x").
 * The browser may or may not put a space before the colon, so the match allows both.
 */
export function actionName(action: string, subject: string): RegExp {
  // Subjects are plain words: any other character is matched loosely instead of escaped.
  const loose = subject.replace(/[^a-zA-Z0-9 ]/g, '.')
  return new RegExp(`^${action} *: *${loose}$`)
}
