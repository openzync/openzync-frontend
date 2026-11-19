import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ExtensionPanelPage from "@/app/(dashboard)/ext/[addonId]/[[...panel]]/page";

// ─── Mocks ───────────────────────────────────────────────────────────────────────

const mockRequestPanelTicket = vi.fn();
const mockRefreshOnce = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ addonId: "democrm", panel: ["ui", "board.html"] }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/api-client", () => {
  class FakeApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
    get isUnauthorized(): boolean {
      return this.status === 401;
    }
    get isForbidden(): boolean {
      return this.status === 403;
    }
  }
  return {
    API_BASE: "http://api.test",
    ApiError: FakeApiError,
    apiErrorMessage: (_err: unknown, fallback: string) => fallback,
    getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
    refreshOnce: (...args: unknown[]) => mockRefreshOnce(...args),
    requestPanelTicket: (...args: unknown[]) => mockRequestPanelTicket(...args),
  };
});

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
  mockRequestPanelTicket.mockReset().mockResolvedValue({ ticket: "TICKET" });
  mockRefreshOnce.mockReset().mockResolvedValue("tok");
  mockGetAccessToken.mockReset().mockReturnValue("tok");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Iframe ticket URL + title fallback ──────────────────────────────────────────

describe("ExtensionPanelPage", () => {
  it("mounts the iframe with ?ticket= and falls back to the add-on id for the title", async () => {
    render(<ExtensionPanelPage />);
    const iframe = (await screen.findByTitle("democrm")) as HTMLIFrameElement;
    await waitFor(() =>
      expect(iframe.getAttribute("src")).toBe(
        "http://api.test/v1/ext/democrm/ui/board.html?ticket=TICKET",
      ),
    );
    // Panel title fallback: heading shows the add-on id.
    expect(screen.getByRole("heading", { name: "democrm" })).toBeInTheDocument();
    expect(mockRequestPanelTicket).toHaveBeenCalledWith("democrm", "/ui/board.html");
  });

  it("postMessages the token payload with the viewer origin on load", async () => {
    render(<ExtensionPanelPage />);
    const iframe = (await screen.findByTitle("democrm")) as HTMLIFrameElement;
    const win = iframe.contentWindow;
    expect(win).not.toBeNull();
    const spy = vi.spyOn(win as Window, "postMessage");
    fireEvent.load(iframe);
    expect(spy).toHaveBeenCalledWith(
      {
        type: "openzync:addon-token",
        token: "tok",
        origin: window.location.origin,
      },
      "*",
    );
  });

  it("accepts openzync:addon-unauthorized only from the API origin", async () => {
    render(<ExtensionPanelPage />);
    await screen.findByTitle("democrm");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.test",
        data: { type: "openzync:addon-unauthorized" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRefreshOnce).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://api.test",
        data: { type: "openzync:addon-unauthorized" },
      }),
    );
    await waitFor(() => expect(mockRefreshOnce).toHaveBeenCalled());
  });

  it("ignores wrong-type messages even from the API origin", async () => {
    render(<ExtensionPanelPage />);
    await screen.findByTitle("democrm");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://api.test",
        data: { type: "something-else" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRefreshOnce).not.toHaveBeenCalled();
  });
});
