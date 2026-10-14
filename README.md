# Ask · Report · HTML

> Adapted from [answer-me-with-html](https://github.com/QingYunA/answer-me-with-html). The original HTML renderer, attribution, and licenses are preserved.

[English](README.md) · [简体中文](README.zh-CN.md)

Ask · Report · HTML installs one skill for eight coding agents. You can ask for an HTML explanation, or have the agent report a task's changes when it finishes. Automatic reports require at least 5 actual changed files by default; you can change that minimum.

<img src="https://raw.githubusercontent.com/jerrywu001/ask-report-html/main/docs/images/interface-dark.png" alt="Local agent setup interface, English dark theme" width="760">

[Quick start](#quick-start) · [Usage](#usage) · [Report threshold](#configure-the-report-threshold) · [Agents](#supported-agents) · [Safety](#installation-and-safety) · [Development](#development)

## Quick start

The installer requires Node.js 22+. The bundled standalone renderer supports Node.js 20+.

```bash
npx askreport
# Chinese terminal prompts
npx askreport --lang=zh_CN
# Also supported
npx askreport -- --lang=zh_CN
```

These commands require the first npm release to be published. The source-checkout route below works before that release. `askreport` is the npm package and terminal command; the installed skill remains `ask-report-html`.

Both `--lang=value` and `--lang value` work. The default is English; L switches languages during interactive setup. No browser opens automatically, and agent files change only after you confirm installation. npm may first ask permission to download the package; that is not installation consent for any agent.

For help, run `npx askreport -h`, or `npx askreport --lang=zh_CN -h` for Chinese. Run `npx askreport --version` to check the version. Use `npx askreport@latest` to request the latest installer; this does not reload existing agent sessions.

### Run from a source checkout

```bash
git clone https://github.com/jerrywu001/ask-report-html.git
cd ask-report-html
npm ci --ignore-scripts
npm run configure -- --lang=zh_CN
```

`configure` remains an optional CLI subcommand: `npx askreport configure --lang=zh_CN`. `npx` needs no extra `--` after the package name, but accepts it for compatibility. In contrast, `npm run configure -- -h` needs the separator to forward flags to the script; `npm run configure -h` shows npm's own help.

1. Enter a positive integer for the automatic report minimum. Enter keeps the displayed value, which is 5 on a fresh installation.
2. If the installer finds `answer-me-with-html`, review the listed paths. It recommends removal because overlapping features and older trigger rules may cause duplicate reports or conflict with the new minimum. Y authorizes cleanup after installation succeeds. N or Enter keeps it; Esc cancels the whole operation.
3. Select agents with ↑/↓ and Space, then press Enter to install. No agents are preselected. Esc cancels; L switches between English and Chinese.
4. Run `/reload` in Pi, or restart its session. Restart the session in other agents, which may not support `/reload`. Installation and settings changes do not reload an existing session automatically.

For Cursor, append the supplied policy in Settings → Rules → User Rules. This step is manual; the installer does not write Cursor's private database.

### Use the local setup page instead

```bash
npx askreport web
# From a source checkout: npm start
# Optional port: npx askreport web --port 7331
```

Open the printed URL, usually `http://127.0.0.1:7331`. Set the minimum, review any old-skill notice, and select agents. Check the preview before confirming installation.

The removal checkbox starts unchecked. Selecting agents alone does not authorize cleanup. The page supports English and Chinese, with light and dark themes. Starting the server or editing the form leaves installed files unchanged until you confirm. The server does not open a browser for you.

<details>
<summary>Let an AI prepare the installation</summary>

Use this prompt if you want an AI to prepare the project. You choose the minimum and agents yourself:

```text
Please set up https://github.com/jerrywu001/ask-report-html for me.

Check that Node.js is at least version 22. Clone into a safe new folder, or check
and reuse my existing clone. Do not overwrite unrelated files. Read the README
and run npm ci --ignore-scripts.

Run npm run configure in an interactive terminal I can use. I will enter the
numeric report threshold. I will select the agents myself and press Enter to install.
If the old answer-me-with-html skill is detected, I will decide Y to remove or N
to keep it. Do not preselect agents, pass --agents/--yes/--remove-legacy, pipe answers,
or answer for me.

Keep unrelated preferences, authentication, permissions, and projects unchanged.
Do not install hooks. If you cannot hand me an interactive terminal, prepare the
project and give me the single cd-and-npm-run-configure command to run myself.

After installation, remind me to run /reload in Pi or restart the agent session.
Explain any remaining manual step: Cursor User Rules must be pasted into official
settings. Do not write its database or claim that step completed automatically.
```

</details>

## Usage

| Mode | When it runs | Output |
|---|---|---|
| Ask (explicit) | You invoke the skill or ask for HTML | An explanation, even without file changes |
| Report (automatic) | An execution task reaches final handoff and meets the changed-file minimum | The task's changes, checks, and unfinished work |

### Ask for an HTML answer

```text
Claude Code: /ask-report-html Explain the OAuth request flow
Codex:       $ask-report-html Compare React and Vue
Pi:          /skill:ask-report-html Explain cache invalidation
```

You can also say "Use ask-report-html to explain database transactions." The answer follows your question's language and uses explanations, diagrams, or comparisons instead of a task-change template. Explicit requests have no file-count requirement.

### Automatic task reports

The agent checks whether a report is needed at final handoff. With the default minimum, tasks with `1–4` eligible changed files get a text handoff. Tasks with 5 or more can get a report if the other conditions are met. Individual edits and model turns do not trigger reports.

Questions, plans, read-only investigation, progress updates, and waiting for confirmation do not trigger automatic pages. Plain-text requests and skill settings, cleanup, or updates also skip pages. Reports distinguish completed, partial, failed, and unrun work. Failed or unrun checks are never marked as passes.

Pages default to the paper theme and respect explicit theme choices. They stay closed unless you ask to open them. Each task or question has one page that is updated in place; optional drafts sit beside it:

```text
~/.ask-report-html/task_answer-topic/answer.html
~/.ask-report-html/task_project-task/report.html
```

The generated header and GitHub links identify ask-report-html. Renderer data also defaults to `~/.ask-report-html/`; `AM_HOME` remains an explicit override. Existing reports under the older directory are not moved or deleted.

Automatic reporting relies on the agent following these instructions. There is no forced end-of-turn listener, and behavior can vary by model or session.

## Configure the report threshold

The default minimum is 5. Enter any positive integer: `1` lets single-file tasks qualify, while a higher number reduces automatic reports.

Run `npx askreport` to enter a value, select agents, and confirm. Enter keeps the installed value, or 5 on a fresh installation. For the setup page, run `npx askreport web` and edit Minimum changed files. From a clone, `npm run configure` and `npm start` still work. The preview and confirmation show your choice.

The installer stores `minChangedFiles` in `~/.agents/skills/ask-report-html/auto-report.json` and updates the selected agents' rule sections. Missing or invalid settings fall back to 5. The renderer's `am config` settings do not control this minimum.

Count each distinct file actually added, modified, or deleted by the task once. Fields, lines, tool calls, and the whole dirty worktree are not the counting unit. Exclude pre-existing or concurrent edits, fully reverted changes, plans, logs, caches, screenshots, reports, and purely generated artifacts. Files with uncertain ownership do not count. Do not add changes to reach the minimum.

Agents reading the shared skill use the same setting. Unselected rule files stay unchanged; the installed value takes precedence over an older number in those rules. Managed copies need reinstallation to synchronize. After changing the setting, reload or restart the agent session.

<details>
<summary>Advanced CLI options</summary>

```bash
# Read-only preview with a custom numeric threshold
npx askreport --agents claude,codex,pi --min-changed-files 7 --dry-run

# Install after explicit confirmation
npx askreport --agents claude,codex,pi --min-changed-files 7 --yes --json
```

Cleanup needs separate consent. Use `--remove-legacy` to request removal after installation succeeds, or `--keep-legacy` to keep the old skill. `--yes` alone does not authorize removal. Review the cleanup with `--remove-legacy --dry-run` before using `--remove-legacy --yes`.

Omitting `--min-changed-files` preserves the installed value, or uses 5 if there is none. Agent IDs: `pi`, `claude`, `codex`, `opencode`, `grok`, `antigravity`, `kimi`, `cursor`.

Use `--lang=zh_CN` (or `--lang zh_CN`) for Chinese terminal output and `--lang=en_US` for English. The short forms `zh` / `en` and hyphenated forms `zh-CN` / `en-US` also work. This option sets the initial language for the current command only. For isolated tests, use `--home /path/to/test-home`; this ignores agent-directory environment overrides. Do not use these flags to answer the user-facing prompt without the user's consent.

</details>

## Supported agents

| Agent | Default global instructions | Skill discovery / extra handling |
|---|---|---|
| Pi | `~/.pi/agent/AGENTS.md` | Shared directory; reuse existing override |
| Claude Code | `~/.claude/CLAUDE.md` | Dedicated skills directory link |
| Codex | `~/.codex/AGENTS.md` | Shared directory; reuse existing override |
| OpenCode | `~/.config/opencode/AGENTS.md` | Shared directory; dedicated link if external skills are disabled |
| Grok Build | `~/.grok/AGENTS.md` | Shared directory; respect `GROK_HOME` |
| Antigravity CLI | `~/.gemini/GEMINI.md` | Link `~/.gemini/antigravity-cli/skills/ask-report-html` |
| Kimi Code | `~/.kimi-code/AGENTS.md` | Shared directory; respect `KIMI_CODE_HOME` |
| Cursor | Official Settings → Rules → User Rules | Shared skill; manual User Rules paste |

The shared skill lives at `~/.agents/skills/ask-report-html/`. [agent-support.md](https://github.com/jerrywu001/ask-report-html/blob/main/docs/agent-support.md) lists official sources and environment overrides. [INSTALL.md](https://github.com/jerrywu001/ask-report-html/blob/main/skills/ask-report-html/INSTALL.md) covers portable-folder installation. Agent versions, disabled directories, and project or team rules can affect discovery and behavior.

## Installation and safety

- Existing same-name skills are backed up before replacement. Backups are stored in `~/.ask-report-html/backups/`.
- Matching global rule sections are left alone. Different sections are updated in place; missing sections are added once. Unrelated content stays unchanged, and rule files are backed up only when updated.
- On Windows, directory links try symlink, then Node/libuv junction, then managed copy. Replacing a link changes its entry without deleting the external target. Managed copies refresh on installation.
- A failed replacement restores the original entry. External changes after preview abort installation. Malformed rule boundaries stop the update for review.
- The server binds to `127.0.0.1` and checks Host, Origin, and a random session token. It has no arbitrary-path write endpoint and does not upload configuration.
- Old-skill detection checks the shared directory and common global agent skills directories, respecting environment overrides. It does not search the whole disk, project skills, or plugins. Every detected entry is listed. Cleanup can affect unselected agents using those entries; linked parent directories need manual handling.
- Removal requires Y, the checkbox, or `--remove-legacy`. After installation succeeds, directories are backed up and moved out of skill discovery. For symbolic links, the installer saves a descriptor and unlinks the entry. External changes invalidate the preview; cleanup failures preserve the old entry and are reported. Backups stay in `~/.ask-report-html/backups/`.
- Cleanup leaves historical reports under `~/.answer-me-with-html/` and old global instruction sections untouched. Check old rules manually if they refer to a removed skill. Keep the old skill if you still need its features.
- Only selected agent targets, the shared skill, and approved listed legacy entries are processed. The installer does not add hooks or change authentication, permissions, or business projects.

## Development

```bash
npm run build  # Rebuild the verified skill ZIP after editing skill sources
npm test
npm run check # Syntax, archive/source parity, version consistency and public-content checks
npm run test:package # Pack, install and run actual npx in an isolated home/cache
```

`bin/` contains the entry point. `src/` holds the installer, policy, paths, and prompts; `web/` holds the bilingual setup page. The skill and paper-default wrapper are in `skills/`, the verified ZIP and manifest in `assets/`, and automated checks in `tests/`.

GitHub Actions runs Node 22 checks, tests and packed-package smoke checks on Linux, macOS, and Windows. Unix-specific tests may be skipped on Windows. Filesystem tests do not cover live behavior in every agent and model session. `npm run test:package -- --keep` retains its isolated fixture for debugging; the default removes it. Temporary files stay under `.agent-work/npm-cli/`.

## npm releases

Pushing a `v*` tag triggers `.github/workflows/publish.yml`. It checks the tag against `package.json`, the lockfile and skill manifest, requires the commit to be on the default branch, and waits for the cross-platform checks before publishing. Stable versions use `latest`; prereleases use `next`. Tags alone do not update the package version.

Publishing uses npm Trusted Publishing (OIDC), not a stored npm token. The first package release needs a one-time authenticated publish, followed by a Trusted Publisher binding for `jerrywu001/ask-report-html` and `publish.yml`. Allow direct `npm publish`, and complete the first OIDC publish within 2 days of creating the binding. The publish job uses Node 24 and npm 11; users still need Node 22+.

See [npm-release.md](https://github.com/jerrywu001/ask-report-html/blob/main/docs/npm-release.md) for first-publish setup, versioning and release checks. This workflow does not publish on ordinary branch pushes or pull requests. npm delivery adds no hooks or forced report listener.

## Credits and license

The HTML renderer and original explainer components come from [QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html). Its generated bundle, copyright, and license are preserved. This project adds the two usage modes, a configurable report minimum, and a local multi-agent installer. [MIT](LICENSE); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
