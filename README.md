# 华为 PC 营销智能体

源码仓库：[hunmingtianzi-boop/huawei-pc-marketing-agent](https://github.com/hunmingtianzi-boop/huawei-pc-marketing-agent)（按用户要求公开）。本机交付1的实际验收、安全证据及未完成项见 [STATUS](docs/STATUS.md) 和 [交付记录](docs/evidence/delivery-2026-10-18.json)。仓库公开不等于应用已部署。

默认从本机 `华为PC全板块深度知识库_v7/` 读取已授权原文与图片（local，不耗ima额度），调用现有实际模型；保留可选ima live路径。三平台提供各自的模拟预览和离线图文HTML导出，未发布。完整操作见 [本机使用说明](docs/USER_GUIDE.md)。

本机三平台图文工作台：必要澄清 → 场景策略 → 本地授权或指定 ima 产品事实与型号图片 → 实际模型生成 → 规则及独立语义核验 → 编辑重验 → 服务端导出。目标平台为朋友圈（1–3图）、公众号（2–4图）、小红书（3–6图）。当前验收结论、实际结果与阻塞以 [STATUS](docs/STATUS.md) 和 [验收记录](docs/evidence/stage2-2026-10-18.json) 为准；synthetic 不计真实成稿。

## 启动

本次环境 macOS arm64、Node 26.0.0、npm 11.12.1；最低 Node 20.9，建议使用 `.nvmrc`。沿用 Next.js 16.4.2 / React 19.3.1 / TypeScript 5.9.3，只维护 `package-lock.json`。

```sh
npm ci
cp -n .env.example .env.local
chmod 600 .env.local
# 在编辑器中填写本机配置，已有 .env.local 不覆盖
npm run dev -- --port 3210
```

生产预览：`npm run build`，再 `npm start -- --port 3210`。访问 [工作台](http://127.0.0.1:3210/)。应用仅绑定回环地址，适用于一个 Node 进程的本机单用户；没有公网登录、多用户权限或多实例写入锁。导出为文本、Markdown或自含图片的离线HTML，不表示已发布。

## 服务端配置

local（默认）：将授权知识库目录放在项目根，或配置 `LOCAL_KB_ROOT` 指向其绝对路径，无需ima凭证。产品目录、原文与CSV图片依据均须存在。

ima（可选live模式）：用生成凭证的同一账号加入 **任德耀新建华为PC知识库**，在 `.env.local` 填 `IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY`。保留已部署的官方 Skill；新机器运行 `python3 scripts/setup_ima.py` 下载并校验指定1.1.10完整包，默认 `vendor/ima-skill/ima_api.cjs`。支持 `IMA_SKILL_PATH` 指向另一个已审查完整目录。使用者自填 `IMA_ACCOUNT_LABEL` 不等于接口验证昵称。

模型：一个支持 Chat Completions JSON 的服务即可，三项均只在服务端读取：

```dotenv
LLM_BASE_URL=https://api.openai-next.com/v1
LLM_MODEL=gpt-4.1
LLM_API_KEY=在本机填写你的服务密钥
```

这是本次用户已有服务的实际配置方案；模型名代表提供方路由标识，未独立认证底层实现。可以更换自有兼容服务，不需新增 SDK。`LLM_BASE_URL` 可为服务根、`/v1`，或末尾完整 `/chat/completions`（会规范化）；普通远端必须HTTPS。配置修改后重启页面服务；CLI每次加载本机 `.env.local`。

```sh
npm run verify:model
npm run verify:business-evidence
```

第一条命令只发送最小JSON请求；第二条会消耗实际ima只读额度，取得事实与最多6张候选图。密钥不要写到终端参数、聊天、Git、录屏或worker目录。无配置/权限、限流、模型超时/错误格式都明确失败，没有人工样稿回退。本次ima实际返回220021当日资料次数上限时，应用明确提示次日重试。

## 任务与修改

输入具体型号、人群、场景、平台与目标。信息不足时只补充必要字段。产品事实按所选模式从授权本地知识库或指定ima库读取；目录回退、分页和媒体headers访问保留第一阶段实测映射。当前原文支持UTF-8 Markdown/text；型号图片根据同目录CSV精确型号、文件名、尺寸与实际解码确定，不下载索引中的外部URL，不用重复图片凑数量。

正文引用、数值/条件、全部可见文案、图片及平台数量由代码检查，语义核验另发模型请求。资料冲突、无依据价格/体验、图片不足或模型失败会关闭完整成稿导出。来源面板显示必要摘录和可理解定位，原文/访问头/签名URL不下发。

任何稿件或任务修改都会撤销旧核验。保存后重新核验，换平台/场景需重新规划和生成；换型号清空证据。`重新取证并执行`按所选模式从本地文件或ima重新取证；`使用当前取证重新生成`允许复用同任务同型号24小时内的有效快照，逐图重新核对字节摘要，进度明确展示原取证时间及本次未再次访问ima。冲突/无事实/过期快照不复用；损坏图片直接阻断，不静默联网兜底。平台和场景变化后的新稿仍须独立核验，不能继承旧通过状态。

三平台仿真预览分别使用公众号长文内嵌图、小红书图集笔记、朋友圈动态版式，并明确未发布。

复制/下载均调用服务端导出接口，复核当前版本、内容/证据/策略/任务绑定及图片文件。导出包含标题、正文、CTA、图片说明/用途/来源/插入位置和引用依据；Markdown保留图片说明；HTML内嵌已核对图片且无脚本和外链，可离线审阅。海报导出尚未实现。

## 验证与私有证据

```sh
npm test
npm run typecheck
npm run build
```

隔离的synthetic HTTP验收（终端一）：

```sh
APP_ENABLE_SYNTHETIC=true APP_DATA_DIR=.local-data/stage2-acceptance npm start -- --port 3211
```

终端二：`npm run verify:business-http`。这会验证三平台本机接口、标题/图注修订失效、直接导出拒绝、受控图片及重验导出，明确不计G3。正常3210服务默认拒绝创建synthetic任务。`APP_TEST_URL`可指定另一回环端口。

真实完整取证任务可用 `APP_TEST_MODE=live APP_TEST_URL=http://127.0.0.1:3210 npm run verify:business-http`，会消耗ima和模型调用。已有同任务真实快照的连续改稿/平台场景对照：`APP_LIVE_RUN_ID=已有任务UUID npm run verify:live-controls`；脚本保留原取证时间并标注复用，不伪装新的连库调用。不要在额度耗尽时重复运行真实取证。

- `.local-data/runs/<runId>/`：私有运行、图片字节、原文/响应及每操作模型诊断；`.local-data/stage2-results/`：真实版本成稿与运行快照。文件0600、目录0700，Git忽略。
- `.local-evidence/stage2/`：测试、类型/构建、HTTP、live对照、安全扫描、浏览器与reviewer证据；本机文件，公开仅保留必要安全汇总。
- 接入契约1.0.0保留，新增业务契约2.1.0（兼容已保存2.0.0）见 [BUSINESS_API](docs/BUSINESS_API.md) 与 `src/contracts/business.ts`；模型只收必要支持事实和安全图片说明。
- `inputs/`、原始知识库、本机配置、vendor、worktree不随源码公开。`scripts/verify_safety.ts`可在已配置且启动3210后检查受版本控制文件、浏览器JS和安全DTO无当前凭证值。

接续先读 [AGENTS](AGENTS.md)、[STATUS](docs/STATUS.md)、[TASK_BOARD](docs/TASK_BOARD.md)、[DECISIONS](docs/DECISIONS.md)。本阶段主控先冻结契约，三个真实worker在独立worktree实现后逐个集成；只读review不代替 [第三阶段](prompts/03-review.md) 新上下文G4。尚未推送、公开部署或提交赛事材料。

本轮本地真实业务验收：`npm run verify:delivery`（实际调用模型，不调用ima）；证据写入`.local-evidence/delivery/`，成稿在`.local-data/delivery-results/`。正式赛事部署/提交/视频状态见[提交准备](docs/SUBMISSION.md)，不得把本地交付视为已参赛提交。
