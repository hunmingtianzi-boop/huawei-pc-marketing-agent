import type { z } from "zod";
import type { Platform } from "../../contracts";

/** Prompt guidance only; provenance, citations and publish gates remain code controlled. */
export function platformWritingGuide(platform: z.infer<typeof Platform>) {
  if (platform === "wechat_moments") return {
    format: "朋友圈社交短文",
    title: "一句场景话题，避免报告标题；产品全名可放正文，不要求标题堆型号",
    lead: "空字符串，把开场融入唯一正文块",
    body: "只有core块，约80–160字。像自然分享一条选购提醒：从真实需求提问切入，只写唯一提供的核心事实及原有限定条件，接一个待核对的问题。不要编号、节标题、长清单或堆参数。",
    callToAction: "一句自然邀请，聊具体需求或咨询适用范围，不用硬广口号，不假设线下门店存在",
    tags: "空数组",
  };
  if (platform === "xiaohongshu") return {
    format: "小红书可收藏的选购笔记",
    title: "约12–22个汉字，场景+选购问题/清单；不必包含产品全名，正文准确写product.displayName。禁止亲测感叹或人气暗示",
    lead: "约30–60字说明这份清单用于核对需求，轻松直接，不写产品效果结论",
    body: "约180–350字，按outline写3–4个短块。每块用“□ 学习需求”“□ 阅读资料”“□ 携带条件”等场景相关清单小标题开头，再用短句写一个核对点和对应事实。每条事实在所在块绑定factIds并保留条件。不要写成长篇资料解读，不要虚构第一人称经历。",
    callToAction: "明确邀请收藏清单，并留言自己的课程/工作需求；不要三个平台使用同一通用CTA",
    tags: "3–5个自然标签，数组内不加#；仅从产品名称、场景、人群和选购主题中选词，不加无依据卖点或热度词",
  };
  return {
    format: "公众号场景选购文章",
    title: "有阅读主题的完整标题，从场景问题切入，避免口号和清单笔记式感叹",
    lead: "约70–110字，交代读者的任务与本文核对路径，不提前替产品给出优势结论",
    body: "约450–700字，按outline写3–4个有实质内容的分节。每块第一行用【场景相关小标题】，后续一至两段连贯解释。选用3–4条必要事实，在所在块绑定factIds并原样保留qualifiers；解释事实的适用范围，再提出与场景相关的具体核对问题和步骤。讨论显示信息时不能推导护眼效果，讨论系统时不能推导软件兼容，讨论重量时不能推导便携体验。不要把参数机械逐项复述或用没有证据的结论凑长度。资料有限时缩短，不编造。",
    callToAction: "引导读者整理自己的任务、待确认条件后咨询具体配置，体现读完文章后的下一步",
    tags: "空数组",
  };
}
