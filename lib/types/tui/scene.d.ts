import type { TuiSceneDescriptor } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerService } from '../host/manager.js';
import type { CredentialProviderFace } from './credential-provider.js';
import { type SceneLanguage } from './scene-i18n.js';
export type { SceneLanguage } from './scene-i18n.js';
export declare function createMcpManagerScene(manager: McpManagerService, resolveLanguage: () => Promise<SceneLanguage>, credentials?: CredentialProviderFace): TuiSceneDescriptor['component'];
//# sourceMappingURL=scene.d.ts.map