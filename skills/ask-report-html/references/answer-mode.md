# 主动调用：把问题回答成 HTML

用户明确调用 ask-report-html 提问时，不需要代码改动，也不需要等到任务结束。直接按原版解释页的方向回答。

- “为什么会这样” → 结论、原因、证据、边界。
- “流程怎么走” → flow 或 sequence，分支写清楚。
- “几个方案怎么选” → 对比表、取舍、建议。
- “结构是什么” → tree 或关系图。
- 短问题用2–4个面板，不为凑数量塞内容。
- 这不是任务报告，不要凭空编文件改动和测试成绩。
- 事实不足时说明未知，不用图表掩盖不确定性。

入口示例：Claude `/ask-report-html 解释OAuth`，Codex `$ask-report-html 解释OAuth`，Pi `/skill:ask-report-html 解释OAuth`。其他工具或版本可直接说“用 ask-report-html 回答这个问题”。以所在工具实际发现的命令为准。

回答页面保存到 `~/.ask-report-html/task_answer-<主题>/answer.html`，默认 --no-open；同一问题更新同一路径。设置、清理和更新命令不生成回答页面；用户要求纯文本则遵从。
