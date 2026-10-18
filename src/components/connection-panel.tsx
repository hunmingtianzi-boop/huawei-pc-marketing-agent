"use client";
import { useEffect, useState } from "react";
import { ProbeReport, type ProbeReport as Report } from "@/contracts";
const labels: Record<string, string> = { credentials: "本机凭证", skill: "官方接入脚本", knowledge_base_access: "指定知识库", directory: "知识库目录", product_search: "产品资料定位", source_content: "产品原文读取", image_asset: "图片与型号依据" };
const statuses = { PASS: "已通过", BLOCKED: "待完成", FAIL: "未通过" };
export default function ConnectionPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/connection").then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      setConfigured(data.credentials.configured);
      if (data.report) setReport(ProbeReport.parse(data.report));
    }).catch(() => setError("暂时无法读取本机连接状态，请重试。"));
  }, []);
  async function check(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch("/api/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: product.trim() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message || "检查未完成，请重试。"); return; }
      const parsed = ProbeReport.parse(data.report); setReport(parsed);
      setConfigured(parsed.stages.find(s => s.name === "credentials")?.status === "PASS");
    } catch { setError("检查未完成，请确认本地服务仍在运行。"); } finally { setBusy(false); }
  }
  return <section className="workspace" aria-labelledby="connection-title">
    <div className="panel-head"><div><p className="eyebrow">01 / 资料与素材</p><h2 id="connection-title">连接检查</h2></div><span className={`badge ${report?.status.toLowerCase() ?? "blocked"}`}>{busy ? "检查中" : report ? statuses[report.status] : "尚未检查"}</span></div>
    <p className="library">指定知识库 <strong>任德耀新建华为PC知识库</strong></p>
    <form onSubmit={check}><label htmlFor="product">完整产品型号</label><div className="input-row"><input id="product" value={product} onChange={e => setProduct(e.target.value)} placeholder="输入知识库中的完整型号名" maxLength={140} required disabled={busy} /><button disabled={busy || !product.trim()}>{busy ? "正在检查…" : "检查真实接入 →"}</button></div><p className="hint">只读检查一份产品原文及一张图片。不会生成或发布文章。</p></form>
    {configured === false && <aside className="notice"><strong>等待本机配置 ima 凭证</strong><p>在本机私有配置中填写接口凭证，并用同一账号加入指定知识库。完成后重新检查；凭证无需发送到聊天。</p></aside>}
    {error && <p role="alert" className="error">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {report ? <><p className="report-meta">本次模式：{report.mode} · 账号身份尚未验证 · {new Date(report.finishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p><ol className="stages">{report.stages.map((s, i) => <li key={s.name}><span className="step-number">{String(i + 1).padStart(2, "0")}</span><div><strong>{labels[s.name]}</strong><p>{s.summary}</p></div><span className={`stage-state ${s.status.toLowerCase()}`}>{s.executed ? statuses[s.status] : "未执行"}</span></li>)}</ol>{report.source && <div className="evidence"><h3>已读取的来源</h3><p>{report.source.sourceTitle} · {report.source.locatorLabel}</p></div>}{report.image?.previewAssetKey && <figure><img src={`/api/assets/${report.image.previewAssetKey}`} alt={report.image.modelMatchSummary} /><figcaption>{report.image.sourceView.sourceTitle} · {report.image.sourceView.locatorLabel}</figcaption></figure>}</> : <div className="empty"><span>资料 → 原文 → 图片依据</span><p>检查结果将在这里逐项显示。通过接口认证仍需继续核对原文和图片。</p></div>}
    </div>
  </section>;
}
