import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

export const SKILL_NAME = 'ask-report-html';
export const SOURCES = {
  pi: 'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md',
  claude: 'https://code.claude.com/docs/en/skills',
  codex: 'https://developers.openai.com/codex/skills/',
  opencode: 'https://opencode.ai/docs/skills/',
  grok: 'https://docs.x.ai/build/features/skills-plugins-marketplaces',
  antigravity: 'https://www.antigravity.google/docs/skills',
  kimi: 'https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html',
  cursor: 'https://cursor.com/docs/skills',
};
const flag = value => /^(1|true|yes|on)$/i.test(value || '');
const dir = (value, fallback, home) => value ? path.resolve(home, value) : fallback;

export async function catalog({ home = os.homedir(), env = process.env } = {}) {
  home = path.resolve(home);
  const pi = dir(env.PI_CODING_AGENT_DIR, path.join(home, '.pi/agent'), home);
  const claude = dir(env.CLAUDE_CONFIG_DIR, path.join(home, '.claude'), home);
  const codex = dir(env.CODEX_HOME, path.join(home, '.codex'), home);
  const xdg = dir(env.XDG_CONFIG_HOME, path.join(home, '.config'), home);
  const open = dir(env.OPENCODE_CONFIG_DIR, path.join(xdg, 'opencode'), home);
  const grok = dir(env.GROK_HOME, path.join(home, '.grok'), home);
  const kimi = dir(env.KIMI_CODE_HOME, path.join(home, '.kimi-code'), home);
  const gemini = path.join(home, '.gemini');
  const rows = [
    ['pi', 'Pi', 'P', pi, ['AGENTS.override.md','AGENTS.md','AGENTS.MD','CLAUDE.md','CLAUDE.MD'], []],
    ['claude', 'Claude Code', 'CC', claude, ['CLAUDE.md'], [path.join(claude,'skills',SKILL_NAME)]],
    ['codex', 'Codex', 'CX', codex, ['AGENTS.override.md','AGENTS.md'], []],
    ['opencode', 'OpenCode', 'OC', open, ['AGENTS.md'], flag(env.OPENCODE_DISABLE_EXTERNAL_SKILLS) ? [path.join(open,'skills',SKILL_NAME)] : []],
    ['grok', 'Grok Build', 'GB', grok, ['AGENTS.md','Agents.md','AGENT.md'], []],
    ['antigravity', 'Antigravity CLI', 'A', gemini, ['GEMINI.md','AGENTS.md','config/GEMINI.md','config/AGENTS.md'], [path.join(gemini,'antigravity-cli/skills',SKILL_NAME)]],
    ['kimi', 'Kimi Code', 'K', kimi, ['AGENTS.md'], []],
    ['cursor', 'Cursor', 'C', null, [], []],
  ];
  const agents = [];
  for (const [id,name,short,root,names,links] of rows) {
    let rulesPath = null;
    if (root) {
      rulesPath = path.join(root, names.includes('AGENTS.md') ? 'AGENTS.md' : names[0]);
      if (id === 'antigravity') rulesPath = path.join(root, 'GEMINI.md');
      for (const name of names) {
        try { await fs.lstat(path.join(root,name)); rulesPath = path.join(root,name); break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    agents.push({
      id, name, short, rulesPath, links, sharedSkills: links.length === 0,
      manualRules: id === 'cursor', source: SOURCES[id],
      note: id === 'cursor' ? 'User Rules 在 Cursor 设置中管理；安装 skill 后复制规范并粘贴。不会写非公开数据库。'
        : id === 'antigravity' ? '现代 CLI 使用 antigravity-cli/skills；不把 IDE 的 config/skills 当作 CLI 路径。'
        : id === 'opencode' && links.length ? '检测到关闭外部 skills，改为链接到 OpenCode 自有目录。'
        : id === 'pi' || id === 'codex' ? '优先使用已存在的 override 指令文件，避免追加到不生效的文件。'
        : '按已核实的默认发现规则安装；若工具禁用了该目录，请检查其设置。',
      refresh: id === 'pi' ? '在 Pi 执行 /reload，或重开会话。' : '安装后重新打开 agent 会话；已有项目规则仍可能覆盖用户规范。',
    });
  }
  // Detection only: common global legacy entries, including older dedicated
  // directories. Never walk arbitrary home/project/plugin directories.
  const legacyPaths=[path.join(home,'.agents/skills/answer-me-with-html'),
    ...rows.filter(row=>row[3]).map(row=>path.join(row[3],'skills/answer-me-with-html')),
    path.join(gemini,'antigravity-cli/skills/answer-me-with-html'),
    path.join(home,'.cursor/skills/answer-me-with-html')];
  return { home, canonical: path.join(home,'.agents/skills',SKILL_NAME), agents,
    legacyPaths:[...new Set(legacyPaths.map(file=>path.resolve(file)))] };
}
