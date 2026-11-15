# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Shared permissions live in `.claude/settings.json`; personal overrides go in `.claude/settings.local.json` (git-ignored).
- Before implementing a business rule, read the matching section of `docs/regles-metier.md`. When a rule is missing or ambiguous, ask the user instead of guessing.
