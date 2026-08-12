import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignupPage from "@/app/signup/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/signup",
}));

// The registration-status GET is module-mocked; the raw signup/join POSTs go
// through real api-client code against the mocked global fetch. Both the
// exported helper and the raw `get` are overridden — the page calls
// getRegistrationStatus() which must not fall through to the real fetch.
const { mockGetRegistrationStatus } = vi.hoisted(() => ({
  mockGetRegistrationStatus: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    get: mockGetRegistrationStatus,
    getRegistrationStatus: mockGetRegistrationStatus,
  };
});

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  // Default: registration open — the existing password flow applies.
  mockGetRegistrationStatus.mockReset();
  mockGetRegistrationStatus.mockResolvedValue({
    org_creation_policy: "allow_all",
    approval_scope: "both",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function submitCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("My Organization"), "My Org");
  await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
  await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
  await user.click(screen.getByRole("button", { name: "Create Account" }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SignupPage", () => {
  it("renders the signup form with all required fields", () => {
    render(<SignupPage />);

    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(
      screen.getByText(/Set up your OpenZync organization/i),
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("My Organization"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("you@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeInTheDocument();
  });

  it("renders sign in link for existing users", () => {
    render(<SignupPage />);
    expect(
      screen.getByRole("link", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("has org name input with correct attributes", () => {
    render(<SignupPage />);
    const input = screen.getByPlaceholderText("My Organization");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("required");
    expect(input).toHaveAttribute("placeholder", "My Organization");
  });

  it("has email input with correct attributes", () => {
    render(<SignupPage />);
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("required");
    expect(input).toHaveAttribute("placeholder", "you@example.com");
  });

  it("has password input with minLength 8", () => {
    render(<SignupPage />);
    const input = screen.getByPlaceholderText("Minimum 8 characters");
    expect(input).toHaveAttribute("minLength", "8");
    expect(input).toHaveAttribute("placeholder", "Minimum 8 characters");
  });

  it("shows password strength bar when password is entered", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    // No strength bar initially
    expect(screen.queryByText("Password strength")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "weak");

    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(screen.getByText("Weak")).toBeInTheDocument();
  });

  it("shows strong password label for strong passwords", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(
      screen.getByPlaceholderText("Minimum 8 characters"),
      "Str0ng!Passphrase",
    );

    expect(screen.getByText("Very Strong")).toBeInTheDocument();
  });

  it("redirects to verify email on successful signup", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ email: "new@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);
    await submitCreateForm(user);

    expect(mockReplace).toHaveBeenCalledWith(
      "/verify-email?email=new%40example.com",
    );
  });

  it("shows error message on failed signup", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Email already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<SignupPage />);
    await submitCreateForm(user);

    expect(
      await screen.findByText("Email already exists"),
    ).toBeInTheDocument();
  });

  it("shows connection error on network failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce({});

    render(<SignupPage />);
    await submitCreateForm(user);

    expect(
      await screen.findByText("Connection error. Please try again."),
    ).toBeInTheDocument();
  });

  it("disables button while submitting", async () => {
    const user = userEvent.setup();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<SignupPage />);
    await user.type(screen.getByPlaceholderText("My Organization"), "Org");
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    const btn = screen.getByRole("button", { name: "Create Account" });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });

  // ── Join mode (org-code) ─────────────────────────────────────────────────

  it("renders both mode toggle options", () => {
    render(<SignupPage />);

    expect(
      screen.getByRole("button", { name: "Create organization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join with code" }),
    ).toBeInTheDocument();
  });

  it("switches to join mode and shows the org code field", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.click(screen.getByRole("button", { name: "Join with code" }));

    expect(screen.getByText("Join an organization")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("XXXX-XXXX-XXXX"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join Organization" }),
    ).toBeInTheDocument();
    // Create-mode fields are hidden in join mode.
    expect(screen.queryByPlaceholderText("My Organization")).not.toBeInTheDocument();
  });

  it("join mode submits POST /v1/auth/join with email, password, org_code", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Verification code sent to email",
          email: "alice@acme.com",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);
    await user.click(screen.getByRole("button", { name: "Join with code" }));
    await user.type(screen.getByPlaceholderText("XXXX-XXXX-XXXX"), "GCE3GG9Z");
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@acme.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Join Organization" }));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/join"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@acme.com",
          password: "Str0ng!Pass",
          org_code: "GCE3GG9Z",
        }),
      }),
    );
  });

  it("join mode redirects to verify-email on success", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Verification code sent to email",
          email: "alice@acme.com",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);
    await user.click(screen.getByRole("button", { name: "Join with code" }));
    await user.type(screen.getByPlaceholderText("XXXX-XXXX-XXXX"), "GCE3GG9Z");
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@acme.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Join Organization" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/verify-email?email=alice%40acme.com",
    );
  });

  it("join mode shows the error banner on 422 invalid organization code", async () => {
    const user = userEvent.setup();
    // RFC 7807 problem+json — the join() helper surfaces detail as message.
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "https://errors.openzync.tech/validation_error",
          title: "Validation Error",
          status: 422,
          detail: "Invalid organization code",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);
    await user.click(screen.getByRole("button", { name: "Join with code" }));
    await user.type(screen.getByPlaceholderText("XXXX-XXXX-XXXX"), "BADCODE9");
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@acme.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Join Organization" }));

    expect(
      await screen.findByText("Invalid organization code"),
    ).toBeInTheDocument();
    // No redirect on failure.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── Registration gating ─────────────────────────────────────────────────

  it("falls back to the open form when the status endpoint fails", async () => {
    mockGetRegistrationStatus.mockRejectedValue(new Error("network down"));
    render(<SignupPage />);

    // Current (allow_all) behavior — form is intact.
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join with code" }),
    ).toBeInTheDocument();
  });

  it("renders a closed notice instead of the form under reject_all", async () => {
    mockGetRegistrationStatus.mockResolvedValue({
      org_creation_policy: "reject_all",
      approval_scope: "in_app",
    });
    render(<SignupPage />);

    expect(
      await screen.findByText("Registration is currently closed"),
    ).toBeInTheDocument();

    // No form fields, no submit button, and no join mode either.
    expect(screen.queryByPlaceholderText("My Organization")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create Account" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join with code" }),
    ).not.toBeInTheDocument();
    // The sign-in escape hatch stays.
    expect(
      screen.getByRole("link", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("hides the join tab under reject_all (join is 403 too)", async () => {
    mockGetRegistrationStatus.mockResolvedValue({
      org_creation_policy: "reject_all",
      approval_scope: "both",
    });
    render(<SignupPage />);

    await screen.findByText("Registration is currently closed");
    expect(
      screen.queryByRole("button", { name: "Join with code" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("XXXX-XXXX-XXXX"),
    ).not.toBeInTheDocument();
  });

  it("renders the approvals form without a password and submits pending", async () => {
    const user = userEvent.setup();
    mockGetRegistrationStatus.mockResolvedValue({
      org_creation_policy: "approvals",
      approval_scope: "public_signup",
    });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "pending",
          message: "We’ll review your request and email you once approved.",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);

    // Request form: org name + email, NO password, no join tab.
    expect(await screen.findByText("Request access to OpenZync")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("My Organization"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("you@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Minimum 8 characters"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join with code" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("My Organization"), "My Org");
    await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "Submit Request" }));

    // POSTed WITHOUT a password, then the confirmation state replaces the form.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/signup"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "new@example.com",
          organization_name: "My Org",
        }),
      }),
    );
    expect(
      await screen.findByText("Request submitted for approval"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We’ll review your request and email you once approved\./),
    ).toBeInTheDocument();
    // NOT the verify-email redirect.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps the password flow when approvals has no public signup scope", async () => {
    mockGetRegistrationStatus.mockResolvedValue({
      org_creation_policy: "approvals",
      approval_scope: "in_app",
    });
    render(<SignupPage />);

    // In-app-only approvals — public signup stays the normal password flow.
    expect(await screen.findByText("Create your account")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeInTheDocument();
  });

  it("keeps the current flow under allow_all", async () => {
    mockGetRegistrationStatus.mockResolvedValue({
      org_creation_policy: "allow_all",
      approval_scope: "both",
    });
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ email: "new@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SignupPage />);
    await submitCreateForm(user);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/verify-email?email=new%40example.com",
      );
    });
  });
});
