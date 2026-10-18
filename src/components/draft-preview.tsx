"use client";
import { useState, type ReactNode } from "react";
import type { z } from "zod";
import type { ImageView, Platform } from "@/contracts";
import type { DraftEditable } from "@/contracts/business";

type Props = { runId: string; draft: DraftEditable; images: z.infer<typeof ImageView>[]; platform?: z.infer<typeof Platform>; onFactClick?: (id: string) => void };
const labels = { wechat_article: "公众号文章", xiaohongshu: "小红书笔记", wechat_moments: "朋友圈动态" };
export function nextPreviewImage(index: number, total: number, direction: -1 | 1): number {
  return total < 1 ? 0 : (index + direction + total) % total;
}
export default function DraftPreview({ runId, draft, images, platform = "wechat_article", onFactClick }: Props) {
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const found = draft.selectedImages.findIndex(image => image.imageId === activeImageId);
  const currentIndex = found < 0 ? 0 : found;
  const current = draft.selectedImages[currentIndex];
  function navigate(direction: -1 | 1) {
    const next = nextPreviewImage(currentIndex, draft.selectedImages.length, direction);
    setActiveImageId(draft.selectedImages[next]?.imageId ?? null);
  }
  function picture(selected: DraftEditable["selectedImages"][number], compact = false) {
    const image = images.find(item => item.imageId === selected.imageId);
    return <figure key={selected.imageId} className="platform-picture">
      {image ? <img src={`/api/runs/${runId}/assets/${image.imageId}`} alt={selected.caption || image.modelMatchSummary} width={image.width} height={image.height} /> : <p className="preview-missing" role="status">此图不在当前事实包，请重新取证。</p>}
      <figcaption>{selected.caption || "图片说明待填写"}</figcaption>
      <details className={`preview-source${compact ? " compact" : ""}`}><summary>图片来源与位置</summary><p>{image ? `${image.fileName} · ${image.sourceView.sourceTitle} · ${image.sourceView.locatorLabel}` : "缺少有效图片来源"}</p><p>{selected.placement.blockKey} · {selected.placement.position === "before" ? "区块之前" : "区块之后"} · {selected.purpose || "用途待填写"}</p>{image && <p>{image.modelMatchSummary}</p>}</details>
    </figure>;
  }
  function factLinks(ids: string[]) {
    return !!ids.length && <div className="fact-links">{ids.map((id, index) => <a key={id} href={`#fact-${id}`} onClick={onFactClick ? event => { event.preventDefault(); onFactClick(id); } : undefined}>查看本段依据 {index + 1}</a>)}</div>;
  }
  function body() {
    return draft.bodyBlocks.map(item => <div className="preview-text-block" key={item.blockKey}><p>{item.text}</p>{factLinks(item.factIds)}</div>);
  }
  const tags = !!draft.tags.filter(Boolean).length && <p className="preview-tags">{draft.tags.filter(Boolean).map(tag => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>;
  function block(key: string, content: ReactNode) {
    return <div className="preview-block" key={key}>{draft.selectedImages.filter(image => image.placement.blockKey === key && image.placement.position === "before").map(image => picture(image))}{content}{draft.selectedImages.filter(image => image.placement.blockKey === key && image.placement.position === "after").map(image => picture(image))}</div>;
  }
  const knownKeys = ["title", "lead", ...draft.bodyBlocks.map(item => item.blockKey), "callToAction"];
  const publicationLabel = <div className="simulation-label"><span>{labels[platform]} · 模拟预览</span><strong>未发布</strong></div>;
  if (platform === "xiaohongshu") return <article className="platform-preview preview-note" aria-label="小红书图集笔记模拟预览">
    {publicationLabel}
    <div className="note-topbar"><div className="preview-avatar">PC</div><div><strong>内容预览账号</strong><span>仅用于检查图文排版</span></div><span className="note-draft-label">草稿</span></div>
    <section className="note-carousel" aria-label="笔记图片集" tabIndex={0} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1); } }}>
      {current ? picture(current) : <p className="preview-missing">尚未选择图片，图片不足时不可导出完整成稿。</p>}
      {!!draft.selectedImages.length && <div className="carousel-toolbar"><button type="button" className="carousel-arrow" onClick={() => navigate(-1)} disabled={draft.selectedImages.length < 2} aria-label="上一张图片">←</button><span aria-live="polite">{currentIndex + 1} / {draft.selectedImages.length}</span><button type="button" className="carousel-arrow" onClick={() => navigate(1)} disabled={draft.selectedImages.length < 2} aria-label="下一张图片">→</button></div>}
      {draft.selectedImages.length > 1 && <div className="carousel-dots" aria-label="选择图片">{draft.selectedImages.map((image, index) => <button type="button" key={image.imageId} aria-label={`查看第 ${index + 1} 张图片`} aria-pressed={index === currentIndex} onClick={() => setActiveImageId(image.imageId)}>{index + 1}</button>)}</div>}
    </section>
    <div className="note-copy"><h3>{draft.title}</h3>{draft.lead && <p>{draft.lead}</p>}{body()}{draft.callToAction && <p className="preview-cta">{draft.callToAction}</p>}{tags}</div>
    <div className="preview-unpublished-footer">排版模拟 · 未发送至小红书</div>
  </article>;
  if (platform === "wechat_moments") return <article className="platform-preview preview-moments" aria-label="朋友圈动态模拟预览">
    {publicationLabel}<div className="moments-screen-title">朋友圈</div>
    <div className="moments-post"><div className="preview-avatar">PC</div><div className="moments-post-content"><strong className="moments-author">内容预览账号</strong><div className="moments-copy">{draft.title && <h3>{draft.title}</h3>}{draft.lead && <p>{draft.lead}</p>}{body()}{draft.callToAction && <p className="preview-cta">{draft.callToAction}</p>}{tags}</div><div className={`moments-images ${draft.selectedImages.length === 1 ? "single" : "grid"}`}>{draft.selectedImages.map(image => picture(image, true))}</div><p className="moments-post-meta">当前草稿 · 未发布</p></div></div>
    <div className="preview-unpublished-footer">排版模拟 · 未发送至微信朋友圈</div>
  </article>;
  return <article className="platform-preview preview-wechat" aria-label="公众号文章模拟预览">
    {publicationLabel}<div className="wechat-reader-bar">文章阅读预览</div><div className="wechat-article-copy">
      {block("title", draft.title && <h3>{draft.title}</h3>)}
      <p className="wechat-byline"><span>内容工作台</span><span>当前草稿 · 未发布</span></p>
      {block("lead", draft.lead && <p className="preview-lead">{draft.lead}</p>)}
      {draft.bodyBlocks.map(item => block(item.blockKey, <><p>{item.text}</p>{factLinks(item.factIds)}</>))}
      {block("callToAction", draft.callToAction && <p className="preview-cta">{draft.callToAction}</p>)}{tags}
      {draft.selectedImages.filter(image => !knownKeys.includes(image.placement.blockKey)).map(image => <div key={image.imageId}><p className="error">此图插入位置待确认：{image.placement.blockKey}</p>{picture(image)}</div>)}
      <div className="wechat-end-mark">本文为未发布草稿</div>
    </div>
  </article>;
}
