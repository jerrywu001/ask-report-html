# Ask · Report · HTML

> 基于 [answer-me-with-html](https://github.com/QingYunA/answer-me-with-html) 修改，保留原始 HTML 渲染器、来源声明与许可。

[English](README.md) · [简体中文](README.zh-CN.md)

Ask · Report · HTML 为 8 种 coding agents 安装同一份 skill。你可以主动要求 HTML 解释，也可以让 agent 在任务结束时汇报改动。自动报告默认要求本任务至少实际改动 5 个文件，这个数值可以调整。

<img src="https://raw.githubusercontent.com/jerrywu001/ask-report-html/main/docs/images/interface-dark-zh.png" alt="本地 agent 配置页，中文深色界面" width="760">

[快速开始](#快速开始) · [使用方式](#使用方式) · [配置报告门槛](#配置报告门槛) · [支持的 agents](#支持的-agents) · [安装与安全](#安装与安全) · [开发](#开发)

## 快速开始

安装工具需要 Node.js 22+；随 skill 附带的独立渲染器最低支持 Node.js 20。

```bash
npx askreport
# 中文终端提示
npx askreport --lang=zh_CN
# 也兼容你习惯的参数分隔写法
npx askreport -- --lang=zh_CN
```

上述命令需要 npm 首版已发布；首发前可使用下方的源码安装方式。npm 包和终端命令名为 `askreport`，已安装的 skill 仍叫 `ask-report-html`，不会迁移现有配置目录。

`--lang=值` 和 `--lang 值` 两种写法都支持。不传语言参数默认英文，交互过程中可按 L 切换。不会自动打开浏览器，确认安装后才修改 agent 文件。npm 首次运行可能先询问是否下载包；同意下载不等于授权配置 agent。

查看帮助、版本和使用最新版：

```bash
npx askreport --lang=zh_CN -h
npx askreport --version
npx askreport@latest --lang=zh_CN
```

英文帮助使用 `npx askreport -h`，也支持 `--help`。请求最新版安装器不会自动重载已有 agent 会话。

### 从源码运行

```bash
git clone https://github.com/jerrywu001/ask-report-html.git
cd ask-report-html
npm ci --ignore-scripts
npm run configure -- --lang=zh_CN
```

保留可选 `configure` 子命令：`npx askreport configure --lang=zh_CN`。npx 包名后不需要额外的 `--`，但兼容该写法；`npm run configure -- -h` 则需要它转发参数。直接运行 `npm run configure -h` 时会显示 npm 自身的帮助。

1. 输入自动报告的最少文件数，必须是正整数。回车保留提示中的现有值，首次安装为 5。
2. 如果检测到 `answer-me-with-html`，先检查列出的路径。工具会建议删除，因为功能重叠和旧触发规则可能导致重复报告，或与新门槛冲突。Y 授权安装成功后清理，N 或回车保留；Esc 取消整个操作。
3. 用 ↑/↓ 移动、空格勾选 agents，再按回车安装。默认不选任何 agent；Esc 取消，L 切换中英文。
4. 在 Pi 中执行 `/reload`，或重启会话。其他 agent 请重启会话，它们可能不支持 `/reload`。安装或修改配置不会自动重载已有会话。

Cursor 还需手动将提供的规范追加到 Settings → Rules → User Rules。工具不会写入 Cursor 非公开数据库。

### 也可以用本地配置页面

```bash
npx askreport web
# 源码仓库中仍可使用 npm start
# 指定端口：npx askreport web --port 7331
```

打开终端显示的地址，通常为 `http://127.0.0.1:7331`。输入文件数、检查旧 skill 提示并选择 agents，查看预览后再确认安装。

删除选项默认不勾选，选择 agents 本身不代表授权清理。页面支持中英文和深浅色。启动服务或修改表单不会改变已安装文件，确认后才写入；服务不会自动打开浏览器。

<details>
<summary>让 AI 准备安装环境</summary>

需要 AI 准备项目时，可以使用下面的提示词。文件数和 agents 由你亲自选择：

```text
请帮我安装 https://github.com/jerrywu001/ask-report-html。

检查 Node.js >= 22。克隆到安全的新目录，或检查后复用已有克隆，不覆盖无关文件。
阅读 README，执行 npm ci --ignore-scripts。

在我能操作的交互式终端中运行 npm run configure -- --lang=zh_CN，使用中文安装提示。
我会亲自输入报告文件数门槛、选择 agents，并按回车确认安装。
若检测到旧 answer-me-with-html，我会亲自决定 Y 删除或 N 保留。
不要预选、代填 --agents/--yes/--remove-legacy、通过管道代答或替我选择。

保留其他偏好、账号、认证、权限与项目，不安装 hooks。
如果无法把交互式终端交给我，就准备好项目，给出一条 cd 到项目并运行
npm run configure -- --lang=zh_CN 的命令，让我自行操作。

安装后提醒我：在 Pi 执行 /reload，或重启 agent 会话。
说明剩余手工步骤：Cursor User Rules 需要在官方设置中粘贴。
不要写 Cursor 数据库，也不要说这一步已自动完成。
```

</details>

## 使用方式

| 模式 | 触发时机 | 输出 |
|---|---|---|
| Ask（主动调用） | 明确调用 skill，或主动要求 HTML | HTML 解释，无需文件改动 |
| Report（自动调用） | 执行任务准备最终交付，且有效改动文件数达到门槛 | 本任务改动、验证结果和未完成事项 |

### 主动要求 HTML 回答

```text
Claude Code: /ask-report-html 解释 OAuth 请求流程
Codex:       $ask-report-html 比较 React 和 Vue
Pi:          /skill:ask-report-html 讲讲缓存失效
```

也可直接说“用 ask-report-html 解释数据库事务”。回答跟随提问语言，用原理、流程或比较解释问题，而不套用任务改动模板。主动调用没有文件数要求。

### 自动任务报告

agent 在最终交付时判断是否需要报告。默认门槛下，改动 `1–4` 个有效文件时用文字交付；改动 5 个或更多文件，且满足其他条件时才生成报告。单次修改或模型回合结束不会触发报告。

普通问答、规划、只读调查、进度和等待确认都不会自动生成页面。明确要求纯文本，或维护 skill 设置、清理、更新时也不生成。报告会区分完成、部分完成、失败和未运行，失败或未运行的检查不能写成通过。

页面默认使用纸张主题，遵从显式主题要求，只有要求打开时才打开浏览器。同一问题或任务只维护一份页面，草稿可放在旁边：

```text
~/.ask-report-html/task_answer-topic/answer.html
~/.ask-report-html/task_project-task/report.html
```

生成页面的页头名称和 GitHub 链接均使用 ask-report-html。渲染器数据也默认保存在 `~/.ask-report-html/`；仍可用 `AM_HOME` 显式覆盖。旧目录中的已有报告不会自动迁移或删除。

自动汇报依赖 agent 遵循指令，没有强制的回合结束监听器。不同模型与会话的执行情况可能有差异。

## 配置报告门槛

默认门槛是 5，可输入任意正整数。设为 `1`，单文件任务也能满足数量条件；调大则减少自动报告。

在终端运行 `npx askreport --lang=zh_CN`，输入数值、选择 agents，再确认。回车保留已安装值，首次安装使用 5。页面配置使用 `npx askreport web`，修改“最少改动文件数”。源码仓库中仍可使用 `npm run configure` 和 `npm start`。预览和确认步骤会显示你的选择。

工具将 `minChangedFiles` 保存到 `~/.agents/skills/ask-report-html/auto-report.json`，并同步选中 agents 的规范段。配置缺失或非法时回退到 5。渲染器的 `am config` 不管理这个门槛。

只统计本任务实际新增、修改、删除的不同文件，每个文件算一次。字段、行数、工具调用次数和整个脏工作区都不是计数单位。排除既有或并发改动、完全撤销的改动、计划、日志、缓存、截图、报告和纯生成产物。归属不确定的文件不计入，也不能为凑数添加修改。

读取共享 skill 的 agents 共用此设置。未选中的规范文件保持原样，skill 内的新值优先于旧规范中的数值。受管副本需重新安装才能同步；修改设置后仍需 `/reload` 或重启会话。

<details>
<summary>高级 CLI 参数</summary>

```bash
# 只读预览，自定义数值门槛
npx askreport --agents claude,codex,pi --min-changed-files 7 --dry-run

# 明确确认后安装
npx askreport --agents claude,codex,pi --min-changed-files 7 --yes --json
```

清理旧 skill 需要单独授权。`--remove-legacy` 表示安装成功后删除，`--keep-legacy` 表示保留。`--yes` 本身不授权删除。先用 `--remove-legacy --dry-run` 检查范围，确定要清理后再用 `--remove-legacy --yes`。

不传 `--min-changed-files` 时保留已安装值，没有配置则使用 5。Agent IDs：`pi`、`claude`、`codex`、`opencode`、`grok`、`antigravity`、`kimi`、`cursor`。

`--lang=zh_CN`（或 `--lang zh_CN`）使用终端中文，`--lang=en_US` 使用英文；也兼容简写 `zh` / `en` 和连字符形式 `zh-CN` / `en-US`。参数只设置本次命令的初始语言。隔离测试使用 `--home /path/to/test-home`，这会忽略 agent 路径的环境覆盖。不能用这些参数未经用户同意就替用户回答安装提问。

</details>

## 支持的 agents

| Agent | 默认全局规范 | Skill 发现与额外处理 |
|---|---|---|
| Pi | `~/.pi/agent/AGENTS.md` | 共享目录，优先既有 override |
| Claude Code | `~/.claude/CLAUDE.md` | 专属 skills 目录链接 |
| Codex | `~/.codex/AGENTS.md` | 共享目录，优先既有 override |
| OpenCode | `~/.config/opencode/AGENTS.md` | 共享目录；禁用外部 skills 时补自有目录链接 |
| Grok Build | `~/.grok/AGENTS.md` | 共享目录，支持 `GROK_HOME` |
| Antigravity CLI | `~/.gemini/GEMINI.md` | 链接到 `~/.gemini/antigravity-cli/skills/ask-report-html` |
| Kimi Code | `~/.kimi-code/AGENTS.md` | 共享目录，支持 `KIMI_CODE_HOME` |
| Cursor | 官方 Settings → Rules → User Rules | 共享 skill，规范手动粘贴 |

共享 skill 在 `~/.agents/skills/ask-report-html/`。[agent-support.md](https://github.com/jerrywu001/ask-report-html/blob/main/docs/agent-support.md) 列出了官方来源和环境覆盖，[INSTALL.md](https://github.com/jerrywu001/ask-report-html/blob/main/skills/ask-report-html/INSTALL.md) 说明手动复制的方法。Agent 版本、禁用目录以及项目或团队规范仍可能影响发现和执行。

## 安装与安全

- 同名 skill 替换前先备份，备份保存在 `~/.ask-report-html/backups/`。
- 全局规范的指定段一致就跳过，不一致则原位更新，没有则添加一次。段外内容保持不变，只在更新时备份规范文件。
- Windows 目录链接依次尝试 symlink、Node/libuv junction、受管副本。替换链接只改入口，不删除外部目标；副本在安装时更新。
- 替换失败会恢复原入口；预览后发生外部变更就中止。规范标记边界损坏时，停止更新并要求检查。
- 服务只监听 `127.0.0.1`，校验 Host、Origin 和随机会话 token，没有任意路径写入接口，也不上传配置。
- 旧 skill 检测检查共享目录和常见全局 agent skills 目录，尊重环境覆盖；不扫描整个磁盘、项目 skills 或插件。所有检测到的入口都会列出，清理可能影响使用这些入口的未选中 agents；父目录含链接时需手动处理。
- 删除需明确选择 Y、勾选选项或指定 `--remove-legacy`。安装成功后，工具先备份目录，再将它移出 skill 发现路径；符号链接会保存描述后移除入口。预览后发生变更会中止，清理失败会保留旧入口并报告。备份在 `~/.ask-report-html/backups/`。
- 清理不会触碰 `~/.answer-me-with-html/` 下的历史报告或旧全局规范。规范若仍引用已删除的 skill，请手动检查；仍需旧版功能时可保留旧 skill。
- 工具只处理选中的 agent 目标、共享 skill 和已授权的旧入口，不安装 hooks，也不改认证、权限或业务项目。

## 开发

```bash
npm run build  # 修改 skill 源码后，重建校验过的 ZIP
npm test
npm run check # 语法、归档/源码一致性、版本一致性、公开内容检查
npm run test:package # 打包后在隔离 home/cache 中安装并执行真实 npx
```

`bin/` 是入口。`src/` 包含安装器、门槛、路径和提问逻辑，`web/` 是双语配置页。Skill 和纸张主题包装器在 `skills/`，ZIP 和 manifest 在 `assets/`，自动化测试在 `tests/`。

GitHub Actions 在 Linux、macOS、Windows 上运行 Node 22 检查、测试和发布包验证，Windows 可跳过 Unix 特定测试。文件系统测试不涵盖每种 agent 和模型的实际会话行为。`npm run test:package -- --keep` 可保留隔离目录用于排错，默认会清理。临时材料保存在 `.agent-work/npm-cli/`。

## npm 发布

推送 `v*` tag 会触发 `.github/workflows/publish.yml`。工作流校验 tag 与 `package.json`、lockfile、skill manifest 的版本一致，要求提交已在默认分支上，并等待跨平台检查通过后再发布。正式版使用 `latest`，预发布使用 `next`；创建 tag 不会自动修改版本号。

发布采用 npm Trusted Publishing（OIDC），不保存长期 npm token。首次需要认证发布一次，再在 npm 绑定 `jerrywu001/ask-report-html` 和工作流文件名 `publish.yml`。需允许直接执行 `npm publish`，并在创建绑定后 2 天内完成首次 OIDC 发布。发布 job 使用 Node 24 和 npm 11，用户仍只需 Node 22。

首次发布、版本更新和检查步骤见 [npm-release.md](https://github.com/jerrywu001/ask-report-html/blob/main/docs/npm-release.md)。普通分支推送和 PR 不发布 npm；npm 分发不会新增 hooks 或强制报告监听器。

## 来源与许可

HTML 渲染器和原始解释页组件来自 [QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html)，保留生成包、版权与许可。本项目增加两种使用模式、可配置报告门槛和本地多 agent 安装器。[MIT](LICENSE)，见 [第三方声明](THIRD_PARTY_NOTICES.md)。
