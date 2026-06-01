import fs from "node:fs";
import path from "node:path";
function createDiscoveryWatcher(args) {
    const watchers = new Map();
    let closed = false;
    let timer = null;
    const interval = setInterval(() => {
        if (refreshAll()) {
            emitChange();
        }
    }, 250);
    const emitChange = () => {
        if (closed)
            return;
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            args.onChange();
        }, 80);
    };
    const ensureWatch = (dir) => {
        if (closed || watchers.has(dir) || !fs.existsSync(dir))
            return false;
        let stats;
        try {
            stats = fs.statSync(dir);
        }
        catch {
            return false;
        }
        if (!stats.isDirectory())
            return false;
        const watcher = fs.watch(dir, () => {
            refreshAll();
            emitChange();
        });
        watcher.on("error", () => {
            watchers.delete(dir);
        });
        watchers.set(dir, watcher);
        return true;
    };
    const collectDirs = (startDir, found) => {
        if (closed || !fs.existsSync(startDir))
            return;
        const stack = [startDir];
        while (stack.length) {
            const current = stack.pop();
            if (!fs.existsSync(current))
                continue;
            found.add(current);
            try {
                for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                    if (!entry.isDirectory())
                        continue;
                    const child = path.join(current, entry.name);
                    stack.push(child);
                }
            }
            catch {
                continue;
            }
        }
    };
    const refreshAll = () => {
        let changed = false;
        const found = new Set();
        for (const dir of args.dirs) {
            collectDirs(dir, found);
        }
        for (const dir of found) {
            if (ensureWatch(dir)) {
                changed = true;
            }
        }
        for (const [dir, watcher] of watchers.entries()) {
            if (found.has(dir))
                continue;
            watcher.close();
            watchers.delete(dir);
            changed = true;
        }
        return changed;
    };
    refreshAll();
    return {
        close() {
            closed = true;
            clearInterval(interval);
            if (timer)
                clearTimeout(timer);
            for (const watcher of watchers.values()) {
                watcher.close();
            }
            watchers.clear();
        },
    };
}
export { createDiscoveryWatcher };
//# sourceMappingURL=discovery-watch.js.map