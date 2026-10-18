"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { IMAGE_COUNTS, type SourceView } from "@/contracts";
import { DraftEditable, ExportResponse, RunActionRequest, RunListResponse, RunResponse, TaskInput, type RunResult, type ValidationIssue } from "@/contracts/business";
import DraftPreview from "./draft-preview";
import { canRequestExport, DEFAULT_INPUT, editableDraft, mayAcceptSnapshot, moveSelectedImage } from "./workbench-state";

const platforms = { wechat_moments: "朋友圈", wechat_article: "公众号", xiaohongshu: "小红书" } as const;
const states: Record<RunResult["state"], string> = { draft: "等待执行", needs_input: "需要补充信息", planning: "形成策略中", retrieving: "读取 ima 资料中", evidence_ready: "事实包已就绪", generating: "模型生成中", validating: "核验当前稿中", needs_revision: "需要修改", blocked: "执行受阻", failed: "执行失败", ready: "当前版本已就绪" };
const stageLabels: Record<string, string> = { planning: "策略", retrieving: "ima 取证", generating: "图文生成", validating: "核验", ready: "成稿", clarify: "必要澄清", revision: "修改" };
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(response.status, data?.error?.message || `请求未完成（HTTP ${response.status}）`);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("服务响应不符合业务契约，已停止使用该结果。请检查服务端版本。");
  return parsed.data;
}
function Source({ source }: { source: SourceView }) {
  return <div className="source"><strong>{source.sourceTitle}</strong><span>{source.locatorLabel}</span>{source.supportingExcerpt && <blockquote>{source.supportingExcerpt}</blockquote>}<small>{source.reviewAccess === "ima_client_required" ? "完整材料请在 ima 客户端核查" : source.reviewAccess === "unavailable" ? "来源当前不可访问" : "已读取安全来源摘要"}</small></div>;
}
function Issues({ issues }: { issues: ValidationIssue[] }) {
  return <ul className="issues">{issues.map(issue => <li key={issue.issueId} className={issue.severity === "warning" ? "warning" : "error"}><strong>{issue.code} · {issue.status === "resolved" ? "已处理" : "待处理"}</strong><p>{issue.message}</p>{issue.location && <small>位置：{issue.location}</small>}</li>)}</ul>;
}
export default function MarketingWorkbench() {
  const [run, setRun] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);
  const [input, setInput] = useState<TaskInput>({ ...DEFAULT_INPUT });
  const [draft, setDraft] = useState<DraftEditable | null>(null);
  const [mode, setMode] = useState<"live" | "synthetic" | "local">("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inputDirty, setInputDirty] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [assetErrors, setAssetErrors] = useState<string[]>([]);
  const [exported, setExported] = useState<z.infer<typeof ExportResponse> | null>(null);
  const current = useRef<RunResult | null>(null);
  const selectedId = useRef("");
  const dirtyRef = useRef({ input: false, draft: false });
  const pending = useRef(false);
  const revisionEpoch = useRef(0);
  const requestEpoch = useRef(0);
  function accept(next: RunResult, reset = false) {
    if (!mayAcceptSnapshot(current.current, next, selectedId.current)) return;
    current.current = next; setRun(next);
    if (reset || !dirtyRef.current.input) setInput(next.input);
    if (reset || !dirtyRef.current.draft) setDraft(editableDraft(next));
    if (reset) { dirtyRef.current = { input: false, draft: false }; setInputDirty(false); setDraftDirty(false); setExported(null); }
    setHistory(items => [next, ...items.filter(item => item.runId !== next.runId)].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }
  useEffect(() => {
    let mounted = true;
    request("/api/runs", RunListResponse).then(data => { if (mounted) setHistory(data.runs); }).catch(err => { if (mounted) setError(err instanceof Error ? err.message : "无法读取运行记录"); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!run?.activeOperationId) return;
    const id = run.runId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const epoch = requestEpoch.current;
        const data = await request(`/api/runs/${id}`, RunResponse);
        if (cancelled || selectedId.current !== id) return;
        if (epoch === requestEpoch.current) accept(data.run);
        if (current.current?.activeOperationId) timer = setTimeout(poll, 1200);
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "读取运行状态失败"); timer = setTimeout(poll, 3000); }
      }
    }
    timer = setTimeout(poll, 800);
    return () => { cancelled = true; clearTimeout(timer); };
    // The polling response is accepted through refs; it must not reset unsaved editing.
  }, [run?.runId, run?.activeOperationId]);
  function changeInput<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setInput(previous => ({ ...previous, [key]: value }));
    dirtyRef.current.input = true; setInputDirty(true); setExported(null); revisionEpoch.current++;
  }
  function changeDraft(next: DraftEditable) {
    setDraft(next); dirtyRef.current.draft = true; setDraftDirty(true); setExported(null); revisionEpoch.current++;
  }
  async function handleError(err: unknown, id?: string) {
    setError(err instanceof Error ? err.message : "请求未完成，请重试。");
    if (err instanceof RequestError && err.status === 409 && id && selectedId.current === id) {
      try { const latest = await request(`/api/runs/${id}`, RunResponse); accept(latest.run, true); setNotice("版本发生变化，已载入服务端最新稿。请在最新版本上重新编辑或执行。"); } catch { setNotice("版本冲突，请重新选择运行记录加载最新版本。"); }
    }
  }
  async function loadRun(id: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    const ticket = ++requestEpoch.current; selectedId.current = id; current.current = null;
    try { const data = await request(`/api/runs/${id}`, RunResponse); if (ticket === requestEpoch.current) { accept(data.run, true); setMode(data.run.mode); } } catch (err) { await handleError(err, id); }
    finally { pending.current = false; setBusy(false); }
  }
  async function action(actionName: "execute" | "regenerate" | "revalidate" | "revise", patch?: { input?: TaskInput; draft?: DraftEditable }) {
    const active = current.current;
    if (!active || pending.current) return null;
    pending.current = true; setBusy(true); setError(""); setNotice(""); setExported(null);
    const ticket = ++requestEpoch.current;
    const editEpoch = revisionEpoch.current;
    try {
      const body = RunActionRequest.parse({ action: actionName, expectedVersion: active.currentVersion, ...(actionName === "revise" ? { patch } : {}) });
      const data = await request(`/api/runs/${active.runId}/actions`, RunResponse, body);
      if (ticket === requestEpoch.current && selectedId.current === active.runId) {
        accept(data.run, actionName === "revise" && editEpoch === revisionEpoch.current);
        if (actionName === "revise") setNotice("修改已保存。旧核验已失效；请重新执行任务或重新核验当前稿。");
      }
      return data.run;
    } catch (err) { await handleError(err, active.runId); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function submitInput(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return;
    const parsed = TaskInput.safeParse(input);
    if (!parsed.success) { setError("输入超出允许长度或格式，请检查任务字段。"); return; }
    if (run) { const next = await action("revise", { input: parsed.data }); if (next) await action(next.evidence ? "regenerate" : "execute"); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    const editEpoch = revisionEpoch.current;
    try {
      const data = await request("/api/runs", RunResponse, { input: parsed.data, mode });
      selectedId.current = data.run.runId; current.current = null; accept(data.run, editEpoch === revisionEpoch.current);
      pending.current = false; setBusy(false);
      await action("execute");
    } catch (err) { await handleError(err); }
    finally { pending.current = false; setBusy(false); }
  }
  function newTask() {
    if (pending.current) return;
    requestEpoch.current++; revisionEpoch.current++; selectedId.current = ""; current.current = null;
    setRun(null); setDraft(null); setExported(null); setError(""); setNotice("");
    dirtyRef.current = { input: false, draft: false }; setInputDirty(false); setDraftDirty(false);
  }
  async function exportContent(copy: boolean) {
    const active = current.current;
    if (!active || !canRequestExport(active, inputDirty || draftDirty || selectedAssetFailed, busy)) return;
    const epoch = revisionEpoch.current;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(`/api/runs/${active.runId}/export`, ExportResponse, { expectedVersion: active.currentVersion, format: copy ? "text" : "markdown" });
      if (epoch !== revisionEpoch.current || selectedId.current !== active.runId || current.current?.currentVersion !== data.version) { setNotice("内容已发生变化，本次旧版本导出已丢弃。请保存并重新核验。"); return; }
      setExported(data);
      if (copy) { await navigator.clipboard.writeText(data.content); setNotice(`已复制服务端复核通过的第 ${data.version} 版（${data.provenanceMode}）。`); }
      else {
        const url = URL.createObjectURL(new Blob([data.content], { type: data.mimeType }));
        const link = document.createElement("a"); link.href = url; link.download = data.fileName; link.click(); URL.revokeObjectURL(url);
        setNotice(`已导出服务端复核通过的第 ${data.version} 版；文件包含图片说明、位置与来源。`);
      }
    } catch (err) { await handleError(err, active.runId); }
    finally { pending.current = false; setBusy(false); }
  }
  const dirty = inputDirty || draftDirty;
  const selectedAssetFailed = !!draft?.selectedImages.some(image => assetErrors.includes(`${run?.runId}/${image.imageId}`));
  const exportAllowed = canRequestExport(run, dirty || selectedAssetFailed, busy);
  const imageRange = input.platform ? IMAGE_COUNTS[input.platform] : null;
  const uniqueIssues = [...(run?.issues ?? []), ...(run?.validation?.issues ?? [])].filter((issue, index, items) => items.findIndex(other => other.issueId === issue.issueId) === index);
  return <div className="marketing-workbench">
    <section className="workspace" aria-labelledby="task-title">
      <div className="panel-head"><div><p className="eyebrow">01 / 任务</p><h2 id="task-title">给这次表达一个方向</h2></div><button type="button" className="secondary" onClick={newTask} disabled={busy}>新任务</button></div>
      <div className="history-row"><label htmlFor="run-history">运行记录</label><select id="run-history" disabled={busy} value={run?.runId ?? ""} onChange={event => { if (event.target.value) void loadRun(event.target.value); }}><option value="">当前新任务</option>{history.map(item => <option key={item.runId} value={item.runId}>{item.input.productRequest ?? "待明确产品"} · {item.input.platform ? platforms[item.input.platform] : "待选平台"} · {item.input.useScenario ?? "待补场景"} · v{item.currentVersion} · {item.mode}</option>)}</select></div>
      <form onSubmit={submitInput} className="task-form">
        <div className="form-grid">
          <label className="wide">完整产品型号<input value={input.productRequest ?? ""} maxLength={180} onChange={e => changeInput("productRequest", e.target.value.trim() ? e.target.value : null)} placeholder="填写知识库中的完整型号；不确定可留空澄清" /></label>
          <label>目标人群<input value={input.targetAudience ?? ""} maxLength={200} onChange={e => changeInput("targetAudience", e.target.value || null)} placeholder="例如：新生" /></label>
          <label>使用场景<input value={input.useScenario ?? ""} maxLength={200} onChange={e => changeInput("useScenario", e.target.value || null)} placeholder="例如：开学学习 / 出差办公" /></label>
          <label>发布平台<select value={input.platform ?? ""} onChange={e => changeInput("platform", e.target.value ? e.target.value as TaskInput["platform"] : null)}><option value="">待明确</option>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>选购阶段<select value={input.purchaseStage} onChange={e => changeInput("purchaseStage", e.target.value as TaskInput["purchaseStage"])}><option value="unknown">未明确</option><option value="exploring">初步了解</option><option value="comparing">对比选购</option><option value="ready_to_visit">准备咨询 / 到店</option></select></label>
          <label className="wide">内容目标<input value={input.contentGoal ?? ""} maxLength={300} onChange={e => changeInput("contentGoal", e.target.value || null)} placeholder="希望读者了解什么、采取什么行动" /></label>
        </div>
        <details className="advanced"><summary>表达偏好与待核实主张</summary><div className="form-grid">
          <label>语气<input maxLength={100} value={input.constraints.tone ?? ""} onChange={e => changeInput("constraints", { ...input.constraints, tone: e.target.value || undefined })} /></label>
          <label>长度偏好<input maxLength={100} value={input.constraints.lengthPreference ?? ""} onChange={e => changeInput("constraints", { ...input.constraints, lengthPreference: e.target.value || undefined })} /></label>
          <label className="wide">希望提及的主张（每行一条，必须由资料支持）<textarea value={input.requestedClaims.join("\n")} onChange={e => changeInput("requestedClaims", e.target.value.split("\n"))} rows={3} /></label>
          <label className="wide">应避免的表达（每行一条）<textarea value={input.constraints.avoid.join("\n")} onChange={e => changeInput("constraints", { ...input.constraints, avoid: e.target.value.split("\n").filter(Boolean) })} rows={2} /></label>
        </div></details>
        {!run && <label className="mode-picker">运行模式<select value={mode} onChange={e => setMode(e.target.value as "live" | "synthetic" | "local")}><option value="live">live · 实际 ima 与模型</option><option value="synthetic">synthetic · 人工样例，仅验证逻辑</option></select></label>}
        {(run?.mode ?? mode) === "synthetic" && <p className="notice">人工构造样例模式：不属于真实产品生成或真实验收。仅在服务端明确允许时可用。</p>}
        <div className="toolbar"><button disabled={busy}>{busy ? "提交中…" : run ? "保存任务并重新执行 →" : "开始执行 →"}</button><span className="hint">{imageRange ? `此平台需要 ${imageRange.min}–${imageRange.max} 张不同的 ima 型号图片。` : "补充必要条件后执行。"}</span></div>
      </form>
      {run?.brief.clarifyingQuestions.length ? <aside className="notice"><strong>还需要这些信息</strong><ul>{run.brief.clarifyingQuestions.map((question, i) => <li key={i}>{question}</li>)}</ul><p>在上方补充后，保存并重新执行。</p></aside> : null}
      {error && <p className="error feedback" role="alert">{error}</p>}
      {notice && <p className="feedback" role="status">{notice}</p>}
    </section>
    {run && <>
      <section className="workspace run-progress" aria-labelledby="progress-title" aria-busy={!!run.activeOperationId}>
        <div className="panel-head"><div><p className="eyebrow">运行 / 第 {run.currentVersion} 版</p><h2 id="progress-title">{states[run.state]}</h2></div><span className={`badge ${run.state === "ready" ? "pass" : run.state === "failed" ? "fail" : "blocked"}`}>{run.mode}</span></div>
        <p className="report-meta">资料：{run.executionEvidence.retrievalMode} · 生成：{run.executionEvidence.generationMode} · 模型{run.executionEvidence.modelInvoked ? `已调用${run.executionEvidence.model ? ` / ${run.executionEvidence.model}` : ""}` : "暂无成功调用"}</p>
        <p className="hint">显示最近 10 项执行记录，可能包含历史修订。</p><ol className="stages" aria-live="polite">{run.stageSummary.slice(-10).map((stage, i) => <li key={`${stage.at}-${i}`}><span className="step-number">{String(i + 1).padStart(2, "0")}</span><div><strong>{stageLabels[stage.stage] ?? stage.stage}</strong><p>{stage.summary}</p></div><span className={`stage-state ${stage.status === "passed" ? "pass" : stage.status === "failed" ? "fail" : ""}`}>{({ running: "已开始", passed: "已完成", blocked: "受阻", failed: "失败" })[stage.status]}</span></li>)}</ol>
        {!run.stageSummary.length && <p className="hint">等待服务端执行记录；进度仅来自实际运行状态。</p>}
        <div className="toolbar"><button type="button" className="secondary" disabled={busy || dirty} onClick={() => void action("execute")}>重新取证并执行</button><button type="button" className="secondary" disabled={busy} onClick={() => void loadRun(run.runId)}>载入最新记录</button></div>
      </section>
      <section className="workspace" aria-labelledby="strategy-title"><p className="eyebrow">02 / 场景与策略</p><h2 id="strategy-title">为什么这样表达</h2>{run.strategy ? <div className="strategy-content"><dl className="key-values"><div><dt>用户问题</dt><dd>{run.strategy.audienceProblem}</dd></div><div><dt>内容切入</dt><dd>{run.strategy.contentAngle}</dd></div><div><dt>语气</dt><dd>{run.strategy.tone}</dd></div><div><dt>行动目标</dt><dd>{run.strategy.callToActionGoal}</dd></div></dl><h3>卖点方向与顺序 · 仍须事实支持</h3><ol className="topic-list">{[...run.strategy.priorityTopics].sort((a, b) => a.rank - b.rank).map(topic => <li key={`${topic.rank}-${topic.topic}`}><strong>{topic.topic}</strong><p>{topic.reason}</p></li>)}</ol><p>{run.strategy.reasoningSummary}</p><details><summary>待取证问题与图文编排</summary><ul>{run.strategy.retrievalQuestions.map((question, i) => <li key={i}>{question}</li>)}</ul>{run.strategy.outline.map(block => <p key={block.blockKey}>{block.blockKey}：{block.purpose}</p>)}{run.strategy.imagePlan.map((image, i) => <p key={i}>图片 {i + 1} → {image.suggestedBlockKey}：{image.purpose}</p>)}</details></div> : <p className="empty">补齐任务条件后，展示服务端形成的场景策略。</p>}</section>
      <section className="workspace" aria-labelledby="evidence-title"><p className="eyebrow">03 / 事实依据</p><h2 id="evidence-title">每个主张，都能找到出处</h2>{run.evidence ? <>
        <p className="library">{run.evidence.product.displayName} · {run.evidence.provenanceMode} · {new Date(run.evidence.retrievedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p><p className="hint">{run.evidence.product.resolutionBasis}</p>
        {!!run.evidence.conflicts.length && <aside className="notice error"><strong>资料冲突 · 当前成稿停止</strong><ul>{run.evidence.conflicts.map((conflict, i) => <li key={i}>{conflict.fieldKey}：{conflict.message}{conflict.sourceIds.map(id => { const source = run.evidence?.sources.find(s => s.citationKey === id); return source ? <Source key={id} source={source} /> : <p key={id}>来源尚未映射</p>; })}</li>)}</ul></aside>}
        {!!run.evidence.coverageGaps.length && <aside className="notice"><strong>资料 / 图片缺口</strong><ul>{run.evidence.coverageGaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></aside>}
        <div className="facts">{run.evidence.facts.map((fact, i) => <details id={`fact-${fact.factId}`} key={fact.factId} className="fact"><summary><span className="fact-number">F{String(i + 1).padStart(2, "0")}</span>{fact.supportedStatement}<span className="fact-status">{({ supported: "有依据", unconfirmed: "待确认", conflicted: "有冲突" })[fact.status]}</span></summary>{!!fact.qualifiers.length && <p>适用条件：{fact.qualifiers.join("；")}</p>}{fact.sourceIds.map(id => { const source = run.evidence?.sources.find(item => item.citationKey === id); return source ? <Source key={id} source={source} /> : <p className="error" key={id}>此事实缺少可展示的来源映射。</p>; })}</details>)}</div>
        <details className="all-sources"><summary>全部安全来源（{run.evidence.sources.length}）</summary>{run.evidence.sources.map(source => <Source key={source.citationKey} source={source} />)}</details>
      </> : <p className="empty">等待 ima 读取。此处只显示必要短摘录与来源定位。</p>}</section>
      <section className="workspace" aria-labelledby="draft-title"><div className="panel-head"><div><p className="eyebrow">04 / 图文与修改</p><h2 id="draft-title">{run.brief.platform ? platforms[run.brief.platform] : "平台待明确"}草稿</h2></div><span className={`badge ${dirty ? "blocked" : run.exportable ? "pass" : "blocked"}`}>{dirty ? "本地编辑 · 待保存重验" : run.exportable ? "当前稿可请求导出" : "尚不可导出"}</span></div>
        {dirty && <p className="notice">内容或任务已有修改，旧核验不能用于当前编辑内容。保存修改后重新核验；换平台、场景或产品请保存任务并重新执行。</p>}
        {draft ? <div className="draft-editor"><details className="article-preview" open><summary>按图片位置查看草稿预览 · {dirty ? "编辑中，未核验" : run.exportable ? "当前稿" : "未开放导出"}</summary><DraftPreview runId={run.runId} draft={draft} images={run.evidence?.images ?? []} /></details><h3>编辑图文</h3><label>标题<input value={draft.title} maxLength={300} onChange={e => changeDraft({ ...draft, title: e.target.value })} /></label><label>导语<textarea value={draft.lead} maxLength={3000} rows={3} onChange={e => changeDraft({ ...draft, lead: e.target.value })} /></label>{draft.bodyBlocks.map((block, index) => <div className="body-editor" key={block.blockKey}><label>正文 {index + 1} · {block.blockKey}<textarea value={block.text} maxLength={12000} rows={5} onChange={e => changeDraft({ ...draft, bodyBlocks: draft.bodyBlocks.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} /></label><div className="fact-links">事实依据：{block.factIds.length ? block.factIds.map(id => { const factIndex = run.evidence?.facts.findIndex(fact => fact.factId === id) ?? -1; return <a key={id} href={`#fact-${id}`}>{factIndex < 0 ? "未映射事实" : `F${String(factIndex + 1).padStart(2, "0")}`}</a>; }) : <span>无产品事实引用</span>}</div></div>)}<label>行动引导 / CTA<textarea value={draft.callToAction} maxLength={1500} rows={2} onChange={e => changeDraft({ ...draft, callToAction: e.target.value })} /></label><label>标签（每行一个）<textarea rows={2} value={draft.tags.join("\n")} onChange={e => changeDraft({ ...draft, tags: e.target.value.split("\n") })} /></label>
          <h3>已选图片 · {draft.selectedImages.length} 张</h3><p className="hint">图片按下列顺序编排；每张必须来自当前 ima 事实包，型号有依据，不能重复凑数。</p><div className="selected-images">{draft.selectedImages.map((selected, index) => { const image = run.evidence?.images.find(item => item.imageId === selected.imageId); return <article className="image-editor" key={selected.imageId}>{image ? <><figure><img src={`/api/runs/${run.runId}/assets/${image.imageId}`} alt={selected.caption || image.modelMatchSummary} onError={e => { const key = `${run.runId}/${image.imageId}`; setAssetErrors(items => items.includes(key) ? items : [...items, key]); e.currentTarget.hidden = true; e.currentTarget.parentElement?.setAttribute("data-image-error", "图片当前无法读取，不能视为完整可用素材。请重新执行取证。"); }} onLoad={e => { const key = `${run.runId}/${image.imageId}`; setAssetErrors(items => items.filter(item => item !== key)); e.currentTarget.hidden = false; e.currentTarget.parentElement?.removeAttribute("data-image-error"); }} /><figcaption>{image.fileName} · {image.width} × {image.height}<br />{image.modelMatchSummary}</figcaption></figure><Source source={image.sourceView} /></> : <p className="error">图片不在当前事实包，需重新取证。</p>}<label>图片说明<textarea maxLength={600} rows={2} value={selected.caption} onChange={e => changeDraft({ ...draft, selectedImages: draft.selectedImages.map((item, i) => i === index ? { ...item, caption: e.target.value } : item) })} /></label><label>图片用途<input maxLength={400} value={selected.purpose} onChange={e => changeDraft({ ...draft, selectedImages: draft.selectedImages.map((item, i) => i === index ? { ...item, purpose: e.target.value } : item) })} /></label><div className="form-grid"><label>插入区块<select value={selected.placement.blockKey} onChange={e => changeDraft({ ...draft, selectedImages: draft.selectedImages.map((item, i) => i === index ? { ...item, placement: { ...item.placement, blockKey: e.target.value } } : item) })}>{[...new Set(draft.bodyBlocks.map(block => block.blockKey))].map(key => <option key={key} value={key}>{key}</option>)}</select></label><label>插入位置<select value={selected.placement.position} onChange={e => changeDraft({ ...draft, selectedImages: draft.selectedImages.map((item, i) => i === index ? { ...item, placement: { ...item.placement, position: e.target.value as "before" | "after" } } : item) })}><option value="before">区块之前</option><option value="after">区块之后</option></select></label></div><div className="toolbar"><button type="button" className="secondary" disabled={index === 0} onClick={() => changeDraft(moveSelectedImage(draft, index, -1))}>上移</button><button type="button" className="secondary" disabled={index === draft.selectedImages.length - 1} onClick={() => changeDraft(moveSelectedImage(draft, index, 1))}>下移</button><button type="button" className="secondary" onClick={() => changeDraft({ ...draft, selectedImages: draft.selectedImages.filter((_, i) => i !== index) })}>移除图片</button></div></article>; })}</div>
          {!!run.evidence?.images.length && <details className="image-candidates"><summary>从 ima 候选中选择图片（{run.evidence.images.length}）</summary><div className="candidate-grid">{run.evidence.images.map(image => { const selected = draft.selectedImages.some(item => item.imageId === image.imageId); const eligible = image.availability === "verified" && image.modelMatch === "confirmed" && image.productKey === run.evidence?.product.productKey; return <article key={image.imageId}><figure><img src={`/api/runs/${run.runId}/assets/${image.imageId}`} alt={image.modelMatchSummary} loading="lazy" /><figcaption>{image.fileName}</figcaption></figure><p>{image.modelMatchSummary}</p><p className="hint">{image.sourceView.sourceTitle} · {image.sourceView.locatorLabel}</p><button type="button" className="secondary" disabled={selected || !eligible || draft.selectedImages.length >= 6} onClick={() => changeDraft({ ...draft, selectedImages: [...draft.selectedImages, { imageId: image.imageId, caption: "", purpose: "", placement: { blockKey: draft.bodyBlocks[0]?.blockKey ?? "lead", position: "after" } }] })}>{selected ? "已选用" : eligible ? "加入当前稿" : "依据 / 可访问性未通过"}</button></article>; })}</div></details>}
          <div className="toolbar"><button type="button" disabled={busy || !draftDirty || inputDirty} onClick={() => { const parsed = DraftEditable.safeParse(draft); if (parsed.success) void action("revise", { draft: parsed.data }); else setError("草稿字段超出长度或数量限制，请检查后再保存。"); }}>保存图文修改</button><button type="button" className="secondary" disabled={busy || dirty || !!run.activeOperationId} onClick={() => void action("revalidate")}>重新核验当前稿</button><button type="button" className="secondary" disabled={busy || dirty || !run.evidence || !run.strategy} onClick={() => void action("regenerate")}>使用当前取证重新生成</button></div>{inputDirty && <p className="hint">任务条件已改变，请先保存任务并重新执行，避免将旧策略的草稿用于新任务。</p>}
        </div> : <p className="empty">资料与图片满足条件后，显示实际模型生成的可编辑图文；资料不足不会替换为固定样稿。</p>}
      </section>
      <section className="workspace" aria-labelledby="validation-title"><div className="panel-head"><div><p className="eyebrow">05 / 核验与导出</p><h2 id="validation-title">{dirty ? "编辑内容尚未核验" : run.validation?.status === "passed" ? "当前版本核验通过" : run.validation?.status === "stale" ? "旧核验已失效" : "逐项检查，修订后再验"}</h2></div></div>
        {run.validation && <><p className="report-meta">以下报告绑定第 {run.validation.checkedVersion} 版 · 语义核验：{run.validation.semanticMode} · {new Date(run.validation.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}{dirty ? " · 对本地编辑内容无效" : ""}</p><ul className="validation-checks">{run.validation.checks.map((check, index) => <li key={`${check.name}-${index}`}><span className={`stage-state ${check.status === "passed" ? "pass" : "fail"}`}>{({ passed: "通过", failed: "未通过", not_run: "未执行" })[check.status]}</span><div><strong>{check.name}</strong><p>{check.summary}</p></div></li>)}</ul></>}
        {!!uniqueIssues.length && <Issues issues={uniqueIssues} />}
        {!run.validation && !uniqueIssues.length && <p className="empty">等待当前版本核验。模型自述“已通过”不作为通过证据。</p>}
        {selectedAssetFailed && <p role="alert" className="error">当前选图在浏览器中读取失败，导出已关闭。请检查素材或重新执行取证。</p>}
        <div className="export-bar"><div><strong>{exportAllowed ? "可请求导出当前稿" : "完整成稿导出已关闭"}</strong><p>服务端将复核当前任务、稿件、事实、策略与图片；修改后必须重新核验。</p></div><div className="toolbar"><button type="button" disabled={!exportAllowed} onClick={() => void exportContent(true)}>复制核验成稿</button><button type="button" disabled={!exportAllowed} onClick={() => void exportContent(false)}>导出 Markdown</button></div></div>
        {exported && <details className="export-preview"><summary>本次服务端导出内容 · v{exported.version} · {exported.provenanceMode}</summary><pre>{exported.content}</pre></details>}
      </section>
    </>}
  </div>;
}
