import type { McpDoctorCheck, McpServerView } from '../host/types.js';
export type UiLanguage = 'zh' | 'en';
export type DoctorCheckStringKey = 'doctorStorage' | 'doctorLoader' | 'doctorTarget' | 'doctorCwd' | 'doctorCredentials' | 'doctorRuntime' | 'doctorTools';
export type DoctorSuggestionStringKey = 'suggestFixPermissions' | 'suggestReloadProfile' | 'suggestEditCommand' | 'suggestEditUrl' | 'suggestEditCwd' | 'suggestSetCredentials' | 'suggestCheckAuth' | 'suggestCheckNetwork' | 'suggestReconnectRuntime' | 'suggestWaitRuntime';
export declare function doctorCheckStringKey(id: McpDoctorCheck['id']): DoctorCheckStringKey;
export declare function doctorSuggestionStringKey(suggestion: NonNullable<McpDoctorCheck['suggestion']>): DoctorSuggestionStringKey;
export declare function runtimeStateText(lang: UiLanguage, state: McpServerView['state']): string;
//# sourceMappingURL=presentation.d.ts.map