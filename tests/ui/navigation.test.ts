import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { HomePage, HistoryPage, LibraryPage } from "../../src/components/resource-pages";

test("home, records and library render distinct purposes without invented records or catalog", () => {
 const home=renderToStaticMarkup(createElement(HomePage));
 const history=renderToStaticMarkup(createElement(HistoryPage));
 const library=renderToStaticMarkup(createElement(LibraryPage));
 assert.ok(home.includes("好产品")); assert.ok(home.includes('href="/create"'));
 assert.equal(home.includes("完整产品型号"),false);
 assert.ok(history.includes("搜索任务")); assert.ok(history.includes("全部状态"));
 assert.ok(library.includes("搜索产品")); assert.ok(library.includes("授权本地知识库"));
 for(const markup of [home,history,library])assert.equal(markup.includes('class="run-card"'),false);
});

test("global navigation resolves actual pages and keeps one persistent workbench when routes change", () => {
 const sourcePath=path.join(process.cwd(),"src/components/app-shell.tsx"),sourceRequire=createRequire(sourcePath);
 const compiled=ts.transpileModule(readFileSync(sourcePath,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 let pathname="/"; const Workbench=()=>null; const Link=()=>null;
 const mod={exports:{} as any};
 new Function("require","module","exports",compiled)((id:string)=>id==="next/navigation"?{usePathname:()=>pathname}:id==="next/link"?{__esModule:true,default:Link}:id==="./marketing-workbench"?{__esModule:true,default:Workbench}:sourceRequire(id),mod,mod.exports);
 const nodes=(tree:any):any[]=>!tree||typeof tree!=="object"?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
 for(const route of ["/","/create","/history","/library","/settings"]){
  pathname=route; const tree=nodes(mod.exports.default({children:createElement("div",null,route)}));
  const workbenches=tree.filter(node=>node.type===Workbench);
  assert.equal(workbenches.length,1); assert.equal(workbenches[0].props.active,route==="/create");
  const links=tree.filter(node=>node.type===Link&&node.props["aria-current"]==="page");
  assert.equal(links.length,1);assert.equal(links[0].props.href,route);
  assert.ok(readFileSync(path.join(process.cwd(),"src/app",route.slice(1),"page.tsx"),"utf8"));
 }
});
