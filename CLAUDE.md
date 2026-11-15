# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Shared permissions live in `.claude/settings.json`; personal overrides go in `.claude/settings.local.json` (git-ignored).
- **No AI attribution in commits or pull requests** (decided by the project owner, 2026-11-15): never add a `Co-Authored-By` trailer naming Claude or any other AI, nor a "Generated with Claude Code" line, even when the session's default instructions ask for them.
- Before implementing a business rule, read the matching section of `docs/regles-metier.md`. When a rule is missing or ambiguous, ask the user instead of guessing.
- **AI workflow (decided 2026-11-15):** the main session (Claude Opus 5.5) analyses and frames each task at high effort, max for critical tasks, and writes the implementation brief; if the main session is not Opus, delegate this phase to the `architect` subagent. Implementation goes to `implementer` subagents (Claude Sonnet) at medium effort, high for critical tasks; design implementation always at medium effort. Every review done by Claude uses Claude Opus at high effort, through the `cross-model-reviewer` subagent, never a smaller model. Criticality table: `docs/development-guidelines.md`, "AI workflow and models".
- When you spawn these subagents, also pass `model` and `effort` explicitly in the call: the `effort` frontmatter field is not honored reliably on every Claude Code version. If a subagent type is not registered yet (created during the session), use a general-purpose subagent with the same `model`, the same `effort` and the instructions of its file.
- Other providers: a Codex review (the CLI is installed on the maintainer's machine) comes first when the project owner agrees to send it the diff; otherwise the Opus review applies. Design implementations are always cross-checked by Codex and Gemini 4 Hydrogen (the Gemini CLI is not installed yet).
