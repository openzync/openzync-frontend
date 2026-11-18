import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ExtensionPanelPage from "@/app/(dashboard)/ext/[addonId]/[[...panel]]/page";

// ─── Mocks — API_BASE empty/unparseable → every inbound message rejected ─────────

const mockRefreshOnce = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ addonId: "democrm", panel: ["ui", "board.html"] }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/api-client", () => ({
  API_BASE: "",
  ApiError: class extends Error {},
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
  getAccessToken: () => "tok",
  refreshOnce: (...args: unknown[]) => mockRefreshOnce(...args),
  requestPanelTicket: () => Promise.resolve({ ticket: "TICKET" }),
}));

vi.mock("@/contexts/extensions-context", () => ({
  useExtensions: () => ({
    findAddon: (id: string) =>
      id === "democrm"
        ? {
            id: "democrm",
            version: "1.0.0",
            enabled: true,
            panels: [{ id: "board", title: "Board", path: "/ui/board.html" }],
          }
        : undefined,
    loading: false,
  }),
}));

vi.mock("@/components/shared/error-state", () => ({
  ErrorState: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

beforeEach(() => {
  mockRefreshOnce.mockReset().mockResolvedValue("tok");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExtensionPanelPage default-deny", () => {
  it("rejects addon-unauthorized from any origin when API_BASE is empty", async () => {
    render(<ExtensionPanelPage />);
    await waitFor(() =>
      expect(screen.queryByText("Loading panel…")).not.toBeInTheDocument(),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        // Even the API origin cannot be allow-listed — default deny.
        origin: "http://api.test",
        data: { type: "openzync:addon-unauthorized" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRefreshOnce).not.toHaveBeenCalled();
  });
});
