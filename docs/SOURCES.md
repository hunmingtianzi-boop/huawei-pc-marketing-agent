# 研究来源与适用边界

核对日期：2026-10-18（北京时间）。本包依据当前官方页面编写，用户本机安装版本须另验。

## 赛题

用户上传：华为·产业进阶赛道·赛题手册v4(1).pdf，9页。

- 第2、8页：提交材料、真实视频及案例要求。
- 第3—5页：自研 Agent 分工、场景平台要求、输出和核验约束。
- 第6—7页：官方 Skill、账号与指定库接入、目录回退。
- 第9页：评分、统一测试、处罚及排名晋级。

产品事实必须来自指定 ima 知识库；本包没有读取该知识库的真实内容。

## Codex 官方资料

1. Subagents
   https://learn.chatgpt.com/docs/agent-configuration/subagents
   核对：当前版本默认启用、直接委派、CLI /subagents、角色文件格式、继承行为及权限边界。
2. Configuration Reference
   https://learn.chatgpt.com/docs/config-file/config-reference
   核对：[agents] enabled、max_concurrent_threads_per_session，数量排除主线程。
3. AGENTS.md
   https://learn.chatgpt.com/docs/agent-configuration/agents-md
   核对：从全局到项目与当前目录的指令发现、override、启动时加载。
4. Config basics
   https://learn.chatgpt.com/docs/config-file/config-basic
   核对：项目配置仅在项目被信任时加载、配置层级。
5. Worktrees
   https://learn.chatgpt.com/docs/environments/git-worktrees
   核对：独立 checkout、聊天与文件隔离的关系、Git 元数据共享。
6. Developer commands
   https://learn.chatgpt.com/docs/developer-commands?surface=cli
   核对：当前 CLI 的命令与诊断；CLI 命令不直接用于 ChatGPT 网页。
7. Command line options
   https://learn.chatgpt.com/docs/cli/reference
   核对：启动、版本、resume 和 fork 等参数。
8. Projects and chats
   https://learn.chatgpt.com/docs/projects
   核对：项目与多个聊天的组织方式、恢复时仍读取当前工作树。

旧 developers.openai.com/codex 的相关页面已经重定向至上述官方地址。不要把旧教程的具体配置作为当前版本的唯一依据。

## ima 官方原包

https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip

静态下载文件为 62,183 bytes。
SHA-256：7e0d07cae0f98145dc5147e84b77bcc557e2fc4b256b08907922637952c20a7b

检查文件：ima_api.cjs、meta.json、knowledge-base/SKILL.md、knowledge-base/references/api.md，及相关笔记接口文档。结论见 IMA_RESEARCH.md。本包没有重新分发官方压缩包或官方完整文档。

官方凭证页面：https://ima.qq.com/agent-interface

未执行该包、未取得凭证、未发送实际账号请求。资料字段冲突、实际图片组织及可访问性须以只读实测确认。

## Git 命令参考

- Git worktree：https://git-scm.com/docs/git-worktree
  核对：按基准提交创建独立分支工作树的命令语法。

## 应用架构参考

- Next.js Route Handlers：https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js 环境变量：https://nextjs.org/docs/app/guides/environment-variables

这些页面支持所提默认实现方式，不意味着当前项目已安装或锁定了依赖版本。

## 我们提出的工程判断

三轮主对话、三个并发子线程、四类角色、文件所有权、阶段门槛、单仓库技术栈与内部数据契约均为针对本题的实施建议，不是比赛或 Codex 官方强制规定。

已验证的是文档事实与开发包结构；客户端角色实际加载、工作树创建、真实调用、运行质量和提交页面可访问性均须在用户项目执行后才能宣称完成。

