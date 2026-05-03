# gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

## Available skills

/browse, /connect-chrome, /setup-browser-cookies, /qa, /qa-only, /design-review, /review, /ship, /land-and-deploy, /canary, /benchmark, /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /plan-devex-review, /devex-review, /design-consultation, /design-shotgun, /design-html, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn

## Skill routing

**Default: superpowers.** For implementation tasks (debugging, TDD, code review,
brainstorming, executing plans, etc.), use superpowers skills as directed by their rules.

**gstack: name-explicit only.** gstack skills are NOT registered as slash commands.
Invoke a gstack skill ONLY when the user explicitly says its name in natural language
(e.g., "用 plan-ceo-review 评审方案"). Never auto-invoke a gstack skill based on the
semantic content of the user's request — the user must name the skill.

Available gstack skills (invoke by name, not `/` prefix):
office-hours, plan-ceo-review, plan-eng-review, plan-design-review,
plan-devex-review, autoplan, investigate, qa, qa-only, review (gstack),
design-review, devex-review, design-consultation, ship, land-and-deploy,
canary, cso, context-save, context-restore, browse, retro, learn
