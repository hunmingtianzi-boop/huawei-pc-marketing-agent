# 当前状态与交接

2026-10-18，本轮为**本机交付1**：用户明确授权从本地知识库读取，不走ima API；增加三平台模拟预览及自含图片HTML。G1/G2既有基线保留；G3-local PASS（真实资料+实际模型）；G4-local浏览器与独立评审执行中。正式赛事G3-ima fresh和视频/外链另列，不以local冒充实时ima。

## 基线、代码和启动

- 项目 /Users/zhouzihan/Documents/ChatGPT/华为黑客松，分支codex/stage2。本轮开始HEAD 5b911808402a02d451ccaf09358362839e8f5850、工作区干净。契约提交b0a89b90709723d72bf5cd5bf4ed8b4257c46df8后创建三个独立worktree。
- 接入1.0.0不变；业务2.1.0兼容已保存2.0.0。主控唯一，维护公共契约/API/运行/资产/根依赖。集成源码3bb377f；最终HEAD以git rev-parse HEAD为准。
- npm ci；本机.env.local配置LLM三项；知识库放根目录或LOCAL_KB_ROOT；npm run build，再npm start -- --port 3210。当前生产预览 http://127.0.0.1:3210/ 。Node26/npm11、Next16/React19、单一package-lock，无新增依赖。见README、USER_GUIDE。

## 本轮已验证

- 本机真实目录10个明确型号进入菜单；计数为最多6张已核查候选，不是全库图片总数。MateBook14（鸿蒙版）13事实、18来源、4张摘要不同图片，无冲突。实际本地取证脚本callIma/fetchMedia计数均0；production local明确拒绝网络取材。
- 实际模型gpt-4.1、https://api.openai-next.com/v1（提供方路由名，未认证底层模型），最小请求PASS，生成与独立语义核验分别实际请求。凭证只在主目录.env.local（0600），不回传客户端或worker。
- 集成版145/145 synthetic/模拟传输/SSR/状态测试PASS，非增量tsc、生产build PASS。包括旧请求迟到、直接导出未通过稿、无依据价格/亲测、资料冲突、图片不足/损坏/重复、平台更换、标题图注失效、HTML转义/内嵌及local拒绝合成模型。
- 朋友圈单卖点短动态；小红书短标题/清单/标签和可操作图集；公众号导语/分节解释/内嵌图。均明确模拟未发布，无虚构互动数字。

## G3-local：PASS

npm run verify:delivery 实际执行输入→策略→本地原文/图→实际生成→独立核验→编辑→核验失效→重验→导出。全8项观察通过，含目录、图片不足项；5组不同平台/场景/型号，另有1个改稿版本。均非synthetic/replay、未人工替换模型文稿。

| 成果 | runId / 版本 | 图片 | 状态 |
|---|---|---|---|
| MateBook14 / 新生 / 朋友圈 | 5d34d6a6-491a-45db-8c22-1503cdc14464 v1 | 1 | PASS |
| 上述标题+图注修改重验 | 同run v2 | 1 | PASS，修改后导出409 |
| MateBook14 / 新生 / 小红书 | efffc7e0-38c5-4b80-aa75-13302489f943 v1 | 3 | PASS |
| MateBook14 / 出差 / 公众号 | 8d35a25e-812c-4b77-81b9-79e710c776fd v1 | 2 | PASS |
| 同产品同朋友圈换出差 | 5d34d6a6-491a-45db-8c22-1503cdc14464 v4 | 1 | PASS，策略变化 |
| Pro S / 出差 / 朋友圈 | 6fda9bcf-5a8e-4c9e-9beb-ebd77b058845 v1 | 1 | PASS，事实/图片更换 |
| D16 2024 / 新生 / 小红书 | fac0b7ab-43a0-4f3a-b51a-62fed9b9b565 v1 | 2，缺1 | PASS，INSUFFICIENT_IMAGES且导出409 |

成稿/HTML及当版快照在.local-data/delivery-results/，运行私有记录在.local-data/runs/<runId>/。朋友圈同任务换场景复用该任务本次local快照，保留retrievedAt并逐图检查，不声称重新读源文件。其它新任务实际读取本地原件。风险宣传请求未进入通过稿，保留REQUESTED_CLAIM_OMITTED审计。

## 证据、评审与协作

.local-evidence/delivery/：tests.log、typecheck.log、build.log、model-probe.json/log、local-source.json、business.json/log和浏览器截图。三个worker提交经范围审查后顺序集成，SHA/路径见TASK_BOARD。工具没有销毁接口，仅报告实际completed，不声称已销毁线程。凭证和原始资料没有复制到worktree。

## 限制、待验证与交付边界

- 原G1真实ima PASS；第二阶段G3-ima部分通过、fresh与另一型号受220021当日额度BLOCKED的结论保留，见docs/evidence/stage2-2026-10-18.json及Git 5b91180的STATUS。本轮不请求ima，不声称额度恢复；local已补另一型号业务对照。
- 正式连续Demo视频未录制；当前浏览器API无连续录屏入口，DEMO.md已给脚本，截图不冒充视频。
- 没有Git远端、推送、公开部署、魔搭链接或赛事提交。SUBMISSION.md整理材料与待对外动作；不编造链接或评审可访问状态。
- 本机单用户/单Node进程，没有公网认证、多用户/多进程锁；海报不在首版范围。不是平台发布或一键导入服务。
- 新机需配置模型并提供有权限的原始知识库；源码包不携带凭证或完整资料。local快照不证明官网当前事实或fresh ima，正式赛事来源要求仍按赛题确认。
