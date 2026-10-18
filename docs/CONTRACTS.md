# 内部数据契约与状态流程

状态：基础接入1.0.0保留；完整营销运行业务2.1.0已实现，新增用户授权local来源并兼容已保存2.0.0。代码schema以src/contracts/index.ts与business.ts为准；历史冻结说明见第10节，当前local/HTML增量见文末。实际验证以STATUS为准。

## 1. 契约边界与修改责任

- `src/contracts/**` 是运行时代码契约的唯一来源，由主控维护。前端、后端和测试使用同一份类型及运行时校验，避免各复制一套接口结构。
- 本文给出领域含义、约束和投影边界。正式实现时先冻结代码 schema，再同步文档；不为未验证的 ima 字段编造响应。
- ima 原始返回经服务端适配器转换为下列结构。契约解析失败应显式报告 `PROVIDER_SCHEMA_UNRECOGNIZED`，不能吞掉异常后伪造空列表或成功状态。
- 时间使用 UTC ISO 8601；前端可按用户时区显示。`retrievedAt` 是本次抓取时间，不得冒充原文的更新时间。
- ID 使用项目生成的不透明标识。对外的 `runId`、`factId`、`imageId` 不等于 ima 的知识库、文件夹或媒体 ID；不透明 ID 也不能替代访问控制。
- 标记为“安全视图”的字段仍须按用户/任务权限访问。公开仓库、魔搭展示和录屏不能因此获得原始知识库资料的公开分发权。

### 数据暴露分级

| 分级 | 允许内容 | 禁止内容 |
| --- | --- | --- |
| 服务端私有 | 凭证引用、ima 内部 ID、原始响应、原文缓存、访问 headers、源 URL、字段映射和必要私有审计 | 不返回给浏览器；不打印到公共日志；不提交公开仓库 |
| 登录/评审权限内的安全视图 | 产品展示名、生成文案、来源标题与人类可读定位、事实对应的最小必要短摘录、受控图片预览、核验结果 | 完整 raw、认证 headers、签名/权限直链、完整原文、无关资料 |
| 可导出结果 | 当前核验通过的成稿、图片名称/来源说明/插入位置、必要限制条件和来源标签 | 密钥、内部 provider ID、私有素材下载地址、整库或完整原始资料 |

“可追溯”要求评委能把句子和图片对应到具体依据，不能只显示一个无内容编号。原始访问地址保留在服务端，可用受控访问提供必要核查；不把访问秘密嵌入 Markdown。[R1，第 5–7 页；R2]

## 2. `TaskBrief`：任务与补问信息

| 字段 | 类型/范围 | 说明与不变量 |
| --- | --- | --- |
| `taskId` | string | 项目内部任务 ID，可进入安全视图 |
| `briefVersion` | integer，递增 | 产品、人群、场景、平台或要求变化时递增 |
| `productRequest` | string | 用户原始产品描述，可能不完整；不是已确认型号 |
| `productSelection` | object 或 null | 见下表；未消歧时为空 |
| `targetAudience` | string 或 null | 目标人群；不能只由模型无说明地猜测 |
| `useScenario` | string 或 null | 开学、出差办公等本次场景 |
| `purchaseStage` | `exploring` / `comparing` / `ready_to_visit` / `unknown` | 需求阶段；可未知，若影响内容目标则补问 |
| `contentGoal` | string 或 null | 本次希望用户理解或采取的动作 |
| `platform` | `wechat_article` / `xiaohongshu` / `wechat_moments` 或 null | 首版只承诺这三个值；海报不在首版枚举中 |
| `requestedClaims` | string[] | 用户要求加入的表述，全部视为待查证请求，不是事实 |
| `constraints` | object | 长度偏好、必须避免的内容、语气偏好等；不能覆盖事实/合规约束 |
| `missingFields` | string[] | 当前缺少且影响执行的字段 |
| `clarifyingQuestions` | string[] | 可操作的少量问题，避免重复询问已经提供的信息 |
| `assumptions` | string[] | 不阻塞任务的显式假设；不能包含猜测的价格、参数或图片型号 |

`productSelection`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `productKey` | string | 项目内部统一产品键，主控依据真实资料确定构成 |
| `displayName` | string | 知识库支持的完整展示名 |
| `variant` | object | 与本次事实有关的年份、配置、版本等已确认属性；未知属性留空，不补默认值 |
| `resolutionBasis` | string | 来自用户明确选择、资料映射或人工确认的说明 |

## 3. `ContentStrategy`：内容策略

策略在取证前形成，因此不得在此阶段把“希望检索续航”写成“本机续航达到某数值”。取证后只选择有依据的方向。

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `strategyId` | string | 策略 ID |
| `briefVersion` | integer | 策略基于哪个任务版本 |
| `audienceProblem` | string | 最优先回应的实际问题 |
| `contentAngle` | string | 本次切入点；换场景应重新判断 |
| `priorityTopics` | `{ topic, rank, reason }[]` | 待验证的卖点方向与排序理由 |
| `retrievalQuestions` | string[] | 按型号组织的检索问题，不混入未验证结论 |
| `outline` | `{ blockKey, purpose }[]` | 段落目的，供后续正文及图片定位 |
| `tone` | string | 语气要求；不包含伪造亲测或用户评价 |
| `imagePlan` | `{ purpose, suggestedBlockKey }[]` | 所需图片的论证作用，不凭空声明已经找到素材 |
| `imageCountRange` | `{ min, max }` | 来自首版赛题平台配置，不由模型随意决定 |
| `callToActionGoal` | string | 咨询、了解适用性或到店体验等；无依据的门店信息不能编造 |
| `reasoningSummary` | string | 对策略选择的简短说明，不暴露模型内部推理链 |

平台数量表：`wechat_article` 为 2–4，`xiaohongshu` 为 3–6，`wechat_moments` 为 1–3。结构、语气、配图数量和行动引导都应随平台适配。[R1，第 4–5 页]

## 4. `ProductEvidence`：服务端事实包

该对象是服务端领域模型，不整包序列化给前端。仅把最终采用的事实与其安全来源视图投影出去。

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `evidenceSetId` | string | 本次取证快照 ID；核验报告必须绑定它 |
| `product` | `productSelection` 结构 | 该包针对的产品及配置 |
| `retrievedAt` | ISO 8601 | 取证时间；正式 live 演示应重新查询，不能把旧回放当最新资料 |
| `provenanceMode` | `synthetic` / `replay` / `live` | 取证模式，定义见验收文档；发生人工替换时不能保持 live 标签 |
| `sources` | `SourceRecord[]` | 私有来源记录 |
| `facts` | `FactPoint[]` | 已提取事实及其依据 |
| `conflicts` | object[] | 冲突事实、来源和条件；非空时停止当前成稿 |
| `coverageGaps` | string[] | 缺少的事实或材料；禁止由常识或外部网页补成产品结论 |
| `snapshotDigest` | string | 参与本次核验的内容摘要，用于发现证据变动；不是原网站版本号 |

`SourceRecord`（服务端私有）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sourceId` | string | 项目内部来源 ID |
| `provider` | 固定 `ima` | synthetic 样本另外由 `provenanceMode` 标识，不伪装真实取证 |
| `providerRefs` | object | 实际知识库、媒体、文件夹标识及必要类型信息；仅适配器读取 |
| `title` / `locator` | string | 标题及文档段落、表格行、页码或其他可复核定位 |
| `retrievedAt` / `contentDigest` | string | 本次内容的时间与摘要 |
| `access` | object | URL、访问 headers 或其他已验证读取方式；严格服务端私有 |
| `privateContentRef` | string 或 null | 必要原文/原始响应的受控位置；只保存有权限且必要的内容 |
| `sourceView` | `SourceView` | 明确白名单投影，不能通过展开原对象生成 |

`SourceView`（安全视图）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `citationKey` | string | 项目生成的可引用标识，不是 provider ID |
| `sourceTitle` | string | 安全的资料标题或图片名称 |
| `locatorLabel` | string | 人类可读的段落/表格/页码或目录名称，不含内部 ID |
| `supportingExcerpt` | string 或 null | 与被引用事实直接对应的必要短摘录；不复制完整原文 |
| `retrievedAt` | ISO 8601 | 依据的取证时间 |
| `reviewAccess` | `available` / `ima_client_required` / `unavailable` | 是否有权限内受控核查方式；不以假链接替代失败 |

`FactPoint`：

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `factId` | string | 用于把正文主张对应到证据 |
| `productKey` | string | 与被营销产品一致 |
| `fieldKey` | string | 如接口、重量、续航条件等内部事实类别；真实资料到位后确定 |
| `value` | string / number / boolean | 原资料能够支持的值；数值换算须可复核 |
| `unit` | string 或 null | 单位明确，不把不同量或单位混合 |
| `qualifiers` | string[] | 配置、测试条件、适用范围、限制等必要条件 |
| `supportedStatement` | string | 可以被正文使用的保守事实表述 |
| `sourceIds` | string[] | 必须非空并能够定位到已读取依据 |
| `status` | `supported` / `unconfirmed` / `conflicted` | 只有 `supported` 可进入生成上下文 |

## 5. `ImageAsset`：图片与型号依据

图片 URL 本身不是型号证明；目录关联、图片对应的资料或其他库内明确说明应形成证据。若一张图适用于多个配置，必须有资料支持这个适用范围，不能任意外推。

| 字段 | 类型/范围 | 暴露与说明 |
| --- | --- | --- |
| `imageId` | string | 安全的项目 ID |
| `sourceId` | string | 私有来源关系；前端使用其 `SourceView` |
| `productKey` | string | 本次归属的产品 |
| `applicableVariants` | string[] | 有资料支持的配置范围；未知不猜 |
| `sourceView` | `SourceView` | 图片名称、来源、定位和核查方式 |
| `privateMediaRef` | object | 原媒体 ID、URL、headers 等；服务端私有 |
| `availability` | `verified` / `unavailable` / `expired` / `unchecked` | 实际取到可解码图片才为 `verified`；API 的 code=0 不足以证明 |
| `modelMatch` | `confirmed` / `mismatch` / `uncertain` | 不把概率分数代替结论 |
| `modelMatchBasis` | object | 对应资料/事实引用，以及必要人工确认记录；安全摘要可展示 |
| `width` / `height` / `mimeType` | number / number / string | 来自实际文件检查，不预设接口一定返回 |
| `contentDigest` | string | 检查重复图片与文件变化；重复或同图裁切不用于凑配图数量 |
| `previewAssetKey` | string 或 null | 经权限检查的同源预览资源键；不能是 provider 签名直链 |
| `caption` / `purpose` | string | 图片说明及其支持的论点，不虚构图片中没有的信息 |
| `placement` | `{ blockKey, position }` | 绑定实际正文段落，位置可为段前/段后 |

候选图片不足时仍可记录取证进度，但不能把未达到平台数量的结果标成完整可导出成稿。首个接入门槛“一张图”与正式输出完整图数分别验收。[R1，第 4–5 页]

## 6. `RunResult`：运行状态、版本与结果

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `runId` | string | 一次运行；前端访问需校验归属 |
| `brief` | `TaskBrief` 安全字段 | 本次任务版本 |
| `state` | 见状态表 | 由服务端流程管理，不以模型自由文本决定 |
| `currentVersion` | integer，递增 | 任何影响成稿的变化都递增 |
| `strategy` | `ContentStrategy` 或 null | 本次策略 |
| `evidenceSetId` | string 或 null | 所用证据包的项目 ID |
| `draft` | `DraftContent` 或 null | 未核验稿应明确标记；冲突状态不交付当前成稿 |
| `validation` | `ValidationReport` 或 null | 当前/过去核验记录；前端必须识别是否过期 |
| `finalContent` | `DraftContent` 或 null | 只有当前版本通过核验时存在 |
| `issues` | `ValidationIssue[]` | 具体问题及解决方向 |
| `exportable` | boolean | 服务端计算；不能由浏览器传 true 决定 |
| `stageSummary` | object[] | 脱敏步骤、时间、结果；不包含 raw、headers 或密钥 |
| `executionEvidence` | object | 取证模式、模型调用是否真实、是否人工替换等；不能用一个模糊的“已实测”覆盖各组件 |

`DraftContent`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | integer | 与 `currentVersion` 对齐 |
| `title` / `lead` | string | 标题、导语；平台不需要独立导语时可为空并在呈现时合并 |
| `bodyBlocks` | `{ blockKey, text, factIds }[]` | 正文及事实引用；标题、导语、CTA、标签和图片说明中的事实也必须纳入核验 |
| `callToAction` | string | 行动引导；门店、活动、权益信息有依据才写 |
| `tags` | string[] | 平台需要时生成；标签中的性能或荣誉主张也不能绕开事实检查 |
| `selectedImages` | `{ imageId, caption, placement }[]` | 引用已验证素材并确定编排，不复制私有图片地址 |
| `contentDigest` | string | 覆盖全部可见文案、图片选择与说明、顺序及位置的规范化摘要 |

`ValidationReport`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `checkedVersion` | integer | 本次核验的精确版本 |
| `checkedContentDigest` | string | 核验对应的内容摘要 |
| `checkedEvidenceSetId` | string | 核验所用依据快照 |
| `checkedStrategyId` / `checkedBriefVersion` | string / integer | 防止换平台、换场景后重用旧结论 |
| `status` | `passed` / `failed` / `stale` | 失效后必须重新核验 |
| `checks` | object[] | 事实、型号、图片、数量、平台结构、文案风险等各检查的状态及摘要 |
| `issues` | `ValidationIssue[]` | 不以“整体通过”掩盖未检查项 |
| `checkedAt` | ISO 8601 | 检查时间 |

### 状态与允许动作

| 状态 | 含义 | 允许下一步 | 可导出成稿 |
| --- | --- | --- | --- |
| `draft` | 接收输入 | `needs_input` 或 `planning` | 否 |
| `needs_input` | 关键条件不足/型号待选择 | 补齐后 `planning` | 否 |
| `planning` | 生成可解释策略 | `retrieving` | 否 |
| `retrieving` | 查询、分页回退、读取原文及图片 | `evidence_ready`、`blocked` 或 `failed` | 否 |
| `evidence_ready` | 型号、事实及满足平台要求的图片准备好 | `generating` | 否 |
| `generating` | 从已支持证据生成草稿 | `validating` | 否 |
| `validating` | 独立检查精确版本 | `ready`、`needs_revision`、`blocked` 或 `failed` | 否 |
| `needs_revision` | 有可修复问题 | 修改后 `validating`；重新生成时先 `generating` | 否 |
| `blocked` | 资料冲突、型号/素材依据不足等 | 解决原因后回到取证或补问；不直接跳到 ready | 否 |
| `failed` | 技术错误、接口结构无法识别等 | 明确原因并从相应步骤重试 | 否 |
| `ready` | 当前版本全部必需检查通过 | 导出；修改后进入相应步骤并立即失效验证 | 是，仍须服务端复核 |

解析追问 → 策略 → 检索 → 事实/图片包 → 图文生成 → 独立核验 → 成稿导出是固定业务顺序。用户仅修改文字时可复用仍有效的证据包，但必须重新做完整的当前稿核验；产品、平台或场景变化时从解析/策略重新进入，必要时重新取证。

服务端开放成稿导出必须同时满足：`state=ready`、`validation.status=passed`、核验版本/摘要/证据包/策略/任务版本全部匹配、无未解决的阻塞或错误、图片数量与型号一致、当前素材仍可用。更新版本时原子地撤销可导出状态；异步任务回写时比对任务和内容版本，丢弃过期结果。

## 7. `ValidationIssue`：可执行的问题记录

| 字段 | 类型/范围 | 说明 |
| --- | --- | --- |
| `issueId` | string | 项目问题 ID |
| `code` | string 枚举 | 见下表；接口错误与内容错误分别编码 |
| `severity` | `blocker` / `error` / `warning` | blocker/error 未解决时不能导出；warning 也不能承载未证实事实 |
| `category` | `input` / `fact` / `image` / `platform` / `compliance` / `access` / `version` / `system` | 问题归属 |
| `location` | object | 对应字段、正文块、图片或来源安全标识 |
| `message` | string | 什么问题、为什么阻塞；不泄露 provider 机密 |
| `evidenceKeys` | string[] | 可核查的安全来源标识；无依据就明确为空 |
| `resolution` | `clarify` / `retrieve` / `remove` / `rewrite` / `human_confirm` / `retry` | 建议采取的动作 |
| `status` | `open` / `resolved` | 解决后保留记录；修复稿仍需重验 |

| 建议错误码 | 预期处理 |
| --- | --- |
| `MISSING_INPUT` / `MODEL_AMBIGUOUS` | 精准补问，显示候选及区别 |
| `UNSUPPORTED_CLAIM` / `UNSUPPORTED_PRICE_OR_BENEFIT` | 删除或提供有依据的替代表述；不写入成稿 |
| `SOURCE_CONFLICT` | 停止当前成稿，列出冲突与条件，人工确认 |
| `MODEL_PARAMETER_MISMATCH` / `IMAGE_MODEL_MISMATCH` | 拒绝错配，重新取证或换图 |
| `IMAGE_MODEL_UNCONFIRMED` / `INSUFFICIENT_IMAGES` | 保留取证进度，不能标完整成稿 |
| `MEDIA_UNAVAILABLE` / `PERMISSION_UNCONFIRMED` | 如实报告访问状态；必要时提示 ima 客户端核查 |
| `PLATFORM_ADAPTATION_INCOMPLETE` | 调整结构、语气、配图、CTA，再核验 |
| `PROHIBITED_MARKETING_CLAIM` | 删除绝对化、虚假承诺、无依据对比或竞品贬低等表述 |
| `PROVIDER_SCHEMA_UNRECOGNIZED` | 保存私有脱敏诊断，主控修正适配；不伪装为空结果 |
| `STALE_VALIDATION` / `STALE_ASYNC_RESULT` | 禁止导出或丢弃过期回写，对最新版本重验 |

## 8. ima 适配器的待冻结事项

这里只登记真实接入要解决的问题，不定义或发明 provider 返回字段。[R1，第 7 页；R2]

| 观察到的资料差异/边界 | 首次真实接入必须记录 |
| --- | --- |
| 手册样例为 `kb_id` / `kb_name`，官方静态参考为 `id` / `name` | 实际知识库搜索响应的结构、字段路径、字段映射；缺失或同时冲突时明确失败 |
| 官方参考区分条目的 `media_id`、文件夹的 `folder_id` 与 `current_path`；操作指南又说明从搜索命中文件夹取 `media_id` | 根目录、子目录、搜索命中文件夹各取一个真实样本，分别映射，不盲目任选非空 ID |
| 列表存在 `is_end` / `next_cursor` | 真实分页终止条件；防重复游标和无限遍历；到达本地预算时说明未遍历完 |
| 搜索为空须目录回退 | 回退步骤记录、产品参数目录及具体型号原文定位；不把空结果等同无权限 |
| `get_media_info` 成功也可能无 `url_info` | 区分 URL＋headers、笔记、无链接、链接访问失败；保留可验证的解析分支 |
| 图片 URL 不等于图片内容或型号证据 | 实际读取可解码文件、来源对应关系、型号适用范围与可展示方式 |
| 未证明昵称/当前用户信息接口 | 分开记录凭证配置、目标库可读、客户端同账号确认和身份查询未验证状态 |

## 9. 冻结清单

主控在主对话一结束前记录：真实样本的模式和日期、适配字段路径、不可访问媒体如何处理、图片型号如何证明、最小安全视图、平台数量规则、状态及版本行为、原文与图片接入证据。拿不到的能力保持待确认，不把本文类型表当作实现证明。

## 来源

- **R1**：用户提供《华为·产业进阶赛道·赛题手册v4(1).pdf》，第 4–5 页平台、输出和冲突处理，第 6–7 页接入与安全，第 9 页扣分及统一任务。
- **R2**：[ima 官方 Skill 1.1.10 下载包](https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip)，包内 `knowledge-base/references/api.md` 的数据结构、知识库搜索/列表、媒体信息章节及 `knowledge-base/SKILL.md` 的文件夹、原文访问和展示规则。仅完成静态核对；内部字段、状态与版本设计由本项目提出。


## 10. 第一阶段历史冻结记录（2026-10-18，当时状态）

版本：`1.0.0`。已实现：模式/状态/错误、ProductSelection、SourceView、FactPoint、ImageView、TaskBrief、ContentStrategy、RunState 枚举、ProbeInput、ProbeStage、ProbeReport。接入报告额外绑定 `product`（包含实际系统版本），安全 ImageView 包含 `fileName`；PASS 要求七步均实际执行且通过、真实来源和可解码型号图片存在、图片与产品键一致。完整 RunResult / DraftContent / ValidationReport / ProductEvidence 的运行实现仍属阶段二，主控须先按本文补齐相应代码 schema 和 HTTP 端点，再分发依赖该部分的 worker。

已固定的 HTTP 边界：`GET /api/health`、`GET/POST /api/connection`、`GET /api/assets/[imageId]`。POST 仅接受严格 `{ productName: string }`，输出严格安全 ProbeReport；图片仅允许最新报告关联的内部 UUID，同源本机访问并复核文件摘要。raw、provider ID、访问 URL/headers 与完整原文不进入响应。域名/路径、凭证及缓存均只在服务端。

| 实测 | Adapter 规则及边界 |
| --- | --- |
| 库搜索返回 `kb_id/kb_name` | 精确匹配指定名称；兼容有文档依据的 `id/name`，同时冲突即失败 |
| 根目录为同名包装文件夹 | 展开实际文件夹，之后限定 P1；不扫描其它库正文 |
| 目录及搜索文件夹为 `media_id/title/media_type=99` | 已真实打开并与返回的 `current_path[].folder_id` 核对一致；FolderInfo 的 folder_id/name 另行归一化 |
| get_knowledge_list 有 is_end/next_cursor/current_path | 布尔分页、重复游标/预算保护；面包屑不当作条目列表 |
| search_knowledge 样本只有 info_list | 仅该方法接受缺少两个分页字段的单响应形式；不声称搜索穷尽全库；字段半缺失仍失败 |
| 同名型号命中多个业务板块 | 通过包装目录/P1/系统目录精确定位，不盲选首个搜索结果；空搜索也走该回退路径 |
| 实际文章为 产品事实.md | 原文标题明确为 HUAWEI MateBook 14（鸿蒙版） - 产品事实；只解析该明确编辑后缀及显式系统限定，不把 Pro/年份等相近型号混入 |
| 原文无内嵌图片 | 读取同型号目录的图片索引.csv；按产品型号精确匹配，单独从 images 目录取同名 ima 媒体；索引外部 URL 不下载 |
| 图片索引含 BOM、文件名/产品型号/宽高/说明等 | 专用 CSV parser 校验结构、型号、重复记录、路径和尺寸；实际图片 type=9，完整解码与尺寸比对后才 verified |
| 成功原件访问需要 URL+headers | 请求只来自服务端真实访问方式；限制公网媒体域名、协议、体积、MIME和重定向，不附加 ima 主凭证 |

样本来源、时间、安全结果及证据路径统一见 `docs/evidence/foundation-2026-10-18.json` 和 `docs/STATUS.md`。完整原文、图片索引、图片及真实 raw 仅留忽略的私有目录。本次通过不证明所有型号、笔记、内嵌图分支或未来协议均已验证。

## 11. 第二阶段增量（2026-10-18）

新增业务2.0.0与接入1.0.0并存，不改ProbeReport边界。实际业务schema、公共函数签名与端点见src/contracts/business.ts及docs/BUSINESS_API.md；canonical摘要见digests.ts。运行快照只包含安全视图，SourceDocument/媒体bytes与访问引用均为私有服务端结构。规则核验和独立语义核验绑定当前任务版本、稿摘要、证据ID/摘要、策略ID/摘要。220021当日额度映射既有RATE_LIMITED，使用固定次日提示，未知错误仍不冒充空资料。

## 交付补充：业务 2.1.0 / local 来源

基础接入 1.0.0 不变。业务新增 mode=local，默认创建 local；live/synthetic 兼容。RunResult 解析旧 2.0.0 并归一为 2.1.0；旧证据摘要不改写。ProductEvidence.provenanceMode、executionEvidence.retrievalMode、ExportResponse.provenanceMode 支持 local，模型 generationMode/semanticMode 仍须为 live，禁止 local 用人工模型通过导出。资料 local 不等于 ima live。

LocalSourceOptions={rootDir?:string} 仅服务端；默认 rootDir 为 LOCAL_KB_ROOT 或主目录/华为PC全板块深度知识库_v7。请求不能指定文件路径。src/server/ima/local.ts 导出 retrieveLocalEvidence(request:RetrievalRequest,services:RetrievalServices,options?:LocalSourceOptions):Promise<RetrievalResult> 和 readLocalCatalog(options?:LocalSourceOptions):Promise<LocalCatalog>。catalog 格式见 src/contracts/business.ts。

只读扫描 P1-产品参数库/01-鸿蒙电脑 与 02-MateBook-Windows 各产品目录的 产品事实.md、图片索引.csv 和原件；忽略扩展营销/竞品文案。H1 精确具体型号、CSV 产品型号与文件名/真实解码摘要共同构成图片依据。拒绝目录越界与符号链接外逃，不取 CSV 外链；不重复图凑数。安全视图只包含相对定位和短摘录，完整原文私存。local 路径中 callIma/fetchMedia 明确拒绝，实际模型留服务端。

DraftPreview 新增可选 platform（默认 wechat_article 兼容旧调用），按当前草稿渲染模拟视图；平台切换仍走 input 修订/重生成，不通过切换预览冒充适配成稿。仿真界面明确未发布，无虚构阅读/点赞/亲测数据。

导出格式新增 html，保持 ExportResponse 包装。服务端在同一 canExport 及版本重查门槛下，将当前选图原件内嵌 data:image/png|jpeg|webp|gif;base64，无外链与脚本，所有用户/模型文本HTML转义。离线文件可直接打开，显示平台模拟与来源模式。此为兼容新增格式，Markdown/text不变。
