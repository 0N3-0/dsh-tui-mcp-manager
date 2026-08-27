export const SCENE_POLL_MS = 10_000;
export const TABS = ['overview', 'tools', 'doctor', 'config'];
export const WORKSPACES = ['sets', 'servers'];
export function clamp(index, length) {
    return Math.min(Math.max(0, index), Math.max(0, length - 1));
}
export function nextSetId(snapshot) {
    const existing = new Set(snapshot.sets.map((set) => set.id));
    for (let index = 1;; index += 1) {
        const candidate = `set-${index}`;
        if (!existing.has(candidate))
            return candidate;
    }
}
export function removeLastCodePoint(value) {
    const points = Array.from(value);
    points.pop();
    return points.join('');
}
export function navWindow(items, selected, limit) {
    if (items.length <= limit)
        return items;
    const start = Math.min(Math.max(0, selected - Math.floor(limit / 2)), items.length - limit);
    return items.slice(start, start + limit);
}
export function indexedWindow(items, selected, limit) {
    const capacity = Math.max(1, Math.trunc(limit));
    if (items.length <= capacity)
        return { start: 0, items };
    const index = clamp(selected, items.length);
    const start = Math.min(Math.max(0, index - Math.floor(capacity / 2)), items.length - capacity);
    return { start, items: items.slice(start, start + capacity) };
}
//# sourceMappingURL=scene-model.js.map