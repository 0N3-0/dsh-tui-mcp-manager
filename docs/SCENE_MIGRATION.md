# Full-screen Scene migration

This document is the working record for migrating the managed-dialog MCP manager
to a native dsh-TUI full-screen Scene. It describes the intended architecture,
tracks feature parity, and records decisions that should survive implementation
iterations.

Last updated: 2026-08-28

## Outcome

The end state is a full-screen MCP control center on hosts that provide
`tuiScenes`, while dsh-TUI 0.9.2 continues to receive the existing managed-dialog
interface. Both renderers operate on the same file-backed manager service and the
same form validation rules.

The Scene must not become a second implementation of MCP persistence. It is a
renderer and interaction layer over `McpManagerService`; `cordis.patch.yml` and
`mcp-manager.sets.yml` remain the sources of truth.

## Current implementation map

| Area | Source | Responsibility |
| --- | --- | --- |
| Host state | `src/host/manager.ts` | File/runtime projection, mutations, Doctor, change notifications |
| Compatibility entry | `src/tui/index.ts` | Command registration, Scene capability probe, 0.9.2 dialog fallback |
| Full-screen renderer | `src/tui/scene.ts` | Host-React layout and pane rendering only |
| Scene controller | `src/tui/scene-controller.ts` | Lifecycle, selection, focus, input routing, mutations, and editor orchestration |
| Scene model | `src/tui/scene-model.ts` | Navigation/editor types and pure selection helpers |
| Scene copy | `src/tui/scene-i18n.ts` | Chinese/English Scene strings and Doctor presentation |
| Server detail view | `src/tui/scene-server-detail.ts` | Overview, tools, Doctor, configuration, and server-state presentation |
| Set views | `src/tui/scene-set-detail.ts` | Set detail and Set-editor row presentation |
| Server editor view | `src/tui/scene-server-editor.ts` | Host-React server form rows and credential status presentation |
| Server editor controller | `src/tui/scene-server-editor-controller.ts` | Form state, input editing, validation, credentials, and save orchestration |
| Set editor controller | `src/tui/scene-set-editor-controller.ts` | Set form state, membership, validation, input, and save orchestration |
| Shared presentation | `src/tui/presentation.ts` | Runtime and Doctor keys shared by both renderers |
| Shared server form | `src/tui/server-form-model.ts` | Drafts, parsing, validation, credential references, and persistence submissions |
| Credential bridge | `src/tui/credential-provider.ts` | Minimal credential-provider contract and secret-value persistence |

The Scene renderer and controller have now been separated, and both renderers
use the same server-field parsers. Server details, Set details, and both editor
views/controllers now have focused modules. Mutation endpoints already converge
at `McpManagerService`, so the remaining release work is Phase 4 data stress
evidence capture and documentation. The compatibility dialog remains large, but new
validation and secret handling must be added to shared modules rather than
duplicated there.

## Design principles

1. Use only the host React instance and components supplied through
   `TuiSceneProps`; Scene code must not create or import private `ink-*`
   elements. A side-by-side pane must not use `ui.ScrollBox`, because its
   terminal row-scroll optimization is not column-scoped. The detail pane uses
   an application-controlled offset inside a clipped host `Box` instead.
2. Keep navigation focus explicit. The left collection/server navigator and the
   right detail pane must never compete for the same key without a visible focus
   state. Only the pane that owns keyboard focus renders a cursor; the other pane
   may retain a bold contextual selection without looking active.
3. Prefer manager change notifications over aggressive polling. A low-frequency
   poll remains as a fallback for edits made outside this process.
4. Preserve capability probing. Absence of `tuiScenes` falls back to the managed
   dialog and must not remove `/mcp-manager`.
5. Share normalization, validation, Doctor presentation, and mutation actions
   between the dialog and Scene before migrating all forms.
6. A feature is complete only after keyboard, mouse, narrow-terminal, Chinese,
   and destructive-action behavior have been checked.

## Interaction model

- `Tab` moves focus between navigation and detail.
- `w` switches the navigation workspace between Sets and the server pool.
- In navigation, `Up/Down` changes the selected Set/server.
- In detail, `PageUp/PageDown` scrolls. `Up/Down` selects tools while the Tools
  pane owns focus; on Sets and the server Overview tab, the same keys select the
  visible action rows and `Enter` runs the selected action.
- Detail scrolling and workspace creation are focus-scoped: they do not mutate
  an inactive pane while navigation or detail owns the keyboard respectively.
- `Left/Right` switches server detail tabs while detail owns focus.
- `Enter` activates the selected row, enters detail, opens a tool, or finishes
  editing the current field.
- Set/server mutations are selected with `Up/Down` and executed with `Enter`;
  they do not retain parallel letter or Space shortcuts.
- Opening the Doctor tab runs diagnostics automatically; selecting the Doctor
  action and pressing `Enter` reruns the current server diagnostic.
- `Esc` returns from tool detail, cancels an editor or confirmation, then returns
  from detail to navigation, and finally closes the Scene.
- `Ctrl+C` is left to the host as an emergency interrupt; it is not a second
  Scene close shortcut.

## Compatibility

| Host capability | `/mcp-manager` behavior |
| --- | --- |
| `tuiScenes` and `tuiDialogs` | Open the full-screen Scene |
| `tuiDialogs` only | Open the existing managed dialog |
| Neither capability | Do not register an unusable command; log only in debug mode |

The package may continue to declare dsh-TUI `>=0.9.2 <0.10.0` only while the
dialog fallback remains reachable. If the fallback is removed in a future major
version, the minimum host version must be raised to the first release exporting
`tuiScenes`.

## Feature parity matrix

| Capability | Managed dialog | Full-screen Scene | Migration status |
| --- | ---: | ---: | --- |
| Live server/Set overview | yes | yes | implemented |
| Server pool and Set selection | yes | yes | implemented |
| Tool list and input schema | yes | yes | implemented with pane-local clipped scrolling |
| Doctor checks and suggestions | yes | yes | runs automatically when the Doctor tab opens |
| Set enable/disable | yes | yes | implemented |
| Server reconnect | yes | yes | implemented |
| Server activation | indirect | yes | derived only from the union of active Sets |
| Add/edit/duplicate server | yes | yes | native dynamic Scene form implemented |
| Credential reference values | yes | yes | values are transient and persisted only through the credential provider |
| Create/edit Set membership | yes | yes | native Scene form implemented |
| Delete server globally | yes | yes | removes the pool record and membership from every Set |
| Delete Set | yes | yes | implemented |
| Read-only profile errors | yes | yes | mutation entry points fail before opening an editor |
| `/lang zh` and `/lang en` | yes | on next open | implemented; the Scene reads the host language when opened |
| dsh-TUI 0.9.2 fallback | yes | n/a | implemented by soft-probing `tuiScenes` |

Mutation parity is now present, and the supported terminal widths, overlapping
active Sets, a live 120-tool runtime, and open-Scene external edits have been
exercised. Current full-screen screenshots cover the live dsh-TUI 0.9.3 Set,
server, tool, Set-editor, and server-editor views and are linked from both
READMEs.

## Migration phases

### Phase 1 — native shell and lifecycle

- [x] Register a host-React Scene.
- [x] Restore the managed-dialog fallback independently of Scene availability.
- [x] Replace native row scrolling with a pane-local clipped detail viewport.
- [x] Add explicit navigation/detail focus.
- [x] Add manager change subscriptions and reduce fallback polling.
- [x] Verify Scene registration, opening, `Esc` close, and return to chat against
  dsh-TUI 0.9.3.

### Phase 2 — shared presentation and actions

- [x] Extract runtime-state and Doctor localization from the dialog module.
- [x] Keep enable, reconnect, delete, and Set activation in the shared manager
  service; renderers own only confirmation and presentation state.
- [x] Split Scene state/input orchestration, pure model helpers, form rules, and
  i18n out of the renderer.
- [x] Split server-editor rendering and state/input orchestration into focused
  modules.
- [x] Split Set-editor rendering and state/input orchestration into focused
  modules.
- [x] Split the four server detail tabs into a focused view module.
- [x] Split Set detail and Set-editor rendering into a focused view module.

### Phase 3 — full management parity

- [x] Server create/edit/duplicate form.
- [x] Credential-reference value flow without persisting secrets in Scene state
  longer than required.
- [x] Keep activation Set-derived; do not add a conflicting per-server runtime
  switch to the Scene.
- [x] Set create/edit/delete and member management.
- [x] Read-only storage behavior and actionable errors.

### Phase 4 — release switch

- [x] Exercise 60/80/120-column layouts and short terminals.
- [x] Exercise large tool schemas at 80 and 120 columns.
- [x] Exercise the union of overlapping active Sets.
- [x] Verify external patch and Set-file edits at the manager refresh boundary.
- [x] Exercise at least 100 tools against a live runtime fixture.
- [x] Exercise external profile edits in a live open Scene.
- [x] Update the Chinese and English READMEs for Scene/fallback behavior.
- [x] Update release manifest wording for the Scene/fallback capability split.
- [x] Add current full-screen screenshots.
- [x] Document the full-screen Scene as the default on hosts that provide it.

## Decision log

### 2026-08-27 — Scene is the target, dialog remains a compatibility renderer

The full-screen layout materially improves information density and navigation,
so it is the long-term interface. The managed dialog remains useful for dsh-TUI
0.9.2 and as a proven implementation while forms are migrated.

### 2026-08-27 — side-by-side panes cannot use native row scrolling

`ui.ScrollBox` emits terminal DECSTBM row-scroll operations. Those operations
span the whole terminal row, so scrolling the right detail pane also shifts or
erases the left navigation pane. The Scene therefore keeps its offset in React
state and moves content inside an `overflow: hidden` host `Box`. This produces a
normal pane-local redraw instead of a terminal row scroll. A structural host-Box
layout ref is used only to clamp the bottom offset; no private Ink component is
created or imported.

### 2026-08-27 — push notifications with polling fallback

Runtime/tool mutations within the manager should invalidate the Scene directly.
A slower poll remains necessary because users may edit profile files outside the
current process and the manager does not own the host patch watcher.

### 2026-08-27 — Scene registration and command share one activation

`tuiScenes` scopes every descriptor to the Cordis activation that registers it.
The command handler must therefore be created from that same activation; two
independent `ctx.inject()` callbacks can both see the service but `open()` will
reject the cross-activation request. Scene registration is performed inside the
`tuiDialogs` command activation and `tuiScenes` is soft-probed there. This also
keeps the 0.9.2 dialog fallback reachable.

### 2026-08-27 — active Sets are the only activation control

Persisted server `enabled` values are the materialized union of all active Sets,
not an independent preference. Exposing a second per-server enable switch would
be overwritten by the next Set mutation and make the UI lie. The Scene therefore
edits Set activation and membership; server details present the resulting state.

### 2026-08-27 — credentials are form inputs, not server configuration

Secret environment variables and HTTP headers are represented in Loader rows as
credential references. Their values exist only in the active editor draft and
are written through the host credential provider immediately before the server
record is saved. They are never copied into `ManagedServerRecord`, snapshots, or
notices. An empty credential field while editing means “keep the configured
value”; a missing required credential blocks the save with its reference name.

### 2026-08-27 — creation belongs to workspace navigation

Create Set/server entries live only in their corresponding navigation workspace.
Detail panes operate on the selected node: a Set can be enabled, disabled, or
edited there, while a server can be edited, duplicated, or deleted. This avoids
presenting an unrelated create action as if it belonged to the current node.

### 2026-08-27 — server deletion is global

Deleting a server removes its Loader-backed pool record and removes the server ID
from every Set. The confirmation message states this scope explicitly. The Set
cleanup is represented by a tested pure transformation instead of relying on the
incidental unknown-ID filtering performed while reading Sets.

### 2026-08-27 — one keyboard binding per action

The Scene avoids parallel Vim, numeric, and letter aliases for the same action.
Arrow keys navigate, `PageUp/PageDown` scroll, `Enter` activates, and `Esc`
backs out or cancels. Destructive confirmations expose bordered, mouse-clickable
buttons for those same Enter/Esc actions. Form rows use a cursor and bold text
without a full-width fill, preserving field-label contrast while typing.

### 2026-08-28 — manager service remains the mutation boundary

Both renderers already call the same typed `McpManagerService` endpoints for Set
activation, reconnect, global server deletion, and Set deletion. A second UI
`actions` wrapper would only forward those calls while still requiring each UI
to own its own confirmation and notices, so no redundant wrapper is introduced.

## Implementation log

### 2026-08-27 — first native migration slice

- Added a full-screen Scene and retained the old managed dialog as a capability
  fallback.
- Initially replaced private Ink/Yoga scrolling with the public host
  `ScrollBox`; the later pane-local scrolling entry records why the split view
  could not retain it.
- Added navigation/detail focus ownership, keyboard and mouse entry points, and
  native Set create/edit/member management.
- Added coalesced manager change notifications and reduced external-file polling
  to ten seconds.
- Shared runtime and Doctor presentation mappings between both renderers.
- Verified typecheck, build assertions, package installation smoke test, and a
  real dsh-TUI 0.9.3 open/close cycle.

### 2026-08-27 — native server management slice

- Split the Scene renderer, controller, model, localization, shared form model,
  and credential-provider bridge into separate modules.
- Added full-screen create, edit, and duplicate flows for stdio and
  streamable-http servers, including transport-specific fields, runtime policy,
  reconnect policy, and dynamic credential rows.
- Reused the extracted argument/map/secret-reference parsers from the managed
  dialog and added assertions for Context7-style secret headers.
- Added read-only guards before every Scene mutation/editor entry point.
- Exercised the native form in dsh-TUI 0.9.3, including opening from the server
  pool, switching transport, cancelling without persistence, and returning to
  the server detail view.

### 2026-08-27 — detail-action and diagnostic refinement

- Removed Set/server creation from detail panes and kept creation at the bottom
  of the matching navigation workspace.
- Added an explicit enable/disable action to Set details.
- Stacked Set enable/disable, edit, and delete actions on separate rows below
  the Set details.
- Stacked server edit, duplicate, reconnect, Doctor, and global delete actions
  below the Overview details only; global deletion also removes membership from
  every Set.
- Made Doctor run automatically on tab entry and available as a selectable
  detail action for explicit reruns.
- Removed the selection background that hid the tool-detail back label under the
  host theme, and made selected-row cursors use the theme foreground color.
- Separated navigation selection from focus so only the active pane draws a
  cursor, and replaced per-item `scrollTo(index)` with a bounded tool-list window
  so the cursor moves through the viewport instead of staying pinned near its top.
- Removed full-row form fills that obscured colored labels, normalized selected
  list-row foregrounds, added clickable confirmation buttons, and reduced every
  Scene operation to one documented keyboard binding.
- Kept pane focus as border-only contrast: the focused pane uses the suggestion
  border while the other pane fades to the inactive border. Detail titles keep
  their normal appearance and never become a full-width selection row.
- Made Set and server actions first-class keyboard rows. They stay below Set
  details and the server Overview instead of being repeated across tabs, use a
  visible `❯` cursor while detail owns focus, and require `Enter` to execute;
  delete still opens confirmation first.
- Gave every tool-detail selection its own scroll viewport and reset that
  viewport after rendering, so opening or switching tools always starts at the
  tool title instead of inheriting a previous Schema offset.
- Replaced the right-pane `ScrollBox` with application-level clipped scrolling.
  Repeated `PageDown`/`PageUp` now redraws only the right-hand columns and no
  longer damages the navigation pane; switching tools still resets to the top.

### 2026-08-27 — editor module boundaries

- Moved server-field labels, credential status projection, and all host-React
  form-row rendering into `scene-server-editor.ts`.
- Moved form state, row construction, text editing, credential checks,
  validation, and save orchestration into `scene-server-editor-controller.ts`.
- Kept the main Scene controller responsible only for routing input to the
  active editor and integrating its result with workspace selection.
- Moved Set row construction, create/edit drafts, membership changes,
  validation, text input, and save orchestration into
  `scene-set-editor-controller.ts` with the same host-React boundary.
- Passed the host React/UI instances into the renderer explicitly; the extracted
  module does not import or instantiate a second React runtime.

### 2026-08-28 — detail view boundaries

- Moved Overview, tool list/schema, automatic Doctor results, and configuration
  rendering into `scene-server-detail.ts` without changing controller state.
- Centralized server runtime glyph/color projection so navigation, Set members,
  and the detail view present the same state.
- Kept Overview mutation actions in the Scene shell because they depend on the
  shell's shared detail-action cursor; the extracted module remains purely a
  host-React renderer.
- Moved Set detail and Set-editor row rendering into `scene-set-detail.ts`, while
  keeping their mutation/action cursor in the shell for the same reason.
- Added a pure indexed-window helper and assertions at the first, middle, and
  last selection positions of a 120-tool list.
- Rechecked all four server tabs in dsh-TUI 0.9.3; automatic Doctor execution,
  tool opening, and repeated long-Schema scrolling all worked without altering
  the left navigation pane.

### 2026-08-28 — terminal-width and data stress pass

- Exercised the native Scene at 60x24, 80x24, and 120x32. Set details and action
  pagination remain reachable at 60 columns; the two-pane server layout and all
  four detail tabs remain readable at 80 and 120 columns.
- Removed redundant compact-footer hints already represented in the header or
  navigation. This reduced the 60-column footer from four wrapped rows to one,
  preserving the last content rows in short terminals.
- Repeatedly scrolled large tool schemas at 80 and 120 columns and confirmed
  that only the clipped right pane redraws; the left server pool is unchanged.
- Covered first, middle, and last viewport positions with a synthetic 120-tool
  list, and covered overlapping active-Set union behavior in automated checks.
- Added a temporary-profile manager integration check that edits both
  `cordis.patch.yml` and `mcp-manager.sets.yml` through independent store
  instances. The next authoritative refresh observes both edits without
  touching the user's active profile.
- Scoped wheel/PageUp/PageDown input to the focused detail pane and scoped the
  create shortcut to navigation, matching the visible focus owner and footer.
- Replaced the README's dialog-only description with the actual capability
  split: a native full-screen Scene on dsh-TUI 0.9.3 and the managed-dialog
  fallback on 0.9.2. The compatibility tool limit is no longer described as a
  limitation of the full-screen interface.
- Updated the plugin manifest summary and command title to describe the native
  full-screen manager without hiding its managed-dialog compatibility path.

### 2026-08-28 — live 120-tool and external-edit pass

- Started dsh-TUI 0.9.3 against an isolated temporary profile whose runtime
  registered 120 real tool descriptors, including one 40-field input Schema.
- Verified the first, middle (`61/120`), and last (`120/120`) tool positions in
  the open Scene, and repeatedly paged through the long Schema without changing
  or damaging the left navigation pane.
- Found that a burst of terminal key-repeat events could collapse to one move
  because navigation, tabs, and tool selection used indices captured by the
  previous React render. Converted those movement paths to functional state
  updates and repeated the same 60-key burst successfully.
- Edited the temporary profile's managed server name and Set name while the
  Scene remained open. Both changes appeared on the next fallback poll without
  reopening the manager or touching the user's active profile.
- Captured live full-screen Set, server overview, and tool-list screenshots at
  2560x1600 after all managed servers reached their ready state, and linked the
  overview plus the supporting views from both READMEs. Added full-screen Set
  and server editor screenshots to document the two write workflows as well.
