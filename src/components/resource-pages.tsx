"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { LocalCatalog, RunListResponse, type RunResult } from "@/contracts/business";
const platformNames: Record<string, string> = { wechat_moments: "朋友圈", xiaohongshu: "小红书", wechat_article: "公众号" };
const stateNames: Record<string, string> = { draft: "等待执行", needs_input: "待补充信息", planning: "形成策略", retrieving: "读取资料", evidence_ready: "资料已就绪", generating: "生成中", validating: "核验中", needs_revision: "待修改", blocked: "执行受阻", failed: "执行失败", ready: "当前版本就绪" };
export function useResource<T>(url: string, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    fetch(url, { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || `请求未完成（HTTP ${response.status}）`);
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new Error("服务响应格式有误，请检查服务端版本。");
      if (alive) setData(parsed.data);
    }).catch(error => { if (alive) setError(error instanceof Error ? error.message : "暂时无法读取数据"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, schema, revision]);
  return { data, error, loading, refresh: () => setRevision(value => value + 1) };
}
function DataStatus({ error, loading }: { error: string; loading: boolean }) {
  return <>{loading && <p role="status" className="hint">正在读取实际记录…</p>}{error && <p role="alert" className="error feedback">{error}</p>}</>;
}
function RunCard({ run }: { run: RunResult }) {
  return <Link className="run-card" href={`/create?run=${encodeURIComponent(run.runId)}`}><div><span className={`badge ${run.exportable ? "pass" : ""}`}>{stateNames[run.state]}</span><span className="run-mode">{run.mode}</span></div><h3>{run.input.productRequest || "产品待明确"}</h3><p>{run.input.useScenario || "场景待补充"} / {run.input.platform ? platformNames[run.input.platform] : "平台待选"}</p><div className="run-card-bottom"><time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time><span>第 {run.currentVersion} 版 →</span></div></Link>;
}
export function HomePage() {
  const { data, error, loading } = useResource("/api/runs", RunListResponse);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const runs = [...(data?.runs ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const coverRun = runs.find(run => run.evidence?.images.some(image => image.availability === "verified" && image.modelMatch === "confirmed" && run.draft?.selectedImages.some(selected => selected.imageId === image.imageId) && !failedImages.includes(`${run.runId}/${image.imageId}`)));
  const cover = coverRun?.evidence?.images.find(image => image.availability === "verified" && image.modelMatch === "confirmed" && coverRun.draft?.selectedImages.some(selected => selected.imageId === image.imageId) && !failedImages.includes(`${coverRun.runId}/${image.imageId}`));
  return <div className="home-page"><section className="home-hero"><div className="hero-copy"><p className="eyebrow">华为 PC 内容创作</p><h1>好产品，<br />值得好好表达。</h1><p className="hero-description">从真实产品资料出发，让每个平台的表达都有依据。</p><Link className="button-link primary" href="/create">开始创作 <span aria-hidden="true">→</span></Link></div><div className="hero-visual">{cover && coverRun ? <figure><img src={`/api/runs/${coverRun.runId}/assets/${cover.imageId}`} alt={cover.modelMatchSummary} onError={() => setFailedImages(items => [...items, `${coverRun.runId}/${cover.imageId}`])} /><figcaption><strong>{coverRun.evidence?.product.displayName}</strong><span>授权来源：{coverRun.evidence?.provenanceMode} / {cover.sourceView.sourceTitle}</span><span>{cover.sourceView.locatorLabel}</span></figcaption></figure> : <div className="hero-empty"><span className="empty-wordmark">PC</span><p>{loading ? "正在读取已取证产品图片" : "从一份真实资料开始"}</p><span>完成首个任务后，展示对应的授权产品图。</span></div>}</div></section><section className="recent-section"><div className="section-heading"><h2>继续你的创作</h2><Link href="/history">全部任务 <span aria-hidden="true">→</span></Link></div><DataStatus error={error} loading={loading} />{!!runs.length && <div className="recent-grid">{runs.slice(0, 2).map(run => <RunCard key={run.runId} run={run} />)}</div>}{!loading && !error && !runs.length && <div className="welcome-empty"><h3>第一份好内容，从这里开始。</h3><p>选择产品、人群与场景，工作台会记录取证、生成与核验过程。</p></div>}</section><section className="home-guide"><div><h2>为不同平台，<br />找到合适的表达。</h2><p>朋友圈的轻量动态，小红书的图集笔记，公众号的完整文章。生成后可编辑，重验后再导出。</p></div><div className="channel-list"><span>朋友圈 <small>单卖点短动态</small></span><span>小红书 <small>图集与清单</small></span><span>公众号 <small>内嵌图长文</small></span></div></section></div>;
}
export function HistoryPage() {
  const { data, error, loading, refresh } = useResource("/api/runs", RunListResponse);
  const [query, setQuery] = useState(""); const [platform, setPlatform] = useState(""); const [state, setState] = useState("");
  const runs = [...(data?.runs ?? [])].filter(run => (!platform || run.input.platform === platform) && (!state || run.state === state) && [run.input.productRequest, run.input.useScenario, run.input.targetAudience, run.draft?.title].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return <><PageHeading title="每一次创作，都有记录。" description="重新打开任务，查看原有版本，继续修改与核验。" /><section className="records-surface"><div className="history-filters"><label>搜索任务<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="型号、场景、人群或标题" /></label><label>平台<select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">全部平台</option>{Object.entries(platformNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>任务状态<select value={state} onChange={event => setState(event.target.value)}><option value="">全部状态</option>{Object.entries(stateNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="secondary" disabled={loading} onClick={refresh}>刷新记录</button></div><DataStatus error={error} loading={loading} />{data && <p className="hint">服务端记录 {data.runs.length} 条，当前显示 {runs.length} 条。打开后自动同步执行中的任务。</p>}<div className="history-grid">{runs.map(run => <RunCard key={run.runId} run={run} />)}</div>{!loading && !error && !runs.length && <div className="welcome-empty"><h2>{data?.runs.length ? "没有匹配的任务" : "还没有任务记录"}</h2><p>{data?.runs.length ? "试试调整搜索词或筛选条件。" : "开始创作后，实际任务将在这里保留。"}</p><Link href="/create" className="button-link secondary">前往内容创作</Link></div>}</section></>;
}
export function LibraryPage() {
  const { data, error, loading, refresh } = useResource("/api/local-catalog", LocalCatalog);
  const [query, setQuery] = useState("");
  const products = (data?.products ?? []).filter(product => product.displayName.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading title="从产品资料，找到内容方向。" description="授权本地知识库的真实产品目录。具体事实与图片会在任务执行时逐项核实。" /><section className="records-surface"><div className="library-tools"><label>搜索产品<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入完整型号或关键词" /></label><button className="secondary" onClick={refresh} disabled={loading}>刷新目录</button></div><DataStatus error={error} loading={loading} />{data && !data.available && <p role="alert" className="notice">本地知识库当前不可用。请检查服务端授权资料配置；可继续在创作页手动填写型号，执行时显示实际读取结果。</p>}{data?.available && <p className="hint">来源模式 local，共 {data.products.length} 个具体型号。图片计数为已索引候选数量，执行时还需核查文件、型号与重复。</p>}<div className="catalog-grid">{products.map(product => <article className="catalog-card" key={product.productRequest}><span className="catalog-mode">LOCAL 知识库</span><h2>{product.displayName}</h2><p>{product.imageCount} 张索引候选图片</p><p className="hint">型号与图片的最终依据以实际任务取证为准。</p><Link href={`/create?product=${encodeURIComponent(product.productRequest)}`} className="text-link">使用此产品创作 →</Link></article>)}</div>{data?.available && !products.length && <p className="empty">没有匹配的产品，请调整关键词。</p>}</section></>;
}
export function PageHeading({ title, description }: { title: string; description: string }) { return <header className="page-heading"><h1>{title}</h1><p>{description}</p></header>; }
const ModelConfiguration = z.object({ configured: z.boolean(), endpointPresent: z.boolean(), keyPresent: z.boolean(), modelPresent: z.boolean() }).strict();
const ModelProbe = z.object({ status: z.enum(["PASS", "FAIL", "BLOCKED"]), executed: z.boolean(), code: z.string().optional(), model: z.string().optional() }).passthrough();
export function ModelSettings() {
  const { data, error, loading, refresh } = useResource("/api/model", ModelConfiguration);
  const [probe, setProbe] = useState<z.infer<typeof ModelProbe> | null>(null); const [busy, setBusy] = useState(false); const [probeError, setProbeError] = useState("");
  async function check() { setBusy(true); setProbeError(""); setProbe(null); try { const response = await fetch("/api/model", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "模型检查未完成"); setProbe(ModelProbe.parse(data)); } catch (error) { setProbeError(error instanceof Error ? error.message : "模型检查失败"); } finally { setBusy(false); } }
  return <section className="workspace"><div className="panel-head"><h2>模型服务</h2><span className={`badge ${data?.configured ? "pass" : ""}`}>{loading ? "读取中" : data?.configured ? "已配置，待实际检查" : "等待本机配置"}</span></div><p className="section-description">配置由本机服务端管理。可发送一次最小请求，检查实际可用性。</p><DataStatus error={error} loading={loading} />{data && <dl className="settings-facts"><div><dt>模型地址</dt><dd>{data.endpointPresent ? "已配置" : "未配置"}</dd></div><div><dt>访问凭证</dt><dd>{data.keyPresent ? "已配置" : "未配置"}</dd></div><div><dt>模型名称</dt><dd>{data.modelPresent ? "已配置" : "未配置"}</dd></div></dl>}<div className="toolbar"><button onClick={() => void check()} disabled={busy || !data?.configured}>{busy ? "实际请求中…" : "检查模型连接"}</button><button className="secondary" onClick={refresh} disabled={loading}>刷新配置状态</button></div>{probe && <p role="status" className={`feedback ${probe.status === "PASS" ? "" : "error"}`}>{probe.status === "PASS" ? "最小实际请求通过" : probe.status === "BLOCKED" ? "检查受阻" : "检查未通过"} / {probe.executed ? "已执行请求" : "未执行请求"}{probe.model ? ` / ${probe.model}` : ""}{probe.code ? ` / ${probe.code}` : ""}</p>}{probeError && <p role="alert" className="error feedback">{probeError}</p>}</section>;
}
