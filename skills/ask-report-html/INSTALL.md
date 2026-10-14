# Ask · Report · HTML — installation

Customized from [answer-me-with-html](https://github.com/QingYunA/answer-me-with-html). Explicit questions generate HTML answers; automatic invocation generates a report only when the task's actual changed-file count reaches the configured minimum (default 5) at final handoff. Ordinary conversation does not create automatic pages.

## Easiest setup

Node.js 22+:

```bash
git clone https://github.com/jerrywu001/ask-report-html.git
cd ask-report-html
npm ci --ignore-scripts
npm run configure
```

First enter the minimum changed-file count for automatic reports: a positive integer, default **5**. Enter keeps the existing value, or 5 on a fresh installation. If the old `answer-me-with-html` is detected in common global skill directories, review the listed paths and recommendation. Overlapping features and older trigger rules may cause duplicate reports or conflict with this skill's threshold. **Y** authorizes cleanup after successful installation; **N / Enter** keeps it by default. Escape cancels everything. Then choose agents with the arrow keys and Space, and press Enter to install. No flags or pre-filled agent list are needed. The prompt defaults to English; L switches language. Escape cancels without changes.

**After installation, run `/reload` in Pi, or restart your agent session so the skill and instructions take effect.** Other agents should restart their sessions; `/reload` is not universal.

Existing same-name skills are backed up and overwritten. Matching instruction sections are skipped; different sections are updated in place. Nothing outside the selected targets and explicitly approved listed legacy entries is changed.

An AI can clone the repository, install dependencies, and launch this same interactive command. The user selects and confirms; the AI must not preselect or pipe answers. If the AI cannot hand over a terminal, it should provide the one command to run after preparing the project. See the root README for the copyable prompt.

For a local bilingual visual interface, run `npm start`, then open the printed URL. English is the initial language and a Chinese switch is available. The page includes an editable numeric threshold; inspect it in the preview before confirming. The old-skill removal checkbox is unchecked by default. No browser opens automatically and no hooks are installed.

Legacy cleanup preserves backups, removes directories from discovery or unlinks only a link entry, and never deletes link targets or historical reports. A linked parent directory requires manual handling. Old global rules are not removed: review them manually if they refer to the old skill. Detection covers common global directories, not the entire disk, project skills, or plugins. `--yes` alone does not authorize cleanup; advanced use requires `--remove-legacy`. Keep the old skill if you still rely on its features.

## Copying only the skill folder

Place the entire `ask-report-html` directory under `~/.agents/skills/`. Do not copy only SKILL.md or nest the directory twice. Its standalone renderer supports Node.js 20+.

Pi, Codex, OpenCode, Grok Build, Kimi Code, and local Cursor support the shared directory by default. Claude Code needs its dedicated skills link; Antigravity CLI needs `~/.gemini/antigravity-cli/skills/ask-report-html`. Windows users should use the full installer for safe symlink/junction/copy fallback.

The default `auto-report.json` sets `minChangedFiles` to 5. Explicit invocation bypasses the minimum. Count only distinct files actually added, modified, or deleted by the task; exclude other people's changes and process artifacts. Use the full installer to customize the value and synchronize the instructions.

Use `references/agent-rule.md` for the global policy. The full installer compares and updates only its designated section, with backups. Cursor User Rules require the user's official-settings paste step; do not invent a global file or write its database.

## Try it

> Use ask-report-html to explain the OAuth request flow. Generate an HTML answer without opening the browser.

Explicit answers require no file changes and follow the question's language. New pages default to paper through `scripts/render.mjs`; explicit theme choices are respected. Answer pages and task reports stay under `~/.ask-report-html/` in task subdirectories.

Reopen the agent session after installation; Pi can also use `/reload`. Discovery depends on the version and directory settings. This is not a forced listener or a promise that every model always reports.
