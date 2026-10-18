"use client";
import { useEffect } from "react";
// This route leaf changes with Next's searchParams while the layout-owned editor stays mounted.
export default function CreationSelection({ runId, product }: { runId?: string; product?: string }) {
  useEffect(() => { window.dispatchEvent(new Event("workbench-selection-change")); }, [runId, product]);
  return <p className="create-eyebrow">内容创作 / 从任务到核验成稿</p>;
}
