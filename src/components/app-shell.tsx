"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MarketingWorkbench from "./marketing-workbench";
export const NAVIGATION = [
  { href: "/", label: "首页" }, { href: "/create", label: "内容创作" },
  { href: "/history", label: "任务记录" }, { href: "/library", label: "产品资料" },
  { href: "/settings", label: "服务设置" },
] as const;
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <><a className="skip-link" href="#main-content">跳转到内容</a><header className="site-header"><div className="header-inner"><Link className="site-brand" href="/" aria-label="PC 内容工作台首页"><span>PC</span> 内容工作台</Link><nav aria-label="主导航">{NAVIGATION.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav><span className="header-caption">华为 PC 营销智能体</span></div></header><main id="main-content" tabIndex={-1}>{children}<MarketingWorkbench active={pathname === "/create"} /></main><footer className="site-footer"><span>PC 内容工作台</span><p>独立参赛作品 / 授权资料只读 / local 来源如实标注 / 图文导出不代表发布</p></footer></>;
}
