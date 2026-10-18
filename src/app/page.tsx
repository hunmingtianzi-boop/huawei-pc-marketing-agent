import ConnectionPanel from "@/components/connection-panel";
import MarketingWorkbench from "@/components/marketing-workbench";
export default function Page() {
  return <main>
    <header className="masthead"><span className="brand"><i /> PC 内容工作台</span><span className="phase">本地知识库 / 实际模型</span></header>
    <section className="intro"><p className="eyebrow">华为 PC · 营销智能体</p><h1>同一份依据，<br />三种平台表达。</h1><p className="lede">从本地产品原文和图片出发，生成朋友圈、小红书与公众号图文。看清平台排版，核实每条依据，修改重验后导出。</p></section>
    <MarketingWorkbench />
    <details className="connection-details"><summary>历史 ima 接入检查 · 可选，不用于默认本地流程</summary><ConnectionPanel /></details>
    <footer>本机单用户工作台 · 本地资料只读 · local 来源如实标注 · 图片与产品事实均须有来源依据 · 导出不代表已发布</footer>
  </main>;
}
