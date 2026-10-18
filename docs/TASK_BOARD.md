# 主控任务板

第二阶段唯一主控 `/root`，分支 `codex/stage2`。接续基线 `9bbb976`，第一阶段验证源码 `554ddba873fb606a9bacd1169ff45d0312b4ba6d`，G1 PASS。接入1.0.0不变，新增业务2.0.0；先提交统一基线 `6d01f360c92e103f3781578d5a16ff8344b5d715`，再派工。

| ID | 任务 | 状态 | 实际证据 |
| --- | --- | --- | --- |
| F01–F08 | 第一阶段接入、字段映射与独立复核 | DONE | docs/evidence/foundation-2026-10-18.json；原G1证据沿用 |
| B00 | 业务输入/证据/运行/修订/核验/导出契约与API骨架 | DONE | 6d01f36，src/contracts/business.ts，BUSINESS_API.md |
| B01 | ima多图/原文事实/冲突与分页、回退、错误 | DONE | db0d0f0/a241ebf已集成；本次live13事实、4张不同摘要图片；220021限额实测映射 |
| B02 | 澄清/场景策略/服务端实际模型/生成/独立核验 | DONE | c0eb4b1已集成；后续主控定向修复；实际gpt-4.1请求成功 |
| B03 | 三平台界面、依据、图文编辑、重验/服务端导出交互 | DONE | 3717402已集成；UI synthetic/SSR、浏览器人工样例完整闭环与真实界面 |
| B04 | 运行持久化、CAS、资产缓存、导出门槛与集成 | DONE | 7a70bf9后主控实现；最终118项测试/类型/构建、HTTP与安全证据见STATUS |
| B05 | G3正式真实结果与必要对照 | BLOCKED | 同任务真实资料快照+实际模型对照继续取得结果；ima220021当日额度阻塞另一型号/新取证；逐平台结果见STATUS |
| B06 | 阶段二只读review与修复复验 | DONE | 多轮实际P2已修复；安全报告在.local-evidence/stage2/reviewer/，不代替G4 |
| R01 | 第三阶段新上下文G4独立验收 | TODO | 按prompts/03-review.md与ACCEPTANCE重新检查 |
| R02 | 恢复额度后补另一型号/必要fresh live验收 | BLOCKED | 用户服务额度次日恢复或提供实际可用权限额度；不能用缓存证明新取证 |
| R03 | 正式流程视频、说明书、链接与赛事交付 | TODO | 尚未录制连续真实视频；无远端/未公开部署或提交 |

## 实际并行任务

客户端真实协作工具已核实支持spawn/followup/message/list及结果回传，无自定义角色参数；每份委派按DELEGATION模板携带对应TOML的全部约束，不派生下级。实现期最多3个并发worker，且不同checkout；主控维护共享契约/API/运行/资产/依赖。秘密、原文、原始响应均未复制到worktree，worker仅synthetic；live由主控集中执行。

全部基础提交为 `6d01f360c92e103f3781578d5a16ff8344b5d715`，契约 `2.0.0 + 1.0.0`：

| 实际智能体 | worktree绝对路径 / branch | 可写范围 | worker提交 → 主控集成 | 实际状态 |
| --- | --- | --- | --- | --- |
| /root/ima_engineer | /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-ima / codex/s2-ima | src/server/ima/**、tests/ima/** | db0d0f0→8e73239；a241ebf→3e78ec2 | completed |
| /root/workflow_engineer | /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-workflow / codex/s2-workflow | src/server/workflow/**、llm/**、verification/**、prompts/runtime/**、tests/workflow/** | c0eb4b1→d1a9706 | completed |
| /root/ui_engineer | /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/s2-ui / codex/s2-ui | src/app/**排除api、components/**、styles/**、tests/ui/** | 3717402→a7670be | completed |
| /root/reviewer | 主控目录只读，无并行源码写入 | 只读源码/安全汇总；仅.local-evidence/stage2/reviewer/可写报告 | 原始9951bd8起，逐次定向复核集成修复 | completed；7f837b9定向复核PASS |

开发完成后，主控临时接管最小集成修复范围：workflow/index、verification/index、runtime提示词、marketing-workbench及相应测试；ima/adapter/errors与测试仅处理实际220021。主控额外拥有scripts/**、tests/runs/**和tests/contracts/**。不再并行写worker目录，根依赖未新增，只有一个npm锁文件。

worktree保留已提交交付快照，安装用node_modules符号链接已移除，源码无未提交变更。主控后续修复在集成分支，worker分支不代表最终运行版本。工具没有销毁接口；completed是实际任务结束状态，不声称已销毁线程。原preflight_audit及第一阶段只读任务已结束。

## 本轮交付开发

主控唯一 /root；工具实际支持 spawn/followup/list/message，无自定义角色参数、无销毁接口。三个独立 checkout，最多3 worker，不递归。基线契约2.1.0/1.0.0，统一基线提交后登记实际SHA。ima_worker 限src/server/ima/**、tests/ima/**；workflow_worker限既有workflow/llm/verification/runtime提示词和tests/workflow/**；ui_worker限既有UI目录（排除api）。主控负责共享/API/运行/资产/脚本/交付文档；完成集成后接管必要修复。真实材料与凭证不复制到worktree，worker只用synthetic。

- DELIVERY-local: /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/delivery-local / codex/delivery-local / base b0a89b90709723d72bf5cd5bf4ed8b4257c46df8 / contract2.1.0 / scope src/server/ima/**, tests/ima/**.

- DELIVERY-style: /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/delivery-style / codex/delivery-style / base b0a89b90709723d72bf5cd5bf4ed8b4257c46df8 / contract2.1.0 / scope src/server/workflow/**, src/server/llm/**, src/server/verification/**, prompts/runtime/**, tests/workflow/**.

- DELIVERY-preview: /Users/zhouzihan/Documents/ChatGPT/华为黑客松/.worktrees/delivery-preview / codex/delivery-preview / base b0a89b90709723d72bf5cd5bf4ed8b4257c46df8 / contract2.1.0 / scope src/app/** excluding api, src/components/**, src/styles/**, tests/ui/**.

### 本轮实际集成

- /root/ima_engineer completed：e91d51f→8518d86，d813a93→82cb250；主控提供脱敏目录结构以修正Windows别名，worker未读取真实资料。
- /root/delivery_style completed：7f5c690→5b28326。
- /root/ui_engineer completed：4395765→3bb377f。
- 三个worker范围审查PASS，顺序集成；无新增依赖。主控负责local runtime/catalog API、运行/资产/HTML导出及真实取证和模型联调。
- 集成版145项测试、非增量tsc与生产build PASS；真实local业务8项观察通过，含5组平台/场景/型号结果与改稿闭环。稳定版本只读审查随后记录。

### 本轮独立评审与最终状态

- /root/reviewer：来源/路径/秘密/导出，只读主目录，基线be168fb；初审型号P2，主控e79b9e0修复后150项与定向复核PASS，completed。
- /root/review_content：新上下文，只读内容/场景/核验；初审型号P2及“第一步”误拦截P2，e79b9e0后81项/21型号对照与复核PASS，completed。
- /root/review_delivery：新上下文，只读UI/交付；初审异步编辑覆盖P2和HTML位置P3，e79b9e0后40项及复核PASS，completed。
- 三份完整reviewer TOML与任务单见忽略的.local-evidence/delegations/DELIVERY-REVIEW-*.md，报告仅写各自review-*目录；未读秘密/原始私有材料、未调用实际模型/ima、未操作主浏览器。
- 主控已完成最终150项/tsc/build、干净安装/构建、安全扫描、浏览器改稿导出与四组最终当前稿实际模型重验。没有待集成worker提交。主控仅交接文档/打包收尾，无并行写入。
