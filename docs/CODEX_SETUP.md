# Codex 协作配置与启动

适用项目：AI＋华为 PC 营销软文智能体。官方资料核对日期：2026-10-18。

这套配置组织的是“用 Codex 开发参赛作品”的协作方式。参赛应用自己的工作流和系统提示词仍需要单独实现；运行提示词放在 `prompts/runtime/**`。

## 一、先确认正在用哪一个 Codex

桌面端、CLI 和 IDE 都能在当前支持版本中使用子智能体，但安装版本可能不同。桌面端内置 Codex 的行为不能仅由独立 CLI 的版本推断。先记录实际客户端、操作系统、执行环境与版本，再按它支持的入口操作。[官方排障说明](https://learn.chatgpt.com/docs/reference/troubleshooting)

使用 CLI 时，可从项目根目录依次运行：

```sh
codex --version
codex features list
codex --strict-config
```

前两条查询版本与功能状态；第三条启动交互会话，并对当前版本不认识的配置字段报错。若本机尚不支持 `--strict-config`，根据实际报错和该版本帮助核对配置或更新客户端，不把未知字段被忽略当成配置生效。使用桌面或 IDE 时，在同一个项目中开启新对话即可；无需为了这套方案另开多个终端。

当前官方说明中多智能体默认开启。`features.multi_agent` 仍出现在配置参考里，状态为稳定且默认开启；本包不额外写实验开关，也不固定模型或推理强度。若实际不能派生子智能体，检查有效配置和管理策略，不能以角色扮演文字冒充真实委派。[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)

## 二、把配置放到项目根目录

本包应保留以下相对位置：

| 文件 | 用途 |
|---|---|
| `AGENTS.md` | 所有任务共用的项目约束 |
| `.codex/config.toml` | 子线程开关和数量上限 |
| `.codex/agents/ima_engineer.toml` | ima 接入工程师 |
| `.codex/agents/workflow_engineer.toml` | 工作流工程师 |
| `.codex/agents/ui_engineer.toml` | 界面工程师 |
| `.codex/agents/reviewer.toml` | 独立验收审查员 |
| `docs/STATUS.md` | 主控维护的实际进度与交接 |
| `docs/DECISIONS.md` | 主控维护的已定接口和决策 |

已有项目应先检查现有文件，由主控合并本包规则，不整份覆盖已有配置。项目 `.codex/config.toml` 只在项目被信任时加载；打开自己的项目时确认正确目录和信任状态。此处“信任”是让项目配置被加载，不等于授予无限权限。配置仍受用户设置和管理策略约束。[配置加载规则](https://learn.chatgpt.com/docs/config-file/config-basic)

本包配置只有：

```toml
[agents]
enabled = true
max_concurrent_threads_per_session = 3
```

数量 3 是本方案的上限，指最多同时开放 3 个子线程，排除主线程；不是宣称官方默认人数为 3。当前文档将 `max_threads` 列为旧别名，本包统一使用完整名称；没有加入未核实的 `max_depth`。[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)

当前官方支持把每个自定义角色写成 `.codex/agents/` 下的独立 TOML，必填 `name`、`description` 和 `developer_instructions`。本包采用这一种方式，不混写另一套角色注册配置。[自定义角色](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## 三、确认 AGENTS.md 已加载

Codex 在每次运行开始时建立项目指令链，CLI 通常在启动会话时建立。它会读取全局规则及项目根到当前工作目录路径上的规则；同目录的 `AGENTS.override.md` 优先于 `AGENTS.md`。更新规则后启动新会话更稳妥，不能假设旧会话自动刷新。大型参考文档按任务主动读取，不要把全部材料塞进根规则；指令链有大小限制。[AGENTS.md 加载机制](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

每个主对话开始时，把下面的预检要求交给主控：

> 先确认当前项目根目录、分支或提交与实际执行环境。列出已加载的 AGENTS.md／AGENTS.override.md 路径，读取 docs/STATUS.md、docs/DECISIONS.md 和本轮任务单，说明当前阶段。检查三个子线程上限和角色是否可用；不要输出任何凭证。若规则未加载或相互冲突，先说明具体来源并修正当前执行安排。

不要只凭“已读取”的回答判断成功：主控还应复述本轮允许改哪些目录、哪些文件归自己、什么情况需要等契约更新。CLI 可用 `/status` 检查当前工作范围，用 `/debug-config` 查看配置层和策略来源。[命令说明](https://learn.chatgpt.com/docs/developer-commands?surface=cli)

## 四、三个主对话按顺序推进

每轮只保留一个负责分工、接口和整合的主控。上一轮关闭子任务、写好交接，再开始下一轮。不是同时开三个主控争用同一仓库。

| 对话 | 主控负责 | 子智能体负责 | 进入下一轮的依据 |
|---|---|---|---|
| 1．探测接入与契约 | 验证环境；整理真实接入结果；确定共享类型、错误状态和接口；记录决定 | 只读调查接口、业务流程和验收要求；不改项目代码 | 真实接入状态清楚，未知项明确，关键契约可实现且已有基线 |
| 2．并行完整实现 | 先准备三个独立 worktree；实现共享 API、资源和运行记录；收集改动并联调 | 三个工程角色在各自 worktree 和目录范围内写代码 | 完整真实流程能运行，关键场景可复现，材料与实现一致 |
| 3．独立验收 | 提供整合版本；按问题修复；更新真实状态和提交材料 | reviewer 只读审查；把缺陷和证据交回主控 | 必要修复完成，实际验证结果与未验证项均有记录 |

研究阶段的子任务是只读调查，但主控可以整理已核实的契约和交接文件。验收阶段 reviewer 不直接修复，主控负责修复及后续复核。这些是本项目的协作分工，不是 Codex 强制的产品流程。

## 五、并行写入前，先由主控分配 worktree

新对话或新子线程本身不保证文件隔离。Worktree 是同一 Git 仓库的独立 checkout，每个 worktree 有自己的文件副本，仍共享提交、分支等 Git 元数据。[Worktree 原理与用法](https://learn.chatgpt.com/docs/environments/git-worktrees)

第二轮开始时，主控先确认 Git 基线并创建、准备三个独立 worktree，再发任务；用户不用手工开多终端。一个 worktree 分给一个写入角色，主控保留整合 checkout。主控需要先确认当前权限允许访问所分配的路径；工具不支持隔离工作目录时，就顺序实现，不能声称已经隔离。

| 负责人 | 可以改动的目录 |
|---|---|
| ima_engineer | `src/server/ima/**`、`tests/ima/**` |
| workflow_engineer | `src/server/workflow/**`、`src/server/llm/**`、`src/server/verification/**`、`prompts/runtime/**`、`tests/workflow/**` |
| ui_engineer | `src/app/**`，排除 `src/app/api/**`；以及 `src/components/**`、`src/styles/**`、`tests/ui/**` |
| 主控 | `src/contracts/**`、`src/app/api/**`、`src/server/assets/**`、`src/server/runs/**`、根配置与依赖锁文件、根 `AGENTS.md`、`docs/STATUS.md`、`docs/DECISIONS.md` |
| reviewer | 只读审查整合版本；不承担修复 |

每份任务必须给出绝对 worktree 路径、基线提交、契约位置、允许修改范围、验收条件和输出格式。子智能体只回报自己的变更、验证和阻塞，不自行合并或推送，也不递归再派生子智能体。共享契约或依赖需要变化时，先交回主控；主控统一更新基线后再继续受影响任务。

## 六、如何启动和查看子智能体

在当前主对话里用自然语言要求委派，并给清楚的任务边界即可。第一轮可让主控启动只读调查；第二轮须先满足 worktree 前提。四个角色不会同时运行：第二轮用三名工程师，第三轮用 reviewer。

当前 CLI 使用 `/subagents` 查看或切换当前会话的子线程；`/agents` 是浏览连接服务上会话的命令中心，用途不同。桌面端打开子线程活动记录；IDE 在后台智能体面板可用时查看状态和详情。[命令说明](https://learn.chatgpt.com/docs/developer-commands?surface=cli)

自定义角色未加载时，按以下次序处理：

1. 确认运行目录、项目配置的信任状态、文件位置、TOML 语法和客户端版本。
2. 新会话重新加载后，若自定义角色仍不可用，但内置子智能体工具可用，主控可以选内置 `explorer` 承担只读任务、内置 `worker` 承担实现任务；必须把对应角色文件的全部任务约束传给它，并保持相同 worktree 与目录分工。
3. 如果子智能体工具本身不可用，由主控按相同任务边界顺序完成，明确报告实际环境限制。不能写“已启动三位专家”却只生成三段角色化文字。

内置角色与自定义角色的说明见 [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)。上述回退次序是本包的执行建议，不改变客户端权限或管理策略。

## 七、权限与交接的准确理解

角色文件没有设置模型、推理强度、沙盒、审批或模型提供商；保持用户当前环境的选择。“只读调查”“只修改分配目录”是角色行为约束，不能替代系统层权限。子智能体继承父会话的实际权限；在角色 TOML 中写 `sandbox_mode` 或 `approval_policy` 不能建立另一套权限。本包不要求关闭审批或沙盒。[子智能体权限](https://learn.chatgpt.com/docs/agent-configuration/subagents)

进入新主对话时，依靠仓库内的状态、决策、契约和运行证据交接，不依靠“新对话自然知道之前的一切”。每轮结束由主控记录：当前提交、已实现行为、实际验证结果、未验证项、下一步、相关 worktree 和待整合改动。只复制结论不足以接棒，关键决定必须能回到文件和可复现输入。

## 官方来源

- [Subagents：可用性、角色和权限](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Configuration Reference：当前配置字段](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Config basics：配置加载与信任](https://learn.chatgpt.com/docs/config-file/config-basic)
- [AGENTS.md：指令发现与重载](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Developer commands：CLI 与会话命令](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [Worktrees：文件隔离与独立 checkout](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Troubleshooting：客户端版本差异](https://learn.chatgpt.com/docs/reference/troubleshooting)

本包的 TOML 可以做静态语法验证；角色实际加载、信任状态、子智能体与 worktree 能否运行，仍由第一轮在使用者的真实开发环境中确认。
