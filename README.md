# dsh-tui-mcp-manager

[![CI](https://github.com/0N3-0/dsh-tui-mcp-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/0N3-0/dsh-tui-mcp-manager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-tui-mcp-manager.svg)](https://www.npmjs.com/package/dsh-tui-mcp-manager)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README_EN.md) | 中文

在 [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) 内原生管理 MCP 服务器。
输入 `/mcp-manager` 即可打开全屏控制台，集中完成服务器配置、Set 编排、运行诊断、
工具 Schema 查看和凭据引用管理。

- 原生全屏 Scene，全部操作都在终端内完成
- 直接读写当前 profile 的 `cordis.patch.yml`，不维护第二份服务器数据库
- 同时支持 `stdio` 与 `streamable-http`
- 通过 Set 批量切换 MCP；跨 Set 的重复服务器只启动一次
- 敏感值由 DSH credentials 保存，不会写入 profile patch

## 快速开始

要求：Node.js `^22.19 || >=24`，dsh-TUI `>=0.9.3 <0.10.0`。

```sh
dsh plugin --profile dsh-tui add dsh-tui-mcp-manager
dsh --profile dsh-tui
```

进入 TUI 后运行：

```text
/mcp-manager
```

常用操作：

| 按键 | 操作 |
| --- | --- |
| `Tab` | 在左侧导航与右侧详情之间切换焦点 |
| `↑` / `↓` | 选择节点、操作、字段或工具 |
| `←` / `→` | 切换详情标签 |
| `Enter` | 打开、编辑或确认当前项目 |
| `Esc` | 返回上一级或取消当前表单 |
| `w` | 切换 Set 与服务器池工作区 |

界面语言跟随 dsh-TUI，可通过 `/lang zh` 或 `/lang en` 切换。

## 界面预览

![MCP 服务器概览](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-servers.png)

[Set 管理](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-sets.png) ·
[工具与 Schema](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-tools.png) ·
[创建 Set](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-set-editor.png) ·
[创建服务器](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-server-editor.png)

## 能做什么

### 管理服务器

- 创建、复制、编辑、重连和删除 MCP 服务器
- 完整配置命令、参数、工作目录、环境变量、请求头与 endpoint
- 配置工具超时、启动失败策略和自动重连参数
- 从服务器池全局删除服务器，并自动清理所有 Set 中的引用
- 在 60、80、120 列终端中使用同一套导航逻辑；长内容只滚动右栏

### 编排 MCP Sets

Set 是现有服务器 ID 的集合，不会复制服务器配置。每个 Set 都能独立启停，最终运行的服务器
是所有活动 Set 成员的并集：

```text
启用 Set A: context7, websearch
启用 Set B: websearch, ghgrep
实际启动:  context7, websearch, ghgrep
```

因此，同一服务器即使属于多个活动 Set，也仍然只有一个 Loader row，只会启动一次。首次没有
任何 Set 时，插件会创建包含当前全部 MCP 的 `Default` Set；保存后它与其他 Set 完全相同。

### 查看工具与自动诊断

- 工具页展示当前已注册工具、说明和完整输入 Schema
- 诊断页打开时自动检查 Loader/Fiber、可执行文件或 URL、工作目录、凭据、运行时和工具数
- 失败检查会给出对应的修复建议
- 重新诊断复用 Loader/HMR，不会额外建立一条 MCP 连接

## 配置与数据安全

服务器配置的唯一事实源是当前 profile 的 `cordis.patch.yml`：

```text
全屏 MCP 管理器
    -> 原子更新 managed block
$DSH_HOME/profiles/dsh-tui/cordis.patch.yml
    -> DSH patch watcher
Cordis Loader / HMR
    -> @deepseek-ai/dsh-mcp-client
```

Set 定义保存在同一 profile 的 `mcp-manager.sets.yml`，其中只包含 Set 信息和服务器 ID。
两个文件都通过旁路锁、同目录临时文件、`fsync` 与原子 rename 写入。插件只修改带有下列 marker
的区块，marker 外的 patch、注释和 `!!js` 表达式会保持原样：

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

已有的旧 marker、row prefix 和 metadata key 会继续兼容，无需手工迁移服务器。

### 凭据引用

普通字段直接传给官方 MCP client；敏感环境变量和请求头只在 patch 中保存 DSH credential
reference。例如为 Context7 配置请求头：

```text
Transport:          streamable-http
URL:                https://mcp.context7.com/mcp
Secret header:      api-key=MY_CONTEXT7_KEY
Credential value:   <your key>
```

profile patch 中只会出现引用：

```yaml
secretHeaders:
  api-key:
    ref: MY_CONTEXT7_KEY
    prefix: ''
```

输入中的凭据值会以圆点遮蔽，保存后的服务器概览、profile patch 和 RPC snapshot 都不会显示
真实值。

## 更新与卸载

重新执行安装命令即可安装 npm 上的当前版本：

```sh
dsh plugin --profile dsh-tui add dsh-tui-mcp-manager
```

卸载：

```sh
dsh plugin --profile dsh-tui remove dsh-tui-mcp-manager
```

## 从源码开发

```sh
git clone https://github.com/0N3-0/dsh-tui-mcp-manager.git
cd dsh-tui-mcp-manager
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile dsh-tui add .
```

本地 `add .` 仅用于开发联调。普通用户不需要 clone、构建仓库、执行 `pnpm approve-builds`
或修改 profile 的 `allowBuilds`。

常用检查：

```sh
pnpm typecheck
pnpm build
pnpm verify
npm pack --dry-run
pnpm smoke:package
```

`smoke:package` 会创建真实 tarball，在临时 consumer 项目中安装，并检查 bundle patch、manifest、
运行时文件以及根入口和服务器入口。

## 兼容与发布约定

- MIT、纯 ESM、语义化版本，构建产物随仓库和 npm 包发布
- 根入口遵循 Cordis `name`、`Config`、`apply` 契约，不提供 default export
- `dsh-plugin.json` 使用社区 manifest v0.15 experimental draft
- 界面只通过 dsh-TUI Scene API 注册；缺少 Scene API 时不会注册不可用的命令
- 注册项与子 Fiber 都绑定 Cordis 生命周期，并在卸载时清理
- GitHub Release 通过 npm Trusted Publishing（GitHub Actions OIDC）发布，不保存长期 npm token

dsh-TUI 0.9.3 是当前构建和运行验证基线。manifest 权限是宿主审计与策略声明，不是操作系统
安全沙箱；插件运行于宿主进程内，安装即代表信任本包访问当前 profile patch 与 credentials
provider。

## License

[MIT](LICENSE) © 2026 0N3-0
