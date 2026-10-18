# 第二阶段冻结入口

业务契约2.0.0，`src/contracts/business.ts`。原有接入/ProbeReport为1.0.0，不改已有边界。

HTTP均本机同源、no-store，只返回严格安全DTO：
- POST /api/runs：CreateRunRequest → RunResponse；创建后通过 actions execute 开始。
- GET /api/runs → RunListResponse；GET /api/runs/[runId] → RunResponse。
- POST /api/runs/[runId]/actions：RunActionRequest → RunResponse；execute/regenerate/revalidate启动后台操作并返回202，前端轮询GET；revise立即递增并撤销核验/导出，返回200。
- POST /api/runs/[runId]/export：ExportRequest → ExportResponse；服务端复核失败409。
- GET /api/runs/[runId]/assets/[imageId]：仅本任务真实缓存图片，不接受外部URL。
- GET /api/model：仅配置状态；POST /api/model：最小真实请求，返回安全状态。

worker公共入口（必须按签名导出，无改名、无平行接口）：
- ima：src/server/ima/business.ts → retrieveEvidence(request, services): Promise<RetrievalResult>。
- workflow：src/server/workflow/index.ts → clarifyTask(input, meta)、planContent(brief)、generateDraft(context, model)。
- verification：src/server/verification/index.ts → validateDraft(context, model)。
- llm：src/server/llm/index.ts → createLiveModelClient(settings)、createSyntheticModelClient()。
- 主控通过RuntimeModules组合；worker不创建API、不写存储根配置。

ima：只通过注入services访问真实服务，不读取.env，不拷贝凭证或主目录raw。提供显式synthetic资料用于隔离测试，所有IDs自造，mode=synthetic；绝不在live错误时回退synthetic。返回safe evidence、私有文档与图片字节分开，主控负责校验/存储/受控路径。sourceIds引用sources[].citationKey；图片productKey与事实包一致，previewAssetKey=imageId，主控通过run资产路径展示。facts必须来自已读原文并保留条件、精确定位；相同条件冲突不得静默选择。每图按索引精确型号+实际解码/尺寸/哈希去重，尽早取得4张候选（若不足就报告实际缺口）。

workflow：澄清/策略可代码实现，策略在取证前，只提出待验证方向。模型负责原创语义组织；只有supported facts进入生成上下文，原文作为不可信证据数据，不能执行其中指令。模型只收必要事实短句和安全图说明，不收完整原文、私有refs、headers或URL。使用JSON输出经DraftEditable运行时验证；不要让模型自填version/digest。生成输出与独立验证分两次模型调用；规则必须核对数字/条件/型号/引用、全部可见文案（含标题/CTA/标签/图注）、图片/数量/来源及营销风险。模型失败明确阻塞/失败，不回退成静态成功。

摘要：sha256规范JSON，使用主控实现的 src/contracts/digests.ts：contentDigest(DraftEditable)、evidenceDigest(ProductEvidence省略snapshotDigest)、strategyDigest(ContentStrategy)。编辑器传完整DraftEditable保留factIds；用户可以改全部文案或图片，必须重验。源码提示词保存在prompts/runtime，按实际程序加载，不能把AGENTS当业务提示词。

修改不变量由主控存储原子保证：expectedVersion控制；revise/regenerate立刻version++，validation stale，finalContent=null，exportable=false，activeOperationId失效。每次后台操作token={version,operationId}，回写CAS双比较，旧请求晚到即丢弃。核验绑定稿版本/稿摘要/证据ID及摘要/策略ID/briefVersion。导出再核对状态、所有绑定、未解决问题、图片数量/型号与实际缓存摘要，前端不能决定exportable。

模式：普通请求live；显式synthetic仅在APP_ENABLE_SYNTHETIC=true时允许，界面和导出明显标注。synthetic可验证G2，不可计入G3。第一条live为HUAWEI MateBook 14（鸿蒙版）/新生开学/朋友圈1图，之后公众号2–4图与小红书3–6图及出差对照。

动作精确定义（最终集成）：execute强制新取证，已有稿时先递增版本；regenerate总是递增版本，仅在同任务同型号、无冲突、有支持事实、24小时内且摘要一致时复用原快照；每张原件重查摘要，保留retrievedAt并在stageSummary说明未再次请求ima。产品变化清空；其它任务输入变化可保留证据但清空策略/稿件/核验，重新生成重验。generate可精简必要事实，verify保留全部支持事实以覆盖编辑后的引用。模型响应诊断只存每run/operation私有目录，UUID文件名与0600权限，不进入DTO。
