import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver, which cmdk (SimpleSelect dropdown) requires
// to size its list. Stub it — production browsers all provide it natively.
const globals = globalThis as unknown as {
  ResizeObserver?: typeof ResizeObserver;
};
if (!globals.ResizeObserver) {
  globals.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
