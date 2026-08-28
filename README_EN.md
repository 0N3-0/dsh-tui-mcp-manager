# dsh-tui-mcp-manager

English | [中文](README.md)

A native MCP server manager for [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI).
Run `/mcp-manager` in the chat interface to open a native full-screen MCP control center for MCP CRUD,
Sets, server duplication, tool schemas, Doctor checks, and DSH credential references. All server changes
are written directly to the active profile's `cordis.patch.yml`; no additional configuration database is
introduced. The plugin requires dsh-TUI 0.9.3 or a newer 0.9.x release.

## Interface Preview

![MCP server overview](docs/images/mcp-manager-servers.png)

More views: [Set management](docs/images/mcp-manager-sets.png) ·
[Tool list](docs/images/mcp-manager-tools.png) ·
[Create Set](docs/images/mcp-manager-set-editor.png) ·
[Create server](docs/images/mcp-manager-server-editor.png)

## Features

- Uses Set and server-pool workspaces in a two-pane full-screen interface. Server overview, tools and
  schemas, Doctor checks, and configuration live on separate tabs; long content scrolls only in the
  right pane and never damages navigation.
- Gives navigation and detail explicit focus. `Tab` changes panes and arrow keys select nodes, actions,
  and tools. The same bindings work in tested 60-, 80-, and 120-column layouts.
- Adds, duplicates, edits, enables, disables, reconnects, and deletes MCP servers. A duplicate receives a new ID and tool namespace, remains disabled by default, and is written only after the full form is confirmed.
- Stores groups of existing server IDs as MCP Sets. Each Set can be enabled independently, while the effective state is the union of all active Sets. A server shared by several Sets still maps to one Loader row and starts only once. Set switching updates `cordis.patch.yml` in one batch write.
- Shows each Set's members and runtime state, and edits membership directly against the global server
  pool. The server workspace creates new MCP servers or deletes one globally while cleaning up every Set
  reference.
- The Tools tab shows the complete registered-tool list, descriptions, and input schemas through a
  pane-local viewport.
- The Doctor tab runs automatically when opened and reports Loader/Fiber state, executable or URL,
  working directory, credentials, current runtime, and tool count. Failed checks include targeted
  remediation. Retesting reuses Loader/HMR and does not create another MCP connection.
- Fully configures both `stdio` and `streamable-http` transports.
- Edits arguments, working directory, environment variables, request headers, timeouts, startup-failure policy, and automatic reconnect settings.
- Stores sensitive environment variables and headers through arbitrary DSH credential references instead of hard-coded credential names.
- In the full-screen form, Enter returns from field editing to form navigation and Esc cancels the whole
  form. Save and Cancel are also selectable rows.
- Reads the dsh-TUI language selected with `/lang zh` or `/lang en` when the manager opens.
- Aligns tables and form fields by terminal cells without depending on regular spaces surviving the host sanitizer.
- Uses the standard Unicode symbols from dsh-TUI and does not depend on emoji or private-use fonts.

## Installation

Requires Node.js `^22.19 || >=24` and dsh-TUI `>=0.9.3 <0.10.0`. The current verified baseline is
dsh-TUI 0.9.3.

```sh
dsh plugin --profile dsh-tui add github:0N3-0/dsh-tui-mcp-manager
dsh --profile dsh-tui
```

The GitHub installation uses the committed `lib/types/` output directly. Users do not need to clone
the repository, build it, run `pnpm approve-builds`, or modify the profile's `allowBuilds` setting.

In the TUI, run:

```text
/mcp-manager
```

Both servers and Sets are managed from this entry point; no additional command arguments are exposed.

dsh-TUI controls the interface language:

```text
/lang zh
/lang en
```

To uninstall:

```sh
dsh plugin --profile dsh-tui remove dsh-tui-mcp-manager
```

## File-Native Configuration

`cordis.patch.yml` is the source of truth for server configuration:

```text
dsh-TUI full-screen Scene
    -> atomic update of a managed block
$DSH_HOME/profiles/dsh-tui/cordis.patch.yml
    -> DSH patch watcher
Cordis Loader / HMR
    -> @deepseek-ai/dsh-mcp-client
```

Server configuration remains in `cordis.patch.yml`. Set definitions are stored separately in
`mcp-manager.sets.yml` under the active profile and contain only server IDs, never duplicated commands,
endpoints, or credentials. Both files use a same-directory temporary file, `fsync`, and atomic rename.
The plugin persists multiple active Sets, computes the union of their members, and applies the resulting
server state with one patch write instead of toggling servers one by one. If no Sets exist, it creates a
default Set containing all current MCP servers. Once saved, it behaves like any other Set.

The plugin modifies only the compatible marker block below. Patches, comments, and `!!js` expressions
outside the block are preserved:

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

Legacy markers, row prefixes, and metadata keys are retained for compatibility, so existing servers do
not need to be copied. Rows containing credential references use the
`dsh-tui-mcp-manager/server` adapter the next time they are saved.

Writes use a sidecar lock, a same-directory temporary file, `fsync`, and atomic rename. Both the managed
block and the complete Cordis YAML document are validated before commit.

## Credential References

Regular fields are passed directly to the official MCP client. Sensitive fields store only a credential
reference; the value is written through the DSH credentials API. For example, with Context7:

```text
Transport:          streamable-http
URL:                https://mcp.context7.com/mcp
Secret header:      api-key=MY_CONTEXT7_KEY
Credential value:   <your key>
```

`MY_CONTEXT7_KEY` is only an example reference name and can be replaced with any valid POSIX identifier.
The profile patch contains only:

```yaml
secretHeaders:
  api-key:
    ref: MY_CONTEXT7_KEY
    prefix: ''
```

The full-screen form masks credential values with bullets while they are entered. Saved values are not
exposed in server summaries, profile patches, or RPC snapshots.

## dsh-TUI Extension Contract

The package follows the current community conventions:

- Independent repository, MIT license, pure ESM, semantic version, and an explicit Node.js engine range.
- The root entry exports only the Cordis `name`, `Config`, and `apply` contract, with no default export.
- Relative imports use `.js`; TypeScript generates JavaScript, source maps, and declarations.
- `dsh-plugin.json` declares the Command contract, `commands.invoke` permission, and Host facet.
- Mediated command registration uses `ctx.get('tuiPluginHost', false)`.
- `tuiScenes` is the only interface capability. `tuiCommandTrees` and `tuiPluginHost` are capability-
  probed. Without the Scene API the plugin does not register an unusable command and cannot prevent
  dsh-TUI from starting.
- Every registration and child fiber is bound to the Cordis lifecycle and cleaned up on unload.

dsh-TUI 0.9.3 provides the Scene and mediated command APIs used by the plugin and is the current build and
runtime baseline. A regular Cordis Loader row does not necessarily bind a Component identity. The package
uses the base `commands.register` service only when the host explicitly returns `COMPONENT_NOT_ADMITTED`;
permission denials, manifest incompatibility, and other admission errors are not bypassed.

This repository remains independently owned and uses the unscoped package name
`dsh-tui-mcp-manager`. This matches the [dsh-TUI ecosystem listing rules](https://github.com/dsh-tui-ecosystem/dsh-tui-ecosystem/blob/main/CONTRIBUTING.md),
which allow authors to submit their own public GitHub repositories and allow the `npm` field to be empty.
Listing does not require moving the repository or claiming an organization scope. The committed
`lib/types/` output follows the template convention and lets Git URL installation work independently of
build output on the publisher's machine. The package has no `prepare` script, so dsh's pnpm-based Git
installation does not require users to approve a TypeScript build script. `prepack` runs the complete
check only when a developer packages the project.

The community manifest v0.15 remains an experimental draft. This README claims compatibility with the
draft, not official certification. The plugin runs in the host process, and manifest permissions are
audit and host-policy declarations rather than an operating-system sandbox. Installing the package means
trusting it with the current user's access to the profile patch and credentials provider.

## Development From Source

```sh
git clone https://github.com/0N3-0/dsh-tui-mcp-manager.git
cd dsh-tui-mcp-manager
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile dsh-tui add .
```

Local `add .` is intended for development and integration testing, not regular user installation.

## Build and Release Checks

```sh
pnpm typecheck
pnpm build
pnpm verify
npm pack --dry-run
pnpm smoke:package
```

`smoke:package` creates a real tarball, installs it in a temporary consumer directory, verifies that the
root and server entries resolve and import, and checks that the bundle patch, manifest entry, and required
runtime files are included.

Build output:

```text
lib/types/index.js         Cordis root entry
lib/types/plugin.js        File manager service and TUI integration
lib/types/server/index.js  Credential-aware per-server adapter
lib/types/tui/index.js     /mcp-manager and full-screen Scene registration
lib/types/tui/scene.js     Native full-screen Scene
```

Repository layout:

```text
dsh-plugin.json         Community v0.15 experimental manifest
cordis.patch.yml        Single Cordis Loader row
src/index.ts            Minimal public Cordis contract
src/plugin.ts           Runtime composition and lifecycle entry
src/host/               Patch store, state projection, and configuration schema
src/host/set-store.ts   Profile-local Set definitions and atomic file writes
src/server/             Credential-aware MCP client adapter
src/tui/                dsh-TUI full-screen Scene, controllers, and shared forms
scripts/verify.mjs      Manifest and Cordis entry contract checks
```
