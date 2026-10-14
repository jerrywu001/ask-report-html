# Agent paths and discovery

Checked on 2026-10-13. These are local-machine installations, not automatic distribution to Cloud Agents or SSH workers.

| Agent | Instructions and overrides | Skills | Sources |
|---|---|---|---|
| Pi | `PI_CODING_AGENT_DIR` or `~/.pi/agent`; reuse existing `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, or `CLAUDE.MD` in priority order | Native `~/.agents/skills` | [Configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md), [Skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) |
| Claude Code | `CLAUDE_CONFIG_DIR` or `~/.claude/CLAUDE.md` | Dedicated `~/.claude/skills`, with links supported | [Skills](https://code.claude.com/docs/en/skills), [Memory](https://code.claude.com/docs/en/memory) |
| Codex | `CODEX_HOME` or `~/.codex`; prefer existing override, otherwise `AGENTS.md` | Native `~/.agents/skills` | [AGENTS.md](https://developers.openai.com/codex/guides/agents-md/), [Skills](https://developers.openai.com/codex/skills/) |
| OpenCode | `OPENCODE_CONFIG_DIR`, then `XDG_CONFIG_HOME/opencode`, normally `~/.config/opencode/AGENTS.md` | Native shared directory; dedicated link if `OPENCODE_DISABLE_EXTERNAL_SKILLS` is true | [Rules](https://opencode.ai/docs/rules/), [Skills](https://opencode.ai/docs/skills/) |
| Grok Build | `GROK_HOME` or `~/.grok/AGENTS.md` instruction-file family | Native `~/.agents/skills` | [Skills](https://docs.x.ai/build/features/skills-plugins-marketplaces), [AGENTS.md](https://docs.x.ai/build/features/agents-md), bundled Project Rules guide |
| Antigravity CLI | `~/.gemini/GEMINI.md` or `AGENTS.md`; reuse existing config-level equivalents | Modern CLI global `~/.gemini/antigravity-cli/skills`, linked from the shared skill | [Rules](https://www.antigravity.google/docs/rules), [Skills](https://www.antigravity.google/docs/skills) |
| Kimi Code | `KIMI_CODE_HOME` or `~/.kimi-code/AGENTS.md` | Native `~/.agents/skills` | [Data locations](https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html) |
| Cursor | Official Settings → Rules → User Rules; no private database writes or invented global Markdown file | Native local `~/.agents/skills` | [Rules](https://cursor.com/docs/rules), [Skills](https://cursor.com/docs/skills) |

Antigravity IDE/app uses `~/.gemini/config/skills`; do not confuse this with the modern CLI directory. Older versions may use different documented paths. Instruction discovery does not guarantee that every model follows every rule.

Selected same-name skill entries are backed up and overwritten. Wrong links are replaced as entries without following or deleting their external targets. Windows uses Node/libuv symlink → junction → managed copy, without shell-based mklink. Copies and old directories are backed up before replacement; the previous entry is restored if publishing the replacement fails.

Global instructions are compared by the designated marker block or unmarked Markdown section. Matches are skipped; differences are updated in place. Line endings and outer blank lines do not cause unnecessary writes. Fenced examples and unrelated sections are preserved; malformed boundaries require review. Complete duplicate owned sections are consolidated instead of adding another copy.

The installed policy is fixed English regardless of installer UI language; generated answers follow the user's question language. Tool version, disabled discovery, project/team rules, and custom roots may affect behavior. Recheck documentation when agents change their layouts.
