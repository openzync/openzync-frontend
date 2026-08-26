import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/(dashboard)/settings/page";
import { UserProvider } from "@/contexts/user-context";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    title,
    description,
    open,
    footer,
    onOpenChange,
  }: {
    children: React.ReactNode;
    title?: string;
    description?: string;
    open?: boolean;
    footer?: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
        {children}
        {footer}
        {/* Simulates Radix user-initiated close (Escape/overlay/Close) */}
        <button aria-label="close-dialog" onClick={() => onOpenChange?.(false)} />
      </div>
    ) : null,
  DialogCloseButton: ({ disabled }: { disabled?: boolean }) => (
    <button disabled={disabled}>Cancel</button>
  ),
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideSettings: () => <div>Settings Guide</div>,
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  sessionStorage.clear();
  // Set auth token for settings page
  sessionStorage.setItem("mg_access_token", "test-token");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("SettingsPage", () => {
  it("renders the page title and description", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<UserProvider><SettingsPage /></UserProvider>);

    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(
      await screen.findByText(/Manage your profile and organization/),
    ).toBeInTheDocument();
  });

  it("renders profile section with user data", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: "Jane Doe",
          email: "jane@example.com",
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<UserProvider><SettingsPage /></UserProvider>);

    expect(await screen.findByText("Profile")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("jane@example.com")).toBeInTheDocument();
  });

  it("renders change password section", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<UserProvider><SettingsPage /></UserProvider>);

    expect(
      await screen.findByText("Change Password"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Current Password"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("New Password"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /update password/i }),
    ).toBeInTheDocument();
  });

  it("renders MFA section", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<UserProvider><SettingsPage /></UserProvider>);

    expect(
      await screen.findByText("Multi-Factor Authentication"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("switch"),
    ).toBeInTheDocument();
  });

  it("shows loading skeleton while profile loads", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<UserProvider><SettingsPage /></UserProvider>);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("saves profile changes on save button click", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            name: "Old Name",
            email: "old@example.com",
            role: "admin",
            mfa_enabled: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    const nameInput = await screen.findByDisplayValue("Old Name");
    await user.clear(nameInput);
    await user.type(nameInput, "New Name");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("shows password validation warning for short passwords", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    const newPasswordInput = await screen.findAllByPlaceholderText(
      /new password/i,
    );
    // The "New Password" field in the password section
    const pwInput = newPasswordInput[0];
    await user.type(pwInput, "short");

    expect(
      await screen.findByText(/Password must be at least 8 characters/),
    ).toBeInTheDocument();
  });

  it("shows success message after password meets requirements", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    const newPasswordInput = await screen.findAllByPlaceholderText(
      /new password/i,
    );
    const pwInput = newPasswordInput[0];
    await user.type(pwInput, "LongEnough1");

    expect(
      await screen.findByText(/Password meets minimum length/),
    ).toBeInTheDocument();
  });

  it("renders role field as disabled and read-only", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<UserProvider><SettingsPage /></UserProvider>);

    const roleInput = await screen.findByDisplayValue("admin");
    expect(roleInput).toBeDisabled();
    expect(roleInput).toHaveAttribute("readOnly");
  });

  it("opens MFA confirmation dialog when toggling MFA", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    const switchBtn = await screen.findByRole("switch");
    await user.click(switchBtn);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // "Enable MFA" appears as both dialog title and button — at least one
    expect(screen.getAllByText("Enable MFA").length).toBeGreaterThanOrEqual(1);
  });

  it("flips all MFA display state after successful enable without reload", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            name: null,
            email: null,
            role: "admin",
            mfa_enabled: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    // Before enabling: unprotected copy on the MFA card
    expect(
      await screen.findByText("Add an extra layer of security to your account"),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("switch"));
    await screen.findByRole("dialog");
    await user.type(
      screen.getByPlaceholderText("Enter your current password"),
      "pw123456",
    );
    await user.click(screen.getByRole("button", { name: "Enable MFA" }));

    // After success — no reload: shield copy flips immediately
    expect(
      await screen.findByText(
        "Your account is protected with email-based MFA",
      ),
    ).toBeInTheDocument();

    // "Enabled" badge tracks actual state, not dialog intent
    expect(screen.getByText("Enabled")).toBeInTheDocument();

    // Reopening the toggle offers the disable flow: correct button label
    // (was stale "Enable MFA") and the OTP code field required to disable.
    await user.click(screen.getByRole("switch"));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Disable MFA" })).toBeInTheDocument();
    expect(screen.getByText("MFA Code")).toBeInTheDocument();

    // Complete the confirmed disable: password already filled, add the OTP
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "Disable MFA" }));

    // After success — badge gone, shield copy back to unprotected
    expect(screen.queryByText("Enabled")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Add an extra layer of security to your account"),
    ).toBeInTheDocument();
  });

  it("reverts the optimistic switch flip when the MFA dialog is cancelled", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: null,
          email: null,
          role: "admin",
          mfa_enabled: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<UserProvider><SettingsPage /></UserProvider>);

    expect(
      await screen.findByText("Your account is protected with email-based MFA"),
    ).toBeInTheDocument();

    // Toggle off (optimistic) then cancel via user-initiated dialog close
    await user.click(await screen.findByRole("switch"));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "close-dialog" }));

    // Reverts to enabled state without reload
    expect(
      await screen.findByText("Your account is protected with email-based MFA"),
    ).toBeInTheDocument();
  });
});
