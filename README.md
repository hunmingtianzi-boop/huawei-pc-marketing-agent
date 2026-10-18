# 华为 PC 营销智能体

当前阶段：第一阶段基础工程已实现，**G1 真实接入仍为 BLOCKED**（本机未配置 ima 凭证）。契约版本 `0.1.0-provisional`，不能把 synthetic 测试或本地资料当作真实连库通过。实际进度、证据和接续步骤见 [docs/STATUS.md](docs/STATUS.md)。

## 本机运行

本次实测：macOS 27.0.1 arm64、Node 26.0.0、npm 11.12.1。依赖锁定 Next.js 16.4.2、React 19.3.1、TypeScript 5.9.3；运行时最低 Node 20.9（[Next.js 官方安装要求](https://nextjs.org/docs/app/getting-started/installation)）。推荐使用 `.nvmrc` 对齐本次环境。只维护 `package-lock.json`。

```sh
npm ci
npm run dev -- --port 3210
```

访问 [本机工作台](http://127.0.0.1:3210)。页面可输入完整产品型号、执行真实只读接入检查，并查看逐步结果。内容生成、改稿和导出属于下一阶段，当前没有成稿功能。

```sh
npm run typecheck
npm test
npm run build
npm run start -- --port 3210
```

生产服务启动后，另一终端运行 `npm run verify:http`。默认检查 `http://127.0.0.1:3210`；可用非敏感的 `APP_TEST_URL` 指定其他本机端口。健康接口为 `GET /api/health`；连接状态 `GET /api/connection`，同源只读探测 `POST /api/connection`（JSON：`{"productName":"完整型号名"}`）。图片仅通过当前报告关联的 `/api/assets/<项目图片标识>` 访问。

本阶段是绑定回环地址的本机单用户应用。尚未实现公网身份认证、多用户权限、共享存储或云部署；当前的 Host/Origin 检查不能代替这些能力。不要把本机预览直接当作已完成的公开服务。

## 配置 ima（密钥只在本机填写）

1. 用同一 ima 账号加入手册指定的 **任德耀新建华为PC知识库**。本地 `华为PC全板块深度知识库_v7/` 不是本次 live 调用的替代来源。
2. 在 [ima 官方凭证页面](https://ima.qq.com/agent-interface) 获取凭证，在项目被忽略的 `.env.local` 中自行填写 `IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY`。不要粘贴到聊天、终端参数或 Git。此工作区已生成权限为 0600 的空模板；新机器可 `cp -n .env.example .env.local` 后 `chmod 600 .env.local`。
3. 运行 `python3 scripts/setup_ima.py` 下载并校验手册指定的官方 1.1.10 完整 Skill 到忽略的 `vendor/ima-skill/`。脚本校验固定 SHA-256、展开体积、路径与符号链接；已有目录保留不覆盖。该命令不调用认证 API。本次官方包实际下载与哈希已核对；不表示已确认它是最新版本。
4. 默认使用 `vendor/ima-skill/ima_api.cjs`；若使用另一个已审阅的官方完整目录，在 `.env.local` 的 `IMA_SKILL_PATH` 填其 `ima_api.cjs` 路径。不能只复制一个 CJS 文件，目录需要元数据和参考文档。
5. 填写后运行以下命令。CLI 每次加载 `.env.local`；页面服务需重启才能读取新配置。

```sh
npm run verify:ima -- 'HUAWEI MateBook 14'
```

上面的型号是探测请求，不表示已验证此型号存在。以指定库实际型号为准。退出码：`0=PASS`、`2=BLOCKED`、`1=FAIL/输入错误`。每次报告包括 `mode`、逐步 `executed/status`、账号身份未验证状态和安全来源视图。缺凭证时不发知识库请求，下游标为未执行。

已支持对 `IMA_CLIENT_ID/IMA_API_KEY` 旧别名进行完整性及冲突检测；有冲突时停止，不能混用。不会兜底翻读官方历史凭证文件。SDK 子进程只接收选定凭证对和必要环境，固定 `https://ima.qq.com`、阻止认证请求重定向、设置超时并隔离远端更新指令。

当前 Adapter 只有四个只读 wiki 接口：库搜索、目录列表、资料搜索、媒体访问。笔记分支明确 BLOCKED，不调用笔记写入或扫描私人笔记。已知字段别名冲突、未知协议、无权限、频控、网络、更新、无原文、图片不足各有独立错误，不伪装成空列表。

当前原文解析限 UTF-8 文本/Markdown；产品文章需为 `article.md`，一级标题与输入型号完全一致。图片只接受已核对文章中以完整型号作为 alt 的相对路径引用，且媒体为图片类型、实际内容可解码；不通过文件名猜型号。媒体主机仅允许经公网地址检查的 `qq.com/qpic.cn/myqcloud.com` 及子域；重定向不跟随。其它真实格式、目录别名或主机须先取样、审阅并补测试，不能直接扩宽权限来声称兼容。

## 数据、测试与交接

- `.local-data/probes/<reportId>/`：私有报告、必要原文/图片、原始响应和字段结构；`.local-data/latest-probe.json` 为最新安全报告。默认目录被忽略。若自行改 `APP_DATA_DIR`，必须放在私有且不入库的位置。
- `.local-evidence/foundation/`：构建、测试、HTTP 检查、浏览器截图；`.local-evidence/ima-research/` 与 `.local-evidence/reviewer/` 为本次真实子任务调查与评审证据。它们只在本机，不包含在公开源码包。
- `tests/ima/`、`tests/contracts/`：全部明确标注 synthetic，不代表 live ima 或实际图片已通过。正式 live 的门槛仍是指定库、一份原文、一张型号有据可解码图片。
- `src/contracts/index.ts` 是已实现的暂定 schema。外部协议映射仍未冻结；完整运行、事实冲突、修订失效和成稿导出将在第二阶段实现。
- `inputs/`、现有完整知识库和设计参考均保留在本机并被忽略，不随源码公开。
- 运行时模型变量 `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL` 仅保留服务端配置位置，当前没有模型调用实现或验证。

主控规则见 [AGENTS.md](AGENTS.md)。任务入口依次为 [第一阶段](prompts/01-foundation.md)、[第二阶段](prompts/02-build.md)、[第三阶段](prompts/03-review.md)。同一阶段一个主控、最多三个子智能体；并行编码前必须有真实基线及不同 worktree。本阶段两个子任务仅只读调查，只有主控写代码。

接续前先读 `docs/STATUS.md`、`docs/TASK_BOARD.md`、`docs/DECISIONS.md`。先解除 G1 阻塞、复核真实字段、冻结契约，再开始依赖该契约的并行完整实现；不得自动把本阶段基础工程记为完整营销流程。
