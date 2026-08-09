import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignupPage from "@/app/signup/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/signup",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

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
    await user.type(screen.getByPlaceholderText("My Organization"), "My Org");
    await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

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
    await user.type(screen.getByPlaceholderText("My Organization"), "My Org");
    await user.type(screen.getByPlaceholderText("you@example.com"), "existing@example.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(
      await screen.findByText("Email already exists"),
    ).toBeInTheDocument();
  });

  it("shows connection error on network failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce({});

    render(<SignupPage />);
    await user.type(screen.getByPlaceholderText("My Organization"), "Org");
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

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
});
