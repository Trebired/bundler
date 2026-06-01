type DiscoveryWatcher = {
    close(): void;
};
declare function createDiscoveryWatcher(args: {
    dirs: string[];
    onChange: () => void;
}): DiscoveryWatcher;
export { createDiscoveryWatcher };
//# sourceMappingURL=discovery-watch.d.ts.map