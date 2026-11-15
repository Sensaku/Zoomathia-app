# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Shared permissions live in `.claude/settings.json`; personal overrides go in `.claude/settings.local.json` (git-ignored).
- Before implementing a business rule, read the matching section of `docs/regles-metier.md`. When a rule is missing or ambiguous, ask the user instead of guessing.
- Cross-model review: prefer a reviewer from another provider. If none is available, spawn the `cross-model-reviewer` subagent (`.claude/agents/cross-model-reviewer.md`) with a `model` different from your own.
