import fs from "node:fs";
import path from "node:path";

type DiscoveryWatcher = {
  close(): void;
};

function createDiscoveryWatcher(args: {
  dirs: string[];
  onChange: () => void;
}): DiscoveryWatcher {
  const watchers = new Map<string, fs.FSWatcher>();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const interval = setInterval(() => {
    for (const dir of args.dirs) {
      refresh(dir);
    }
    emitChange();
  }, 250);

  const emitChange = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      args.onChange();
    }, 80);
  };

  const ensureWatch = (dir: string): void => {
    if (closed || watchers.has(dir) || !fs.existsSync(dir)) return;
    if (!fs.statSync(dir).isDirectory()) return;

    const watcher = fs.watch(dir, () => {
      refresh(dir);
      emitChange();
    });

    watcher.on("error", () => {
      watchers.delete(dir);
    });

    watchers.set(dir, watcher);
  };

  const refresh = (startDir: string): void => {
    if (closed || !fs.existsSync(startDir)) return;

    const stack = [startDir];
    while (stack.length) {
      const current = stack.pop()!;
      ensureWatch(current);

      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(current, entry.name);
        if (!watchers.has(child)) {
          stack.push(child);
        }
      }
    }
  };

  for (const dir of args.dirs) {
    refresh(dir);
  }

  return {
    close() {
      closed = true;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

export { createDiscoveryWatcher };
