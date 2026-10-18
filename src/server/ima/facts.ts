import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { FactPoint, SourceView } from "../../contracts";
import type { ProductEvidence } from "../../contracts/business";

type Fact = z.infer<typeof FactPoint>;
const specSections = new Set(["操作系统", "尺寸与重量", "屏幕", "处理器", "存储", "内存", "无线连接", "电池", "接口", "键盘和触控板", "摄像头", "音频", "包装清单", "续航", "连接", "功能", "重量", "尺寸", "性能", "充电", "显示", "规格", "产品参数"]);
const unsafe = /忽略.{0,12}(指令|规则|提示)|system\s*prompt|api[_ -]?key|执行.{0,10}(命令|脚本)|ignore.{0,20}(instruction|previous)/i;
const clean = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
const modelBase = (s: string) => s.replace(/（鸿蒙版）$/, "").replace(/\s+/g, " ").trim();

/** Deliberately conservative: structured rows and explicit specification sections only. */
export function extractFacts(document: string, productKey: string, displayName: string, fileName: string, at: string) {
  const lines = document.split(/\r?\n/);
  const facts: Fact[] = [];
  const sources: SourceView[] = [];
  const conflicts: ProductEvidence["conflicts"] = [];
  const coverageGaps: string[] = [];
  const globalQualifiers: string[] = [];
  let inNotes = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) inNotes = /说明|注意事项|测试条件|注释|限制条件/.test(line);
    const value = clean(line.replace(/^[-*]\s+/, ""));
    if ((inNotes || /^(?:注[：:]|备注[：:]|测试条件[：:]|限制[：:])/.test(value)) && value && !/^#/.test(value) && !/https?:\/\//i.test(value) && !unsafe.test(value)) globalQualifiers.push(value);
  }
  function add(fieldKey: string, value: string, start: number, end: number, qualifiers: string[] = []) {
    const statement = clean(value);
    if (!statement || /https?:\/\//i.test(statement)) return;
    if (unsafe.test(statement)) { coverageGaps.push(`第 ${start}–${end} 行包含非事实指令文本，未纳入事实。`); return; }
    const source: SourceView = { citationKey: randomUUID(), sourceTitle: displayName, locatorLabel: `${fileName} / ${fieldKey} / 第 ${start}–${end} 行`, supportingExcerpt: statement.slice(0, 600), retrievedAt: at, reviewAccess: "ima_client_required" };
    sources.push(source);
    facts.push({ factId: randomUUID(), productKey, fieldKey, value: statement, unit: null, qualifiers: [...new Set([...globalQualifiers, ...qualifiers])], supportedStatement: statement, sourceIds: [source.citationKey], status: "supported" });
  }
  // The live-confirmed source uses ## specification sections with plain text.
  let current: { title: string; start: number; rows: string[] } | null = null;
  function flush(end: number) {
    if (current?.rows.length) add(current.title, current.rows.join("\n"), current.start + 1, end);
    current = null;
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^#{2,6}\s+(.+?)\s*#*$/);
    if (heading) {
      flush(index);
      const title = clean(heading[1]);
      if (specSections.has(title)) current = { title, start: index, rows: [] };
      continue;
    }
    if (current && line.trim() && !/^\|/.test(line) && !/^!\[/.test(line)) current.rows.push(line.trim());
  }
  flush(lines.length);
  // Strict parameter/value tables are useful for controlled tests and alternate
  // documents; arbitrary prose is never promoted to a fact by colon guessing.
  for (let i = 0; i < lines.length - 2; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|\-]+\|?\s*$/.test(lines[i + 1])) continue;
    const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(clean);
    const headers = cells(lines[i]);
    const key = headers.findIndex(s => /^(参数|字段|项目|事实点)$/.test(s));
    const val = headers.findIndex(s => /^(值|规格|参数值|内容)$/.test(s));
    const condition = headers.findIndex(s => /^(条件|限制|适用范围|备注)$/.test(s));
    if (key < 0 || val < 0) continue;
    let row = i + 2;
    for (; row < lines.length && /^\s*\|/.test(lines[row]); row++) {
      const values = cells(lines[row]);
      if (values[key] && values[val]) add(values[key], `${values[key]}：${values[val]}`, row + 1, row + 1, condition >= 0 && values[condition] ? [values[condition]] : []);
    }
    i = row - 1;
  }
  // The entire document remains private; only model tokens necessary to detect
  // a near-model contamination are inspected here.
  const mentioned = [...document.matchAll(/(?:HUAWEI\s+)?MateBook\s+(?:X\s+Pro|D\s+\d+|\d+(?:\s+Pro)?)(?:（鸿蒙版）)?/gi)].map(m => modelBase(m[0]).replace(/^HUAWEI\s+/i, ""));
  const target = modelBase(displayName).replace(/^HUAWEI\s+/i, "");
  if (mentioned.some(name => name.toLowerCase() !== target.toLowerCase())) {
    for (const fact of facts) fact.status = "conflicted";
    if (sources.length) conflicts.push({ fieldKey: "product_model", sourceIds: sources.map(s => s.citationKey), message: "原文出现与当前产品不同的 MateBook 型号，需确认适用范围后重新取证。" });
    else coverageGaps.push("原文包含其他型号，且未提取可核查的事实来源。");
  }
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    const key = `${fact.fieldKey}\u0000${JSON.stringify(fact.qualifiers)}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  for (const group of groups.values()) if (new Set(group.map(f => f.value)).size > 1) {
    for (const fact of group) fact.status = "conflicted";
    conflicts.push({ fieldKey: group[0].fieldKey, sourceIds: group.flatMap(f => f.sourceIds), message: `同一条件下的「${group[0].fieldKey}」存在不同原文值，已停止采用该事实。` });
  }
  if (!facts.length) coverageGaps.push("未从已读取原文识别到支持的规格节或参数表，尚无可用于生成的事实。");
  return { facts, sources, conflicts, coverageGaps };
}
