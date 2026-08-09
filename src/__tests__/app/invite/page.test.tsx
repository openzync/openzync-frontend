import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvitePage from "@/app/invite/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

// Default mock with a token — individual tests override via mockSearchParams.
let mockSearchParams = new URLSearchParams("token=invite-tok-123");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/invite",
}));

const { mockGetInviteInfo, mockAcceptInvite, MockApiError } = vi.hoisted(() => ({
  mockGetInviteInfo: vi.fn(),
  mockAcceptInvite: vi.fn(),
  MockApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock("@/lib/api-client", () => ({
  getInviteInfo: mockGetInviteInfo,
  acceptInvite: mockAcceptInvite,
  ApiError: MockApiError,
}));

const VALID_INFO = {
  org_name: "Acme Corp",
  email: "alice@acme.com",
  name: "Alice",
};

beforeEach(() => {
  mockSearchParams = new URLSearchParams("token=invite-tok-123");
  mockGetInviteInfo.mockReset();
  mockAcceptInvite.mockReset();
  mockReplace.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("InvitePage", () => {
  it("shows a loading state while the invite is being resolved", async () => {
    mockGetInviteInfo.mockReturnValue(new Promise(() => {}));
    render(<InvitePage />);

    expect(
      await screen.findByText(/Checking your invitation/),
    ).toBeInTheDocument();
  });

  it("strips the token from the URL on mount", async () => {
    // Simulate arriving with the token in the URL (jsdom starts at "/").
    window.history.replaceState({}, "", "/invite?token=invite-tok-123");
    mockGetInviteInfo.mockResolvedValue(VALID_INFO);
    render(<InvitePage />);

    await screen.findByText(/been invited to join/);
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("invite-tok-123");
    // Mount fetches exactly once — a re-render re-firing the effect fails this.
    expect(mockGetInviteInfo).toHaveBeenCalledTimes(1);
  });

  it("renders the invite even when the URL strip re-renders mid-fetch", async () => {
    // Regression: the effect strips ?token via replaceState, which makes
    // useSearchParams re-render with an empty query. If the effect depended on
    // searchParams, that re-render cancelled the in-flight getInviteInfo and
    // the spinner stayed up forever (old code). The token is read once into
    // state at mount, so the effect must depend on that stable value.
    let resolveInvite: ((info: typeof VALID_INFO) => void) | undefined;
    mockGetInviteInfo.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvite = resolve;
        }),
    );

    const { rerender } = render(<InvitePage />);
    expect(
      await screen.findByText(/Checking your invitation/),
    ).toBeInTheDocument();

    // Simulate Next.js re-rendering useSearchParams with the stripped URL
    // (replaceState has already run inside the effect by now).
    mockSearchParams = new URLSearchParams("");
    rerender(<InvitePage />);

    // Resolve AFTER the re-render — the old code had already cancelled this
    // fetch and hung on the spinner.
    resolveInvite?.(VALID_INFO);

    expect(await screen.findByText(/been invited to join/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("alice@acme.com")).toBeInTheDocument();
    // The stripped-URL re-render must not re-fire the fetch — exactly one call.
    expect(mockGetInviteInfo).toHaveBeenCalledTimes(1);
  });

  it("shows the invalid/expired card when the token is missing", async () => {
    mockSearchParams = new URLSearchParams("");
    render(<InvitePage />);

    expect(
      await screen.findByText("This invitation link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
    // No password form in the error state.
    expect(screen.queryByPlaceholderText("Minimum 8 characters")).not.toBeInTheDocument();
    expect(mockGetInviteInfo).not.toHaveBeenCalled();
  });

  it("shows the invalid/expired card when getInviteInfo rejects", async () => {
    mockGetInviteInfo.mockRejectedValue(new Error("boom"));
    render(<InvitePage />);

    expect(
      await screen.findByText("This invitation link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Minimum 8 characters")).not.toBeInTheDocument();
  });

  it("shows org name plus read-only email and name from the invite info", async () => {
    mockGetInviteInfo.mockResolvedValue(VALID_INFO);
    render(<InvitePage />);

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByDisplayValue("alice@acme.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    // Read-only: admin-set, not editable.
    expect(screen.getByDisplayValue("Alice")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Set password and join" }),
    ).toBeInTheDocument();
  });

  it("accepts the invite with the token and password, then navigates to /overview", async () => {
    const user = userEvent.setup();
    mockGetInviteInfo.mockResolvedValue(VALID_INFO);
    mockAcceptInvite.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
    });
    render(<InvitePage />);

    await user.type(
      await screen.findByPlaceholderText("Minimum 8 characters"),
      "Str0ng!Pass",
    );
    await user.type(
      screen.getByPlaceholderText("Repeat your password"),
      "Str0ng!Pass",
    );
    await user.click(screen.getByRole("button", { name: "Set password and join" }));

    expect(mockAcceptInvite).toHaveBeenCalledWith("invite-tok-123", "Str0ng!Pass");
    expect(mockReplace).toHaveBeenCalledWith("/overview");
  });

  it("shows a mismatch error and does not call acceptInvite", async () => {
    const user = userEvent.setup();
    mockGetInviteInfo.mockResolvedValue(VALID_INFO);
    render(<InvitePage />);

    await user.type(
      await screen.findByPlaceholderText("Minimum 8 characters"),
      "Str0ng!Pass",
    );
    await user.type(
      screen.getByPlaceholderText("Repeat your password"),
      "Different1",
    );
    await user.click(screen.getByRole("button", { name: "Set password and join" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(mockAcceptInvite).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("surfaces the server detail when acceptInvite fails", async () => {
    const user = userEvent.setup();
    mockGetInviteInfo.mockResolvedValue(VALID_INFO);
    mockAcceptInvite.mockRejectedValue(
      new MockApiError("This invitation link is invalid or has expired.", 404, null),
    );
    render(<InvitePage />);

    await user.type(
      await screen.findByPlaceholderText("Minimum 8 characters"),
      "Str0ng!Pass",
    );
    await user.type(
      screen.getByPlaceholderText("Repeat your password"),
      "Str0ng!Pass",
    );
    await user.click(screen.getByRole("button", { name: "Set password and join" }));

    expect(
      await screen.findByText("This invitation link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
