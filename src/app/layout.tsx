import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import "./globals.css";
import "./platform-preview.css";
export const metadata: Metadata = { title: "华为 PC 营销工作台", description: "从真实资料到策略、图文、核验与导出。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
