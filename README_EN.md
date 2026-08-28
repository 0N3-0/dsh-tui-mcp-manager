# dsh-tui-mcp-manager

[![CI](https://github.com/0N3-0/dsh-tui-mcp-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/0N3-0/dsh-tui-mcp-manager/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-tui-mcp-manager.svg)](https://www.npmjs.com/package/dsh-tui-mcp-manager)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [中文](README.md)

A native MCP server manager inside [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI).
Run `/mcp-manager` to open a full-screen control center for server configuration, Set orchestration,
runtime diagnostics, tool schemas, and credential references.

- Native full-screen Scene with every operation kept inside the terminal
- Uses the active profile's `cordis.patch.yml` instead of a second server database
- Supports both `stdio` and `streamable-http`
- Switches groups of MCP servers through Sets; shared members start only once
- Stores sensitive values through DSH credentials, never in the profile patch

## Quick Start

Requires Node.js `^22.19 || >=24` and dsh-TUI `>=0.9.3 <0.10.0`.

```sh
dsh plugin --profile dsh-tui add dsh-tui-mcp-manager
dsh --profile dsh-tui
```

Then run inside the TUI:

```text
/mcp-manager
```

Essential controls:

| Key | Action |
| --- | --- |
| `Tab` | Move focus between navigation and details |
| `↑` / `↓` | Select a node, action, field, or tool |
| `←` / `→` | Switch detail tabs |
| `Enter` | Open, edit, or confirm the selected item |
| `Esc` | Go back or cancel the current form |
| `w` | Switch between Set and server-pool workspaces |

The interface follows dsh-TUI's language setting. Use `/lang zh` or `/lang en` to change it.

## Interface Preview

![MCP server overview](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-servers.png)

[Set management](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-sets.png) ·
[Tools and schemas](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-tools.png) ·
[Create a Set](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-set-editor.png) ·
[Create a server](https://raw.githubusercontent.com/0N3-0/dsh-tui-mcp-manager/main/docs/images/mcp-manager-server-editor.png)

## What It Does

### Manage servers

- Create, duplicate, edit, reconnect, and delete MCP servers
- Configure commands, arguments, working directories, environment variables, headers, and endpoints
- Configure tool timeouts, startup-failure policy, and automatic reconnect behavior
- Delete a server globally and clean up its references from every Set
- Use the same navigation model at 60, 80, and 120 columns; long content scrolls only in the right pane

### Orchestrate MCP Sets

A Set contains existing server IDs and never duplicates server configuration. Each Set can be enabled
independently, while the effective runtime state is the union of all active Set members:

```text
Active Set A: context7, websearch
Active Set B: websearch, ghgrep
Actually run: context7, websearch, ghgrep
```

A shared server therefore still maps to one Loader row and starts only once. When no Sets exist, the
plugin creates a `Default` Set containing all current MCP servers. Once saved, it behaves exactly like
any other Set.

### Inspect tools and run automatic diagnostics

- The Tools tab shows registered tools, descriptions, and complete input schemas
- The Doctor tab automatically checks Loader/Fiber state, executable or URL, working directory,
  credentials, runtime state, and tool count when opened
- Failed checks include targeted remediation
- Retesting reuses Loader/HMR and does not establish another MCP connection

## Configuration and Data Safety

The active profile's `cordis.patch.yml` remains the source of truth for servers:

```text
Full-screen MCP manager
    -> atomic managed-block update
$DSH_HOME/profiles/dsh-tui/cordis.patch.yml
    -> DSH patch watcher
Cordis Loader / HMR
    -> @deepseek-ai/dsh-mcp-client
```

Set definitions live in `mcp-manager.sets.yml` under the same profile and contain only Set metadata and
server IDs. Both files use a sidecar lock, same-directory temporary file, `fsync`, and atomic rename.
The plugin modifies only the marker block below; patches, comments, and `!!js` expressions outside it
are preserved:

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

Legacy markers, row prefixes, and metadata keys remain compatible, so existing servers do not need a
manual migration.

### Credential references

Regular fields pass directly to the official MCP client. Sensitive environment variables and headers
store only a DSH credential reference in the patch. For example, a Context7 header can be configured as:

```text
Transport:          streamable-http
URL:                https://mcp.context7.com/mcp
Secret header:      api-key=MY_CONTEXT7_KEY
Credential value:   <your key>
```

Only the reference appears in the profile patch:

```yaml
secretHeaders:
  api-key:
    ref: MY_CONTEXT7_KEY
    prefix: ''
```

Credential values are masked while entered and never exposed in server summaries, profile patches, or
RPC snapshots.

## Update and Uninstall

Run the install command again to install the current npm version:

```sh
dsh plugin --profile dsh-tui add dsh-tui-mcp-manager
```

To uninstall:

```sh
dsh plugin --profile dsh-tui remove dsh-tui-mcp-manager
```

## Development From Source

```sh
git clone https://github.com/0N3-0/dsh-tui-mcp-manager.git
cd dsh-tui-mcp-manager
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile dsh-tui add .
```

Local `add .` is for development and integration testing. Regular users do not need to clone or build
the repository, run `pnpm approve-builds`, or edit the profile's `allowBuilds` setting.

Common checks:

```sh
pnpm typecheck
pnpm build
pnpm verify
npm pack --dry-run
pnpm smoke:package
```

`smoke:package` creates a real tarball, installs it in a temporary consumer project, and verifies the
bundle patch, manifest, runtime files, root entry, and server entry.

## Compatibility and Release Contract

- MIT licensed, pure ESM, semantic versioning, and committed build output shipped through npm
- The root entry follows the Cordis `name`, `Config`, and `apply` contract with no default export
- `dsh-plugin.json` follows the community manifest v0.15 experimental draft
- The UI registers only through the dsh-TUI Scene API; no unusable command is registered without it
- Registrations and child Fibers follow the Cordis lifecycle and are cleaned up on unload
- GitHub Releases publish through npm Trusted Publishing with GitHub Actions OIDC and no long-lived token

dsh-TUI 0.9.3 is the current build and runtime validation baseline. Manifest permissions are host audit
and policy declarations, not an operating-system sandbox. The plugin runs in the host process, so
installation means trusting it with the current user's profile patch and credentials provider access.

## License

[MIT](LICENSE) © 2026 0N3-0
