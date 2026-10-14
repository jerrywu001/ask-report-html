## Ask · Report · HTML

[ask-report-html dual-mode]
- When the user explicitly invokes `ask-report-html` with a question, produce a visual HTML answer even without code changes: explanations, comparisons, relationships, or flows. Do not force it into a task-change report.
- Without explicit invocation, automatically use `ask-report-html` only at the final handoff of an execution task that meets the changed-file minimum below. Do not report every small edit.
- Automatic report minimum: **5 changed files** (`minChangedFiles`). Read the installed skill's `auto-report.json` for the current minimum; missing or invalid settings fall back to 5. This shared setting takes precedence over an older numeric value copied into an agent rule.
- Count only distinct files actually added, modified, or deleted by this task. Count each file once, not fields, lines, tool calls, or commits. Exclude pre-existing/concurrent changes, plans, logs, caches, screenshots, reports, and purely generated artifacts. Do not pad the count or use the whole dirty worktree; uncertain ownership does not count. Below the minimum, answer in text. Explicit skill/HTML requests bypass the minimum.
- Ordinary questions, planning, read-only investigation, progress, and requests for confirmation do not trigger automatic pages. Process files, logs, caches, or reports alone are not actual task changes.
- Report completed, partial, failed, and unrun work honestly. Do not attribute other people's or concurrent changes to this task.
- HTML answers and task reports default to the paper theme. Respect explicit theme requests and use this skill's `scripts/render.mjs` entry instead of bypassing its defaults.
- Save pages under `~/.ask-report-html/<task_xxx>/<page-name>.html`, with drafts beside them. Maintain one page per task or question and use `--no-open`; include the link in the final reply. Follow the user's language for the answer.
- Skip pages when the user requests plain text or opts out. Skill settings, cleanup, and update operations also produce no page.
- Do not install hooks or stage, commit, push, or deploy merely to generate a page. Automatic reporting is an instruction-following workflow, not a guaranteed end-of-turn event.
