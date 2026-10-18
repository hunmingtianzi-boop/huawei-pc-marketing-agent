# 主控使用的子任务模板

这是给 Codex 主控用的委派格式，用户不需要逐个填写。主控必须用真实子智能体工具启动任务；具体工具由当前客户端提供，不把工具函数名伪装成用户需要运行的命令。

## 每次委派都填写

    task_id:
    role:
    objective:
    mode: read-only 或 implementation
    worktree_absolute_path:
    branch:
    base_commit:
    contract_version:
    read_first:
    allowed_write_paths:
    prohibited_paths:
    dependencies_and_existing_interfaces:
    acceptance_criteria:
    verification_commands:
    expected_deliverables:

实现任务的工作树路径、分支和 commit 必须来自主控实际检查结果，不能填假的占位值后声称任务已启动。只读调查可在普通目录执行；尚未初始化 Git 时，branch/base_commit/contract_version 明确填写“不适用”或“草案”，worktree_absolute_path 填实际只读工作目录，并说明尚未创建 worktree。

## 随任务下发的执行规则

先核对当前目录与 Git 根，阅读适用 AGENTS.md 及所列文件。只在已分配的工作树和路径中修改；不扩大角色，不继续派生下一级智能体。

共享数据契约、依赖/锁与根配置由主控负责；发现缺口时返回具体建议，不自行换接口。不得覆盖、回退其他任务修改。

事实结论附来源，运行结论附实际命令和结果。不要输出任何密钥或敏感访问方式。若被服务、权限或未知字段阻塞，将状态和最小待确认项交回主控，继续不受影响的任务。

implementation 完成时只提交本任务允许路径，返回 commit。read-only 默认不修改源码；若运行验证产生日志，放任务专用且被忽略的临时目录。

## 返回格式

    status: PASS / BLOCKED / FAIL
    task_id:
    base_commit:
    result_commit: 实现任务填写；只读任务写不适用
    changed_files:
    implemented_behavior:
    verified_commands_and_results:
    evidence_paths:
    unresolved_items:
    requested_shared_changes:
    next_action:

PASS 只表示该任务列出的验收条件有证据通过，不能代替整个项目验收。主控仍要审查范围、实际差异与集成结果。

