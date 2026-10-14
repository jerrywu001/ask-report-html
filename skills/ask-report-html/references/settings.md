# Settings, clean-up and updates

Read this when SKILL.md section 0 sends you here.

The `am` command in this skill means `node <skill-directory>/scripts/render.mjs`. New HTML answer/report pages default to paper. The unchanged upstream config may show theme=auto; the wrapper treats that as its paper default. An explicit CLI/frontmatter theme or a non-auto configured theme overrides it. `am config reset theme` therefore restores the effective paper default, without changing the upstream renderer.

This is the task-report edition. For a manually copied directory or zip, update only with another reviewed task-report edition, after backing up the current directory. Do not treat a copied zip as a git clone or npm/plugin installation. Upstream updates can overwrite the narrowed trigger policy and report location; preserve these customizations unless the user explicitly asks to replace them.

## Automatic report threshold (installer setting)

`auto-report.json` beside SKILL.md stores `minChangedFiles`, a positive safe integer with default **5**. This is not an `am config` renderer setting. It gates only automatic task reports; explicit skill/HTML requests are not limited.

To change it, run `npm run configure` from the installer repository, enter a number, select the agents whose rule sections should be synchronized, and confirm. The prompt shows both the default and the existing value; Enter keeps the existing value (5 on a fresh install). The local page from `npm start` offers the same editable numeric field. Advanced CLI use: `npm run configure -- --agents pi,codex --min-changed-files 7 --yes`.

The installer saves the value into the shared skill, updates selected agents' instructions, and preserves it on later installations unless you enter a new value. Shared-skill consumers read this installed value even if an older rule still displays another number. Managed copies must be reinstalled to synchronize their settings. A missing or invalid policy falls back to 5.

After installation or a threshold update, remind the user to run `/reload` in Pi, or restart the agent session. Other agents should restart their sessions; do not assume `/reload` exists everywhere. Checking the setup page again does not reload an agent. This settings turn generates no HTML page.

If the user requests `config minChangedFiles <number>` or asks naturally to change the automatic threshold, use the installer workflow above, not `am config set`. Locate the user's installer clone or give them the command to run there; do not invent a clone path or silently edit unrelated global instructions.

## Renderer settings

When the arguments for this call (shown in section 0 of SKILL.md) start with `config` (for example `/ask-report-html config open off`), this turn handles settings only and produces no page:

- `config`: run `am config` to show the current settings, then let the user choose. Where the agent has a choice tool such as AskUserQuestion, use it: at most 4 settings at a time, these first: `open`, `theme`, `mode`, `style`, with the current value marked in the options. Otherwise ask in plain text.
- `config <key> <value>`: run `am config set <key> <value>`.
- `config reset [key]`: run `am config reset [key]`.

When the user asks in natural language ("stop opening the browser", "use the card theme by default"), also convert it to `am config set`. Settings: `open` (auto-open the browser), `theme`, `mode`, `style`, `voice` (video narration), `update_check` (new-version notices). Run `am config` to see all descriptions.

When the arguments start with `clean`, or the user asks to clean up pages / the cache: first run `am clean --dry-run` and tell the user how many items and how much space will be deleted. Run `am clean` only after the user agrees (add `--all` to delete all pages and videos, `--days N` to change how many days to keep).

When the arguments start with `update`, or the user asks to update this skill: update according to how it was installed. Installed with `npx skills`: run `npx skills update ask-report-html -y`. Installed as a Claude Code plugin: run `claude plugin update ask-report-html@ask-report-html` (or ask the user to click Update now in `/plugin` → Installed), then ask the user to run `/reload-plugins`. Installed with git clone: run `git pull && npm install` in the repository directory. Installed as a DSH plugin: run `dsh plugin --profile <name> up <package>`, with the profile and package names read out of the copy's own path (`~/.dsh/profiles/<name>/node_modules/<package>/…`); when the CLI prints an `! Update hint` or the page shows a new-version button, the exact command is already filled in — use it as printed.
