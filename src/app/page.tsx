import ConnectionPanel from "@/components/connection-panel";
import MarketingWorkbench from "@/components/marketing-workbench";
export default function Page() {
  return <main>
    <header className="masthead"><span className="brand"><i /> PC 内容工作台</span><span className="phase">第二阶段 / 图文与核验</span></header>
    <section className="intro"><p className="eyebrow">华为 PC · 营销智能体</p><h1>从真实依据，<br />到可核验的表达。</h1><p className="lede">确定人群与场景，读取 ima 产品资料和图片，生成适合渠道的内容。每次修改都需重新核验，导出由服务端把关。</p></section>
    <MarketingWorkbench />
    <details className="connection-details"><summary>资料接入检查 · 单份原文与单张图</summary><ConnectionPanel /></details>
    <footer>本机单用户工作台 · ima 资料只读 · 图片与产品事实均须有来源依据 · 导出不代表已发布</footer>
  </main>;
}
