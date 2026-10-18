import ConnectionPanel from "@/components/connection-panel";
export default function Page() {
  return <main>
    <header className="masthead"><span className="brand"><i /> PC 内容工作台</span><span className="phase">第一阶段 / 接入检查</span></header>
    <section className="intro"><p className="eyebrow">华为 PC · 营销智能体</p><h1>让每一句卖点，<br />都有据可查。</h1><p className="lede">先连接指定知识库，确认产品资料与图片。内容策略、图文生成与成稿导出将在后续阶段开放。</p></section>
    <ConnectionPanel />
    <footer>本机单用户预览 · 知识库只读 · 真实接入通过后再进入内容制作</footer>
  </main>;
}
