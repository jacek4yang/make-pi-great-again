# 提示词:pi-ui-next 全面美化(供 Gemini 3.8 Flash 执行)

> 使用方法:让执行该提示词的 agent 在 `D:\Workspace\pi-ui-next` 仓库内工作(需要文件读写与命令执行能力)。全文复制下方提示词即可。

---

你在 Windows(Git Bash)环境下工作,Node v26,TypeScript ESM 项目。

# 使命

对 Pi 编码代理的 TUI 美化层 `pi-ui-next` 做**一次系统性、完整的视觉美化**。目标:信息层级清晰、留白有节奏、语义色克制而准确、所有呈现宽度安全(含 CJK),让整个界面达到专业 CLI 工具(参考 Starship/GitHub CLI 的视觉品质)的水准。**装饰永远服从可读性。**

# 第零步:必读材料(读完之前禁止写任何代码)

按顺序阅读,理解后才能动手:

1. `D:\Workspace\make-pi-great-again\AGENTS.md` —— 硬规则(分支纪律、合并门、禁止事项)
2. `D:\Workspace\make-pi-great-again\docs\UI-SPEC.md` —— 视觉规范(四级渐进披露、主题规则、golden 测试要求)
3. `D:\Workspace\make-pi-great-again\docs\INVARIANTS.md` —— U1–U6 不变量(尤其是 U1:原始 JSON 永远不是默认呈现;U2:失败必须始终可见;U3:主题只能换颜色、永不换语义;U4:CJK 宽度正确;U6:估算与实测必须标注区分)
4. `D:\Workspace\make-pi-great-again\integration\CONTRACTS.md` —— pinx 契约(§5 pinx.exec 的字段)
5. `D:\Workspace\make-pi-great-again\pi-mono\packages\coding-agent\docs\tui.md` 和 `themes.md` —— Pi 官方 TUI/主题规范(组件模型、invalidate 纪律、宽度工具)
6. `D:\Workspace\pi-ui-next` 仓库全部源码:`src/`(index.ts、info.ts、render/、timeline/)、`test/`(含 goldens)、`scripts/`
7. 类型参考(只读):`node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.d.ts`(ThemeColor/ThemeBg token 全清单)与 `node_modules/@earendil-works/pi-tui/dist`(Text/Box/VStack/HStack/Container 组件、visibleWidth/truncateToWidth)

# 仓库现状(事实,不要凭空想象)

- 测试:`npm run ci` = typecheck(tsc --noEmit,strict)+ eslint + prettier --check + `tsx --test test/*.test.ts`(node:test)。golden 测试在 `test/golden.test.ts`,基线在 `test/goldens/*.golden.txt`,重新生成用 `UPDATE_GOLDENS=1 npx tsx --test test/golden.test.ts`(变更必须有意为之并在提交说明里写明理由)。
- 真实加载冒烟:`node scripts/pi-load-smoke.mjs`(SDK + 一次性 agent home);真实用户配置验证:`node scripts/verify-agent-load.mjs`。两者都必须保持绿色。
- 关键模块:
  - `src/render/width.ts` —— visibleWidth/truncateToWidth/padEndToWidth(ANSI+CJK 感知)。**一切宽度计算必须用它,禁止用 String.length**。
  - `src/render/icons.ts` —— IconSet(unicode/ascii 两套),图标语义固定(U3)。
  - `src/render/tool-renderer.ts` —— 工具渲染器解析链(`registerToolRenderer`),策略:先调 `next()`,**只有没人渲染时才接管**;已支持 pinx.exec 契约行(`✓ node · revision 7 · 8 calls · 3.4s`)与输出预览。
  - `src/render/result-summary.ts` —— 结果摘要与 pinx.exec 行构造(纯函数,有单测)。
  - `src/timeline/` —— ActivityTimeline(事件摄取)、project.ts(Level 0/1 投影,**纯文本输出,禁止嵌入 ANSI**,有 golden 锁定)、summarize.ts(工具标题)。
  - `src/index.ts` —— Pi 接线:事件摄取、`/ui-next` 命令、实时面板(setWidget 组件工厂形态,已主题化)。
- 主题 API:扩展收到的 `theme` 对象:`theme.fg(token, text)`、`theme.style(text, {fg, bg, bold})`;可用 token(只允许用这些):`accent, success, error, warning, muted, dim, text, toolTitle, toolOutput, toolDiffAdded, toolDiffRemoved, toolDiffContext, border, borderMuted` 等(完整清单见 theme.d.ts)。背景 token 仅限 `selectedBg, toolPendingBg, toolSuccessBg, toolErrorBg` 等。
- 实时面板:`ctx.ui.setWidget(key, (tui, theme) => Component, {placement: "aboveEditor"})` —— 组件工厂形态,每次重建注入当前主题。现状有 no-op 重绘去重(lastWidgetLines)。

# 美化范围(逐项完成,不许遗漏)

1. **工具结果渲染器**(`src/render/tool-renderer.ts`):
   - 状态图标按语义着色(✓ success / ✗ error / ⚠ warning),工具名 toolTitle,元数据(耗时/计数)muted;
   - 输出预览:内联 6 行(expand 16 行),toolOutput 色,逐行 `truncateToWidth`;
   - **diff 类结果**:检出 `+`/`-` 开头的行分别用 `toolDiffAdded`/`toolDiffRemoved` 着色;
   - 错误呈现:错误行 error 色,至少 4 行错误正文;
   - **部分结果(partial/isPartial)**:running 图标 + accent 色;
   - 逐工具打磨:read(行数+路径)、grep/find(匹配数)、edit(+N -M 用 diff 色)、write、bash(退出码+时长徽章)、code/python/node(code_buffer/code_job 的 pinx.exec 行)、第三方工具通用回退(保持可读)。
2. **renderCall**:工具名 toolTitle,参数摘要 muted;路径超长时中间省略(`a/…/z.ts`),命令折叠到 48 列。
3. **实时面板**(index.ts 的 widget):重构为分节式 3–5 行面板:
   - 第 1 行状态:图标着色 + 文本,`· 3 calls · 1 failed` 中失败计数 warning 色(>0 时);
   - 第 2 行上下文:若收到 `pinx.context.status` 契约事件,渲染**微型压力条**(`█████░░░░░ 42%`,10 格,用 success→warning→error 三档阈值 50%/80% 选色)+ `114.0k/272.0k (provider-reported)`;
   - 第 3 行最近事件(accent);
   - 全部行 `truncateToWidth` 到终端宽度,保留 no-op 去重逻辑。
4. **/ui-next 总览**:用 Box/VStack 组合出带边框的概览卡(圆角或单线边框,主题 border 色),分组:Turn 概览 / 失败 / 证据引用;对齐用 padEndToWidth。
5. **间距节奏**:统一"节与节之间 1 空行"的规则;预览块与页脚之间不留空行;页脚(`[node exited …]` 类)统一改为 muted 色、短横线前缀风格 `— node · 0.1s · exit 0`(同时保持 U6:退出码/时长如实,不许美化成"成功"如果失败)。
6. **图标三模式**:`IconMode` 增加 `"nerd"`(Nerd Font 图标集:如  取代 ●、 取代 ✓——自选协调的一套),默认仍 unicode;ascii 保持纯 ASCII。 golden 用 unicode/ascii 不变;nerd 模式只需单测覆盖(不强制 golden)。

# 硬约束(违反任何一条即任务失败)

- **golden 是纯文本圣域**:`src/timeline/project.ts` 的投影输出永远不许嵌入 ANSI;主题色只允许出现在 TUI 层(tool-renderer / widget / 组件)。golden 语义(行内容)不许变;因列宽/间距产生的合理变化才可重新生成。
- **不许动**:pi-mono 克隆、4 个稳定仓库、其他 3 个实验仓库、meta 仓库的 manifest.json;不许 `git push`、不许合并任何分支、不许碰 main。
- **只用文档化 API**:禁止 prototype 补丁、禁止 import Pi 私有模块、禁止第二个终端渲染循环。
- **不新增任何 npm 依赖**(pi-tui 已是 peer,可用)。
- 主题 token 名必须逐字来自 theme.d.ts;语义角色不可重定义(U3)。带色字符串不许缓存(除非组件 invalidate 重建)。
- 测试严格性不许下降;不许跳过/删除断言。
- Windows 路径、CJK、80/120/160 三档宽度全部要测。

# 工作流程(严格分阶段,每阶段结束跑验证)

- **Phase 0 — 方案**:读完材料后写 `docs/UI-POLISH-PLAN.md`(仓库内),逐项列出:改动点、预期视觉(文字小样)、风险。**此阶段不改代码**。
- **Phase 1 — 主题基元**:新增 `src/render/themed.ts`:状态图标着色、元数据弱化、标题强调、分隔线、微型压力条(10 格,阈值 50%/80%)等 helper,全部接受 `theme` 参数、逐个单测(`test/themed.test.ts`)。
- **Phase 2 — 工具渲染器**:按范围第 1–2 项重写 renderResult/renderCall;逐工具加渲染快照单测(node:test 断言含 ANSI 的关键片段,如 `contains "\x1b[3" 或具体 token 输出)。
- **Phase 3 — 面板**:按第 3 项重构 widget;保持 `ctx.mode === "tui"` 守卫与 no-op 去重。
- **Phase 4 — 总览**:按第 4 项重构 /ui-next。
- **Phase 5 — 收尾**:第 5–6 项;若投影文本有合理变化,`UPDATE_GOLDENS=1` 重新生成并在提交说明逐条列出理由;跑全部验证。
- **Phase 6 — 交付**:分支 `feat/theme-deep-polish`(从 `feat/nested-code-renderer` 切出);约定式提交(每阶段一个 commit);最终报告用以下模板:

```text
Repository: D:\Workspace\pi-ui-next
Branch: feat/theme-deep-polish
Commit: <sha>
Implemented: <逐项>
Tests: <数字> passing + golden 变更清单 + 双冒烟结果
Known limitations:
Next action:
```

# 每阶段验证命令(全绿才能进入下一阶段)

```bash
npm run ci
node scripts/pi-load-smoke.mjs
node scripts/verify-agent-load.mjs
```

# 汇报纪律

每阶段结束用 3–6 行汇报:做了什么、视觉变化(文字小样)、测试结果。不许跳过失败;失败就修,修不动就明确说卡在哪。不要美化你的汇报本身。
