// Developer page: the sample texts below are literal on purpose (no i18n).
import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  CheckboxField,
  ConfirmDialog,
  Dialog,
  ErrorSummary,
  TextAreaField,
  TextField,
} from '../shared/ui'

/** The colour tokens: name and swatch class. Their values are read from the stylesheet (`@theme`). */
const COLOURS: Array<[token: string, swatch: string]> = [
  ['ink', 'bg-ink'],
  ['ink-muted', 'bg-ink-muted'],
  ['ink-subtle', 'bg-ink-subtle'],
  ['ink-faint', 'bg-ink-faint'],
  ['accent', 'bg-accent'],
  ['accent-strong', 'bg-accent-strong'],
  ['paper', 'bg-paper'],
  ['paper-raised', 'bg-paper-raised'],
  ['paper-sunken', 'bg-paper-sunken'],
  ['rule', 'bg-rule'],
  ['rule-strong', 'bg-rule-strong'],
  ['success', 'bg-success'],
  ['success-soft', 'bg-success-soft'],
  ['danger', 'bg-danger'],
  ['danger-soft', 'bg-danger-soft'],
  ['warning', 'bg-warning'],
  ['warning-soft', 'bg-warning-soft'],
  ['chrome', 'bg-chrome'],
  ['chrome-raised', 'bg-chrome-raised'],
  ['chrome-line', 'bg-chrome-line'],
  ['on-chrome', 'bg-on-chrome'],
  ['on-chrome-muted', 'bg-on-chrome-muted'],
  ['focus-on-chrome', 'bg-focus-on-chrome'],
]

/** The value of a colour token as the browser computes it: `src/index.css` stays the only copy. */
function tokenValue(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim()
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `sec-${title.replace(/\W+/g, '-')}`
  return (
    <section className="mb-10" aria-labelledby={id}>
      <h2 id={id} className="mb-3 border-b border-rule pb-1 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Colours() {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {COLOURS.map(([token, swatch]) => (
        <li key={token} className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-8 w-8 shrink-0 border border-rule-strong ${swatch}`} />
          <span className="text-sm">
            <code>{token}</code> <span className="text-ink-muted">{tokenValue(token)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Buttons() {
  return (
    <div className="space-y-3">
      {(['primary', 'secondary', 'danger', 'ghost'] as const).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <Button variant={variant}>{variant}</Button>
          <Button variant={variant} size="sm" icon={Plus}>
            {variant} sm with icon
          </Button>
          <Button variant={variant} disabled>
            {variant} disabled
          </Button>
          <Button variant={variant} isLoading>
            {variant} loading
          </Button>
        </div>
      ))}
    </div>
  )
}

function Fields() {
  return (
    <div className="grid max-w-xl gap-4">
      <TextField label="Default" hint="A hint under the label." />
      <TextField label="Required" required defaultValue="Sample" />
      <TextField label="Disabled" disabled defaultValue="Locked" />
      <TextField label="With error" error="This field is required." defaultValue="" />
      <TextAreaField label="Text area" hint="Several lines." />
      <TextAreaField label="Text area with error" error="Too long." defaultValue="..." />
      <CheckboxField label="Checkbox" hint="With a hint." />
      <CheckboxField label="Checkbox disabled" disabled />
    </div>
  )
}

function Alerts() {
  return (
    <div className="grid max-w-xl gap-3">
      <Alert tone="info" title="Information" isStatic>
        A static notice, no live role.
      </Alert>
      <Alert tone="success" title="Saved">
        The change was saved.
      </Alert>
      <Alert tone="warning">Careful: this is not reviewed yet.</Alert>
      <Alert tone="error" title="Error">
        Something went wrong.
      </Alert>
      <ErrorSummary
        title="2 errors in the form"
        errors={[
          { fieldId: 'sample-email', message: 'Email is required' },
          { fieldId: 'sample-name', message: 'Name is required' },
        ]}
      />
      <TextField id="sample-email" label="Email" error="Email is required" />
      <TextField id="sample-name" label="Name" error="Name is required" />
    </div>
  )
}

function Dialogs() {
  const [dialog, setDialog] = useState<'plain' | 'confirm' | 'danger' | null>(null)
  const close = () => setDialog(null)
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setDialog('plain')}>
        Open dialog
      </Button>
      <Button variant="secondary" onClick={() => setDialog('confirm')}>
        Open confirmation
      </Button>
      <Button variant="danger" onClick={() => setDialog('danger')}>
        Open dangerous confirmation
      </Button>
      <Dialog
        open={dialog === 'plain'}
        onClose={close}
        title="Sample dialog"
        description="A form that keeps its input when you click outside."
        closeLabel="Close"
        footer={<Button onClick={close}>Done</Button>}
      >
        <TextField label="Your note" />
      </Dialog>
      <ConfirmDialog
        open={dialog === 'confirm'}
        title="Validate this contribution?"
        message="The review is final."
        confirmLabel="Validate"
        cancelLabel="Cancel"
        onConfirm={close}
        onCancel={close}
      />
      <ConfirmDialog
        open={dialog === 'danger'}
        title="Delete this contribution?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        error="The server refused the request."
        onConfirm={close}
        onCancel={close}
      />
    </div>
  )
}

/** Developer page: colour tokens and every `shared/ui` component in its variants and states. */
export function Catalogue() {
  return (
    <main className="mx-auto max-w-5xl bg-paper p-6 font-ui text-ink">
      <h1 className="mb-6 text-3xl font-semibold">Component catalogue</h1>
      <Section title="Colour tokens">
        <Colours />
      </Section>
      <Section title="Buttons">
        <Buttons />
      </Section>
      <Section title="Fields">
        <Fields />
      </Section>
      <Section title="Alerts and error summary">
        <Alerts />
      </Section>
      <Section title="Dialogs">
        <Dialogs />
      </Section>
    </main>
  )
}
