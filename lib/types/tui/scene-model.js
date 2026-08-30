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
export function matchesSearch(query, ...values) {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0)
        return true;
    const haystack = values.filter((value) => value !== undefined).join('\n').toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
}
export function matchesNavItem(query, item) {
    return item.kind === 'server'
        ? matchesSearch(query, item.server.name, item.server.id, item.server.serverName)
        : matchesSearch(query, item.set.name, item.set.id);
}
export function textCursorEnd(value) {
    return Array.from(value).length;
}
export function clampTextCursor(value, cursor) {
    return Math.min(Math.max(0, Math.trunc(cursor)), textCursorEnd(value));
}
export function insertAtTextCursor(value, cursor, inserted, limit) {
    const points = Array.from(value);
    const position = clampTextCursor(value, cursor);
    const insertedPoints = Array.from(inserted).slice(0, Math.max(0, limit - points.length));
    return {
        value: [...points.slice(0, position), ...insertedPoints, ...points.slice(position)].join(''),
        cursor: position + insertedPoints.length,
    };
}
export function removeBeforeTextCursor(value, cursor) {
    const points = Array.from(value);
    const position = clampTextCursor(value, cursor);
    if (position === 0)
        return { value, cursor: 0 };
    points.splice(position - 1, 1);
    return { value: points.join(''), cursor: position - 1 };
}
export function removeAtTextCursor(value, cursor) {
    const points = Array.from(value);
    const position = clampTextCursor(value, cursor);
    if (position === points.length)
        return { value, cursor: position };
    points.splice(position, 1);
    return { value: points.join(''), cursor: position };
}
function codePointCellWidth(value) {
    const codePoint = value.codePointAt(0) ?? 0;
    if ((codePoint >= 0x0300 && codePoint <= 0x036f)
        || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
        || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
        || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
        || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
        || (codePoint >= 0xfe20 && codePoint <= 0xfe2f))
        return 0;
    if (codePoint >= 0x1100 && (codePoint <= 0x115f
        || codePoint === 0x2329
        || codePoint === 0x232a
        || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
        || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
        || (codePoint >= 0xf900 && codePoint <= 0xfaff)
        || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
        || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
        || (codePoint >= 0xff00 && codePoint <= 0xff60)
        || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
        || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
        || (codePoint >= 0x20000 && codePoint <= 0x3fffd)))
        return 2;
    return 1;
}
export function terminalTextWidth(value) {
    return Array.from(value).reduce((width, point) => width + codePointCellWidth(point), 0);
}
export function truncateTerminalText(value, maxWidth) {
    const capacity = Math.max(1, Math.trunc(maxWidth));
    if (terminalTextWidth(value) <= capacity)
        return value;
    if (capacity === 1)
        return '…';
    const points = [];
    let width = 0;
    for (const point of Array.from(value)) {
        const pointWidth = codePointCellWidth(point);
        if (width + pointWidth > capacity - 1)
            break;
        points.push(point);
        width += pointWidth;
    }
    return `${points.join('')}…`;
}
export function textCursorSegments(value, cursor, maxWidth = 40, masked = false) {
    const source = Array.from(value);
    const points = masked ? source.map(() => '•') : source;
    const position = clampTextCursor(value, cursor);
    const capacity = Math.max(3, Math.trunc(maxWidth));
    const atEnd = position === points.length;
    const cursorPoint = atEnd ? ' ' : points[position];
    const fullWidth = terminalTextWidth(points.join('')) + (atEnd ? 1 : 0);
    if (fullWidth <= capacity) {
        return {
            before: points.slice(0, position).join(''),
            cursor: cursorPoint,
            after: points.slice(position + (atEnd ? 0 : 1)).join(''),
        };
    }
    let start = position;
    let end = position + (atEnd ? 0 : 1);
    let preferLeft = true;
    const windowWidth = (candidateStart, candidateEnd) => (terminalTextWidth(points.slice(candidateStart, candidateEnd).join(''))
        + (atEnd ? 1 : 0)
        + (candidateStart > 0 ? 1 : 0)
        + (candidateEnd < points.length ? 1 : 0));
    while (start > 0 || end < points.length) {
        let expanded = false;
        const expandLeft = () => {
            if (start > 0 && windowWidth(start - 1, end) <= capacity) {
                start -= 1;
                return true;
            }
            return false;
        };
        const expandRight = () => {
            if (end < points.length && windowWidth(start, end + 1) <= capacity) {
                end += 1;
                return true;
            }
            return false;
        };
        if (preferLeft)
            expanded = expandLeft() || expandRight();
        else
            expanded = expandRight() || expandLeft();
        if (!expanded)
            break;
        preferLeft = !preferLeft;
    }
    return {
        before: `${start > 0 ? '…' : ''}${points.slice(start, position).join('')}`,
        cursor: cursorPoint,
        after: `${points.slice(position + (atEnd ? 0 : 1), end).join('')}${end < points.length ? '…' : ''}`,
    };
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