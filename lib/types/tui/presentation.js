export function doctorCheckStringKey(id) {
    const keys = {
        storage: 'doctorStorage',
        loader: 'doctorLoader',
        target: 'doctorTarget',
        cwd: 'doctorCwd',
        credentials: 'doctorCredentials',
        runtime: 'doctorRuntime',
        tools: 'doctorTools',
    };
    return keys[id];
}
export function doctorSuggestionStringKey(suggestion) {
    const keys = {
        'fix-permissions': 'suggestFixPermissions',
        'reload-profile': 'suggestReloadProfile',
        'edit-command': 'suggestEditCommand',
        'edit-url': 'suggestEditUrl',
        'edit-cwd': 'suggestEditCwd',
        'set-credentials': 'suggestSetCredentials',
        'check-auth': 'suggestCheckAuth',
        'check-network': 'suggestCheckNetwork',
        'reconnect-runtime': 'suggestReconnectRuntime',
        'wait-runtime': 'suggestWaitRuntime',
    };
    return keys[suggestion];
}
export function runtimeStateText(lang, state) {
    const labels = {
        connected: { zh: '已连接', en: 'connected' },
        starting: { zh: '正在启动', en: 'starting' },
        reconnecting: { zh: '正在重连', en: 'reconnecting' },
        failed: { zh: '连接失败', en: 'failed' },
        stopped: { zh: '已停止', en: 'stopped' },
        disabled: { zh: '已停用', en: 'disabled' },
    };
    return labels[state][lang];
}
//# sourceMappingURL=presentation.js.map