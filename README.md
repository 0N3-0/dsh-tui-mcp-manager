# dsh-tui-mcp-manager

[English](README_EN.md) | 中文

面向 [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) 的原生 MCP Server 管理插件。
在聊天界面输入 `/mcp-manager`，即可通过 managed dialog 完成 MCP CRUD、启停、Sets、服务器复制、
Inspector、Tool schema、Doctor Lite 与 DSH credential reference 管理。所有服务器变更直接写入
当前 profile 的 `cordis.patch.yml`，不引入额外配置数据库。

## 功能

- 浮窗即时显示服务器状态；连接中的工具数显示为 `...`，可用 `↻ 刷新` 获取最新数量。
- 添加、复制、编辑、启停、重连和删除 MCP server；复制会生成新的 ID 与工具命名空间，默认保持禁用，并在完整表单确认后写入。
- MCP Sets 将多个已有服务器 ID 保存为集合；所有 Set 在树中独立启停，实际启用状态取活动 Set 的成员并集。重复成员仍只对应一个 Loader row，因此只启动一次；切换通过一次 `cordis.patch.yml` 批量写入完成。
- Set 树和各 Set 成员均可折叠；每个 Set 自带服务器池入口，可切换已有服务器成员、创建全新 MCP，或全局删除服务器并自动清理所有 Set 引用。
- Inspector 可查看服务器概览、已注册工具、参数 schema 和最近的明确运行错误。
- Doctor Lite 在一个浮窗中直接显示 Loader/Fiber、可执行文件或 URL、工作目录、凭据、现有运行时和工具数；失败项附带针对性的修复建议。重测复用 Loader/HMR，不会额外建立 MCP 连接。
- 完整配置 stdio 与 streamable-http transport。
- 编辑参数、工作目录、环境变量、请求头、超时、启动失败策略与自动重连参数。
- 敏感环境变量和请求头通过任意 DSH credential reference 保存，不写死 credential 名称。
- 字段编辑时按 Esc 回到表单总览并保留草稿；总览中的 Cancel 才放弃表单。
- 跟随 dsh-TUI 的 `/lang zh` 与 `/lang en` 语言选择。
- 表格和表单字段按终端单元格对齐，不依赖普通空格通过宿主 sanitizer。
- 图标沿用 dsh-TUI 风格的标准 Unicode 字符，不依赖 emoji 或私用区字体。

在服务器操作页中选择 `◇ 检查详情` 可逐层浏览工具和运行信息；选择 `✓ 诊断` 可在同一页查看检查值和失败建议，无需逐项打开详情。受 managed dialog 单行与数量上限约束，schema 采用逐字段页面展示，工具列表最多展示前 98 项。

## 安装

要求 Node.js `^22.19 || >=24` 与 dsh-TUI `0.9.x`；当前验证基线是 dsh-TUI 0.9.3。

```sh
dsh plugin --profile dsh-tui add github:0N3-0/dsh-tui-mcp-manager
dsh --profile dsh-tui
```

GitHub 安装直接使用仓库中已提交的 `lib/types/`，不需要 clone、构建或执行
`pnpm approve-builds`，也不需要修改 profile 的 `allowBuilds`。

进入 TUI 后输入：

```text
/mcp-manager
```

服务器与 Sets 都从这个浮窗入口管理，不额外暴露子命令参数。

语言由 dsh-TUI 统一管理：

```text
/lang zh
/lang en
```

卸载插件：

```sh
dsh plugin --profile dsh-tui remove dsh-tui-mcp-manager
```

## 文件原生化

`cordis.patch.yml` 是唯一事实源：

```text
dsh-TUI managed dialog
    -> atomic update of a managed block
$DSH_HOME/profiles/dsh-tui/cordis.patch.yml
    -> DSH patch watcher
Cordis Loader / HMR
    -> @deepseek-ai/dsh-mcp-client
```

服务器配置仍以 `cordis.patch.yml` 为唯一事实源；Set 定义单独保存在当前 profile 的
`mcp-manager.sets.yml`，只引用服务器 ID，不复制命令、endpoint 或凭据。Set 文件与服务器 patch
都使用同目录临时文件、fsync 和原子 rename。插件持久化多个活动 Set，启停节点时先计算所有活动
Set 的成员并集，再对服务器 patch 执行一次批量写入，不会循环调用单服务器启停。首次没有集合
时会自动创建一个包含当时全部 MCP 的“默认”集合；它保存后就是普通 Set，可以照常启停和编辑。

插件只修改下面的兼容 marker block，marker 外的 patch、注释和 `!!js` 表达式保持原样：

```yaml
# >>> dsh-mcp-manager: managed MCP server rows >>>
- insert:
    - id: mcp-manager--filesystem
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: filesystem
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', /workspace]
        env: {}
        cwd: ''
      x-dsh-mcp-manager:
        id: filesystem
        name: Filesystem
# <<< dsh-mcp-manager: managed MCP server rows <<<
```

保留旧 marker、row prefix 与 metadata key 是为了兼容已有配置，已有服务器无需复制。
含 credential reference 的 row 会在下一次保存时使用
`dsh-tui-mcp-manager/server` 适配器。

写入采用旁路锁、同目录临时文件、fsync 和原子 rename。提交前会同时校验 managed block
和整个 Cordis YAML 文件。

## 凭据相关

普通字段直接交给官方 MCP client。敏感字段只保存 credential reference，实际值通过 DSH
credentials API 写入。例如 Context7：

```text
Transport:          streamable-http
URL:                https://mcp.context7.com/mcp
Secret header:      api-key=MY_CONTEXT7_KEY
Credential value:   <your key>
```

`MY_CONTEXT7_KEY` 只是示例引用名，可以换成任何有效的 POSIX 标识符。profile patch 中只会出现：

```yaml
secretHeaders:
  api-key:
    ref: MY_CONTEXT7_KEY
    prefix: ''
```

当前 dsh-TUI input dialog 是单行明文输入，插件会提示凭据输入过程可见；保存后的服务器总览、
profile patch 和 RPC snapshot 都不会显示真实值。

## dsh-TUI 扩展契约

本包按当前社区约定提供：

- 独立仓库、MIT、纯 ESM、语义化版本与 Node engine 约束。
- 根入口只导出 Cordis `name`、`Config`、`apply`，不提供 default export。
- 相对导入使用 `.js`，TypeScript 生成 JS、source map 与 declaration。
- `dsh-plugin.json` 声明 Command contract、`commands.invoke` 权限与 Host facet。
- 通过 `ctx.get('tuiPluginHost', false)` 使用 mediated command registration。
- `tuiDialogs`、`tuiCommandTrees` 和 `tuiPluginHost` 都按可选能力探测；缺失时静默降级，不能阻止 TUI 启动。
- 每个注册和子 fiber 都绑定 Cordis 生命周期并在卸载时清理。

dsh-TUI 0.9.2 至 0.9.3 提供了本插件使用的 managed dialog 与 mediated command API，当前构建和
运行验证基线为 0.9.3。普通 Cordis Loader row 尚不一定自动绑定
Component identity。只有宿主明确返回 `COMPONENT_NOT_ADMITTED` 时，本包才退化到旧的
`commands.register`；权限拒绝、manifest 不兼容或其他 admission 错误不会被 fallback 绕过。

本仓库保持作者独立所有权，并使用无 scope 包名 `dsh-tui-mcp-manager`；这与
[dsh-TUI 生态收录标准](https://github.com/dsh-tui-ecosystem/dsh-tui-ecosystem/blob/main/CONTRIBUTING.md)
允许作者提交自有公开 GitHub 仓库、`npm` 字段可为空的模式一致，不需要为了收录迁移仓库或预占组织
scope。`lib/types/` 构建产物按模板约定纳入版本库，Git URL 安装不依赖发布者机器上已有的构建
目录。包不提供 `prepare`，因此 dsh 通过 pnpm 安装 Git 依赖时不会要求用户批准 TypeScript 构建
脚本；`prepack` 只负责在开发者打包时执行完整检查。

社区 manifest v0.15 目前仍是 experimental draft，本 README 只声明兼容该草案，不声称得到
官方认证。插件在宿主进程内运行，manifest permissions 是审计和宿主策略提示，不是操作系统
安全沙箱；安装等同于信任本包拥有当前用户对 profile patch 与 credentials provider 的权限。

## 从源码开发

```sh
git clone https://github.com/0N3-0/dsh-tui-mcp-manager.git
cd dsh-tui-mcp-manager
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile dsh-tui add .
```

本地 `add .` 用于开发联调，不是普通用户的安装方式。

## 构建与发布检查

```sh
pnpm typecheck
pnpm build
pnpm verify
npm pack --dry-run
pnpm smoke:package
```

`smoke:package` 会创建真实 tarball，在临时 consumer 目录安装后检查 root/server 入口可
resolve 和 import，并验证 bundle patch、manifest 入口与必要 runtime 文件都已进入包中。

构建产物：

```text
lib/types/index.js         Cordis 根入口
lib/types/plugin.js        文件管理服务与 TUI 接入
lib/types/server/index.js  credential-aware 单服务器适配器
lib/types/tui/index.js     managed dialog 与 /mcp-manager 命令
```

目录结构：

```text
dsh-plugin.json         社区 v0.15 experimental manifest
cordis.patch.yml        单一 Cordis Loader row
src/index.ts            精简的 Cordis 公共契约
src/plugin.ts           运行时组合与生命周期入口
src/host/               patch store、状态投影和配置 schema
src/host/set-store.ts   profile-local Set 定义与原子文件写入
src/server/             credential-aware MCP client 适配器
src/tui/                dsh-TUI 浮窗和表单
scripts/verify.mjs      manifest 与 Cordis 入口契约检查
```
