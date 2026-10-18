import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "华为 PC 营销工作台 · 接入检查", description: "从真实资料开始，生成有依据的内容。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
