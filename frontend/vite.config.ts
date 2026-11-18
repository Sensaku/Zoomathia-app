import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite+ configuration for Zoomathia: build, lint, format and test in one file.
// Tooling decisions and the upgrade procedure: docs/decisions/0001-frontend-tooling.md.
const ignored = [
  'dist/**',
  'packages/**', // vendored VENUS bundle, never edited
  'public/**',
  'playwright-report/**',
  'test-results/**',
  'blob-report/**',
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Forward API requests to the FastAPI backend (port 3001; the e2e stack sets API_PROXY_TARGET)
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  lint: {
    // tsc stays the only type checker (the project pins TypeScript 6.0).
    options: { typeAware: true, typeCheck: false },
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y'],
    // Every default correctness rule blocks new code; legacy files are downgraded by the overrides below.
    categories: { correctness: 'error' },
    ignorePatterns: ignored,
    rules: {
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'error',
      'eslint/no-unused-vars': 'error',
      'react/set-state-in-effect': 'error',
      'typescript/no-floating-promises': 'error',
      'typescript/no-redundant-type-constituents': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-ambiguous-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/autocomplete-valid': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/control-has-associated-label': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/lang': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/prefer-tag-over-role': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
    // Legacy debt: the rules above fail on these existing files today. Each file is listed
    // explicitly (no glob), so new files get the full rules; fix a file's findings when it is
    // next modified (docs/development-guidelines.md, "Adoption" step 3).
    overrides: [
      {
        files: [
          'src/components/AnnotationLegendModal.tsx',
          'src/components/ConceptCriteriaCard.tsx',
          'src/components/Navbar.tsx',
          'src/components/reading/ReadingParagraphCard.tsx',
          'src/pages/ExploreCorpus.tsx',
        ],
        rules: { 'eslint/no-unused-vars': 'warn' },
      },
      {
        files: [
          'src/components/MultiSelectCombobox.tsx',
          'src/components/reading/AnnotatedAncientText.tsx',
          'src/components/reading/ReadingParagraphCard.tsx',
          'src/pages/ExploreCorpus.tsx',
        ],
        rules: { 'jsx-a11y/click-events-have-key-events': 'warn' },
      },
      {
        files: ['src/pages/ExploreCorpus.tsx'],
        rules: { 'jsx-a11y/label-has-associated-control': 'warn' },
      },
      {
        files: ['src/components/MultiSelectCombobox.tsx'],
        rules: { 'jsx-a11y/no-autofocus': 'warn' },
      },
      {
        files: ['src/components/reading/AnnotatedAncientText.tsx', 'src/components/reading/ReadingParagraphCard.tsx'],
        rules: { 'jsx-a11y/no-noninteractive-element-interactions': 'warn' },
      },
      {
        files: ['src/components/reading/ReadingParagraphCard.tsx'],
        rules: { 'jsx-a11y/no-noninteractive-tabindex': 'warn' },
      },
      {
        files: [
          'src/components/MultiSelectCombobox.tsx',
          'src/components/reading/AnnotatedAncientText.tsx',
          'src/components/reading/ReadingParagraphCard.tsx',
          'src/pages/ExploreCorpus.tsx',
        ],
        rules: { 'jsx-a11y/no-static-element-interactions': 'warn' },
      },
      {
        files: ['src/components/reading/AnnotatedAncientText.tsx', 'src/pages/ExploreCorpus.tsx'],
        rules: { 'react/exhaustive-deps': 'warn' },
      },
      {
        files: ['src/components/Navbar.tsx', 'src/pages/CompetencyQuestions.tsx', 'src/pages/ExploreCorpus.tsx'],
        rules: { 'react/set-state-in-effect': 'warn' },
      },
      {
        files: [
          'src/components/common/SparqlHighlighter.tsx',
          'src/components/sparql/SparqlEditor.tsx',
          'src/components/visualization/VenusViewer.tsx',
          'src/pages/CompetencyQuestions.tsx',
        ],
        rules: { 'typescript/no-floating-promises': 'warn' },
      },
      {
        files: ['src/types/index.ts'],
        rules: { 'typescript/no-redundant-type-constituents': 'warn' },
      },
      {
        files: ['src/pages/ExploreCorpus.tsx'],
        rules: { 'unicorn/no-useless-fallback-in-spread': 'warn' },
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Tests import describe/it/expect from 'vite-plus/test' explicitly.
    globals: false,
    // client.ts reads VITE_API_URL; Node's fetch needs an absolute URL (MSW answers on it).
    env: { VITE_API_URL: 'http://api.test' },
  },
  fmt: {
    singleQuote: true,
    printWidth: 120,
    semi: false,
    sortTailwindcss: { stylesheet: './src/index.css' },
    ignorePatterns: [...ignored, 'package-lock.json'],
  },
})
