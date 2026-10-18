import type { ReactNode } from "react";
import type { z } from "zod";
import type { ImageView } from "@/contracts";
import type { DraftEditable } from "@/contracts/business";

type Props = { runId: string; draft: DraftEditable; images: z.infer<typeof ImageView>[] };
export default function DraftPreview({ runId, draft, images }: Props) {
  function picture(selected: DraftEditable["selectedImages"][number]) {
    const image = images.find(item => item.imageId === selected.imageId);
    return <figure key={selected.imageId}>{image && <img src={`/api/runs/${runId}/assets/${image.imageId}`} alt={selected.caption || image.modelMatchSummary} />}<figcaption>{selected.caption || "图片说明待填写"}{image && <><br />{image.fileName} · {image.sourceView.sourceTitle} · {image.sourceView.locatorLabel}</>}</figcaption></figure>;
  }
  function block(key: string, content: ReactNode) {
    return <div className="preview-block" key={key}>
      {draft.selectedImages.filter(image => image.placement.blockKey === key && image.placement.position === "before").map(picture)}
      {content}
      {draft.selectedImages.filter(image => image.placement.blockKey === key && image.placement.position === "after").map(picture)}
    </div>;
  }
  const knownKeys = ["title", "lead", ...draft.bodyBlocks.map(item => item.blockKey), "callToAction"];
  return <article className="article-preview-content">
    {block("title", draft.title && <h3>{draft.title}</h3>)}
    {block("lead", draft.lead && <p className="preview-lead">{draft.lead}</p>)}
    {draft.bodyBlocks.map(item => block(item.blockKey, <><p>{item.text}</p>{!!item.factIds.length && <div className="fact-links">{item.factIds.map((id, index) => <a key={id} href={`#fact-${id}`}>查看本段依据 {index + 1}</a>)}</div>}</>))}
    {block("callToAction", draft.callToAction && <p className="preview-cta">{draft.callToAction}</p>)}
    {!!draft.tags.filter(Boolean).length && <p className="preview-tags">{draft.tags.filter(Boolean).map(tag => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p>}
    {draft.selectedImages.filter(image => !knownKeys.includes(image.placement.blockKey)).map(image => <div key={image.imageId}><p className="error">此图插入位置待确认：{image.placement.blockKey}</p>{picture(image)}</div>)}
  </article>;
}
