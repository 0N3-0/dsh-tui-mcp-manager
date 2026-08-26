# dsh-tui-mcp-manager

面向 dsh-TUI 的原生 MCP Server 管理插件。输入 `/mcp-manager` 后，管理器通过宿主提供的
managed dialog 显示为聊天界面上的浮窗，并直接编辑当前 profile 的 `cordis.patch.yml`。

## 功能

- 浮窗即时显示服务器状态；连接中的工具数显示为 `...`，可用 `↻ 刷新` 获取最新数量。
- 添加、复制、编辑、启停、重连和删除 MCP server；复制会生成新的 ID 与工具命名空间，默认保持禁用，并在完整表单确认后写入。
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

要求 Node.js `^22.19 || >=24` 与 dsh-TUI `0.9.x`；当前验证基线是 dsh-TUI 0.9.2。

```sh
pnpm install
pnpm check
dsh plugin --profile dsh-tui add .
dsh --profile dsh-tui
```

进入 TUI 后输入：

```text
/mcp-manager
```

语言由 dsh-TUI 统一管理：

```text
/lang zh
/lang en
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

## 凭据与 Context7

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

dsh-TUI 0.9.2 已提供 mediated command API，但普通 Cordis Loader row 尚不一定自动绑定
Component identity。只有宿主明确返回 `COMPONENT_NOT_ADMITTED` 时，本包才退化到旧的
`commands.register`；权限拒绝、manifest 不兼容或其他 admission 错误不会被 fallback 绕过。

当前包名保留为无 scope 的 `dsh-tui-mcp-manager`，便于先推到个人远端。若后续被生态组织
收录，再将 npm 包名和 Cordis row 一并迁移为约定的 `@dsh-tui-ecosystem/<name>`；不要在没有
组织发布权限时预占该 scope。`lib/types/` 构建产物按模板约定纳入版本库，Git URL 安装不依赖
发布者机器上已有的构建目录。

社区 manifest v0.15 目前仍是 experimental draft，本 README 只声明兼容该草案，不声称得到
官方认证。插件在宿主进程内运行，manifest permissions 是审计和宿主策略提示，不是操作系统
安全沙箱；安装等同于信任本包拥有当前用户对 profile patch 与 credentials provider 的权限。

## 构建与发布检查

```sh
pnpm typecheck
pnpm build
pnpm verify
npm pack --dry-run
```

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
src/server/             credential-aware MCP client 适配器
src/tui/                dsh-TUI 浮窗和表单
scripts/verify.mjs      manifest 与 Cordis 入口契约检查
```
