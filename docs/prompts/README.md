# Cloud build prompts

Run these from the repo folder, on `main`, after `git pull`. Each one starts a Claude Code cloud session.

    claude --cloud "Read docs/prompts/01-prep.md and carry it out exactly."
    claude --cloud "Read docs/prompts/02-plan.md and carry it out exactly."
    claude --cloud "Read docs/prompts/03-build.md and carry it out exactly."
    claude --cloud "Read docs/prompts/04-verify.md and carry it out exactly."

Between sessions:

- After session 1: merge pull request 9, then the `website-prep` pull request.
- After session 2: read the plan, answer its open questions in the pull request, then merge it.
- If session 3 stops before it finishes, run its command again. It continues from `docs/website_progress.md`.
- After session 4: read `docs/website_verification.md`, then review and merge the `website-v1` pull request.

The model is pinned to Claude Opus 5.5 by the `model` line in `.claude/settings.json`.
