import fs from "node:fs";
import path from "node:path";

type DiscoveryWatcher = {
  close(): void;
};

function createDiscoveryWatcher(args: {
  dirs: string[];
  onChange: () => void;
}): DiscoveryWatcher {
  const state = createWatcherState(args);
  state.refreshAll();
  return {
    close() {
      closeWatcherState(state);
    },
  };
}

function createWatcherState(args: {
  dirs: string[];
  onChange: () => void;
}) {
  const watchers = new Map<string, fs.FSWatcher>();
  const state = buildWatcherState(args, watchers);
  state.interval = startWatcherRefreshInterval(state);
  return state;
}

function buildWatcherState(
  args: {
    dirs: string[];
    onChange: () => void;
  },
  watchers: Map<string, fs.FSWatcher>,
) {
  const state = {
    args,
    closed: false,
    interval: null as ReturnType<typeof setInterval> | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    watchers,
    emitChange() {
      emitWatcherChange(state);
    },
    ensureWatch(dir: string): boolean {
      return ensureWatcher(state, dir);
    },
    refreshAll(): boolean {
      return refreshWatcherState(state);
    },
  };
  return state;
}

function startWatcherRefreshInterval(state: ReturnType<typeof buildWatcherState>) {
  return setInterval(() => {
    if (state.refreshAll()) state.emitChange();
  }, 250);
}

function emitWatcherChange(state: ReturnType<typeof buildWatcherState>): void {
  if (state.closed) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    state.args.onChange();
  }, 80);
}

function ensureWatcher(state: ReturnType<typeof buildWatcherState>, dir: string): boolean {
  if (state.closed || state.watchers.has(dir) || !fs.existsSync(dir)) return false;
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }

  const watcher = fs.watch(dir, () => {
    state.refreshAll();
    state.emitChange();
  });
  watcher.on("error", () => {
    state.watchers.delete(dir);
  });
  state.watchers.set(dir, watcher);
  return true;
}

function refreshWatcherState(state: ReturnType<typeof buildWatcherState>): boolean {
  let changed = false;
  const found = collectWatchedDirs(state.args.dirs, state.closed);
  for (const dir of found) {
    if (state.ensureWatch(dir)) changed = true;
  }
  for (const [dir, watcher] of state.watchers.entries()) {
    if (found.has(dir)) continue;
    watcher.close();
    state.watchers.delete(dir);
    changed = true;
  }
  return changed;
}

function collectWatchedDirs(dirs: string[], closed: boolean): Set<string> {
  const found = new Set<string>();
  for (const dir of dirs) {
    collectDirTree(dir, found, closed);
  }
  return found;
}

function collectDirTree(startDir: string, found: Set<string>, closed: boolean): void {
  if (closed || !fs.existsSync(startDir)) return;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop()!;
    if (!fs.existsSync(current)) continue;
    found.add(current);
    try {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) stack.push(path.join(current, entry.name));
      }
    } catch {
      continue;
    }
  }
}

function closeWatcherState(state: ReturnType<typeof createWatcherState>): void {
  state.closed = true;
  if (state.interval) clearInterval(state.interval);
  if (state.timer) clearTimeout(state.timer);
  for (const watcher of state.watchers.values()) watcher.close();
  state.watchers.clear();
}

export {
  createDiscoveryWatcher,
};
