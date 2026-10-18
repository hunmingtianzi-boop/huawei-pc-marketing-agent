# 主控任务板

更新时间：2026-10-18。状态 TODO / DOING / BLOCKED / DONE；DONE 对应实际证据和提交。

当前分支 `codex/foundation`，已验证代码基线 `554ddba873fb606a9bacd1169ff45d0312b4ba6d`；接入契约 `1.0.0`。

| ID | 任务 | 负责人 | 状态 | 证据/依赖 |
| --- | --- | --- | --- | --- |
| F01 | 项目、环境、客户端及真实子智能体核查 | 主控 | DONE | environment.json、五份 TOML；真实 spawn/list/message/result；3bb59cf / STATUS |
| F02 | ima 官方材料与赛题独立只读调查 | ima_engineer / reviewer | DONE | static-report.json、F02-REVIEW.md；真实返回，未改源码 |
| F03 | 可启动基础、统一依赖/配置与有价值测试 | 主控 | DONE | 9099b03、5d2f8be、554ddba；30 测试/类型/构建通过 |
| F04 | 指定库、原文、型号图片最小 live 接入 | 主控 | DONE | 最新报告 b35c79cc-d20f-4f3d-ac89-bb0a4706c9ee，live/PASS，CLI/HTTP/浏览器证据 |
| F05 | 按实测冻结接入契约与建立基础提交 | 主控 | DONE | 554ddba，CONTRACTS 第10节、src/contracts v1.0.0 |
| F06 | 独立代码复核、修复与最终交接 | 主控 / reviewer | DONE | 三项P2已修，F07/F08 PASS；STATUS 与安全 evidence JSON |
| B00 | 补齐业务运行/修订/导出 schema 与端点、冻结增量基线 | 主控 | TODO | 阶段二先执行，再派依赖它的写入者；当前只有接入相关端点 |
| B01 | ima 取证包、更多型号/图片与分页容错 | ima_engineer | TODO | B00 + 主控实际创建独立 worktree |
| B02 | 策略、模型、生成、核验、修订 | workflow_engineer | TODO | B00 + 配置实际模型服务 + 独立 worktree |
| B03 | 三平台完整任务/结果/改稿/导出界面 | ui_engineer | TODO | B00 + 独立 worktree |
| B04 | 业务 API、资产、运行记录与统一整合 | 主控 | TODO | B01/B02/B03 |
| B05 | 三平台真实闭环 | 主控 | TODO | B04；正式平台图数单独验收 |
| R01 | 新上下文完整独立评审 | 主控 / reviewer | TODO | B05 |
| R02 | 实际缺陷修复与定向复验 | 主控 | TODO | R01 |
| R03 | 三组真实结果、录屏、说明书与发布材料 | 主控 | TODO | R02；按授权处理对外发布/提交 |

## 子任务与所有权

阶段一由主控作为唯一源码写入者，临时负责最小 ima/app/scripts/tests 和共享配置/契约，以及接口/调查/验收交接文档。两个工程/评审子任务只读，允许其指定忽略证据目录，不派生、不改源码。阶段二恢复 AGENTS 的工程角色分工；所有并行编码必须由主控预先准备独立 worktree/分支/基础提交。

| task_id | 实际子智能体 | 目录/隔离 | 基准 | 约束/结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| preflight_audit | /root/preflight_audit | 当前根只读，无 worktree | 当时无 HEAD，不适用 | 工具可用/消息回传；未改文件 | completed |
| F02-IMA | /root/ima_engineer | 当前根只读，无 worktree | 当时无 HEAD；草案 | 全部 ima_engineer TOML 约束显式传入；静态 PASS | completed |
| F02-REVIEW | /root/reviewer | 当前根只读，无 worktree | 当时无 HEAD；草案 | 手册9页和阶段门槛审查 PASS | completed |
| F06-REVIEW | /root/reviewer（同一子线程跟进） | 当前根只读 | 9099b03 | 3项P2，主控后续修复 | completed |
| F07-REVIEW | 同上 | 当前根只读 | 5d2f8be；0.1暂定 | 3项修复复核 PASS，26测试 | completed |
| F08-REVIEW | 同上 | 当前根只读 | 554ddba；1.0.0 | 新 live 映射与CSV链复核 PASS，30测试及7负向变异；无新P1/P2 | completed |

没有 worker 代码提交待集成；没有外部/子工作树；没有并行编码。当前工具不提供独立线程销毁接口，全部子任务已结束，未声称销毁。下一轮工作树、branch、base_commit、allowed_paths 必须在实际创建后登记，不能填占位值后声称已派发。


## 第二阶段启动

实际接续HEAD为9bbb976，工作区干净；G1证据存在且对应代码未变，直接引用。主控先做B00，业务契约2.0.0为新增边界，保留Probe1.0.0。主控负责scripts/**与tests/runs/**、tests/contracts/**及API/存储/资产/共享配置；其它恢复原所有权。模型字段当前为空，已核查明确的本机配置及本地11434服务，无可用完整配置；G2继续，G3待最小真实模型请求。

统一基线已提交：6d01f360c92e103f3781578d5a16ff8344b5d715。三个真实工作树已创建：

|task|path|branch|base|contract|allowed|状态|
|---|---|---|---|---|---|---|
|S2-ima|/Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-ima|codex/s2-ima|6d01f36|2.0.0 + 1.0.0|src/server/ima/**、tests/ima/**|已准备派发|
|S2-workflow|/Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-workflow|codex/s2-workflow|6d01f36|2.0.0 + 1.0.0|src/server/workflow/**、src/server/llm/**、src/server/verification/**、prompts/runtime/**、tests/workflow/**|已准备派发|
|S2-ui|/Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-ui|codex/s2-ui|6d01f36|2.0.0 + 1.0.0|src/app/**（排除src/app/api/**）、src/components/**、src/styles/**、tests/ui/**|已准备派发|

S2开发任务均实际completed；worker提交分别db0d0f0/a241ebf、c0eb4b1、3717402，主控逐个集成为8e73239/3e78ec2、d1a9706、a7670be。工具无销毁接口，不声称销毁。9951bd8为当前集成检查基线。S2-REVIEW正在主目录只读检查，唯一可写范围为忽略证据目录.local-evidence/stage2/reviewer/，完整角色TOML随任务单下发；不代替G4。

主控集成修复所有权补充：开发worker已completed后，主控临时负责src/server/workflow/index.ts、src/components/marketing-workbench.tsx及对应tests/workflow、tests/ui中reviewer可复现问题的最小修复，避免原worker基线与集成版本分歧；不扩展其它功能。原worktree保留已提交交付快照。
主控临时修复范围追加src/server/verification/index.ts：reviewer发现有依据的100% sRGB参数被当绝对宣传误拦截，仅修复此项与相关workflow回归检查。
