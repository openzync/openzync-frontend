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

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function signupResponse(body: unknown, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  // No invite token in the URL by default.
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost/signup"),
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
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
      screen.getByText(/Sign up to start using the platform/i),
    ).toBeInTheDocument();

    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeInTheDocument();
  });

  it("renders sign in link for existing users", () => {
    render(<SignupPage />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("has email input with correct attributes", () => {
    render(<SignupPage />);
    const email = screen.getByPlaceholderText("you@example.com");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("required");
  });

  it("has password input with minLength 8", () => {
    render(<SignupPage />);
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toHaveAttribute("minLength", "8");
  });

  it("redirects to verify email on successful signup", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      signupResponse({ email: "new@example.com", message: "ok" }),
    );
    render(<SignupPage />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/verify-email?email=new%40example.com",
      );
    });
    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      email: "new@example.com",
      password: "Str0ng!Pass",
    });
  });

  it("shows the approval confirmation when the account is pending", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      signupResponse(
        { status: "pending", message: "Your account is pending approval." },
        201,
      ),
    );
    render(<SignupPage />);

    await fillAndSubmit(user);

    expect(
      await screen.findByText("Request submitted for approval"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your account is pending approval."),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows error message on failed signup", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      signupResponse({ detail: "Email already registered" }, 400),
    );
    render(<SignupPage />);

    await fillAndSubmit(user);

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows connection error on network failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error("down"));
    render(<SignupPage />);

    await fillAndSubmit(user);

    expect(await screen.findByText("down")).toBeInTheDocument();
  });

  it("disables button while submitting", async () => {
    const user = userEvent.setup();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<SignupPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Str0ng!Pass");
    const button = screen.getByRole("button", { name: "Create Account" });
    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "" }),
      ).toBeDisabled();
    });
  });

  it("hands an invite token off to the invite page", async () => {
    Object.defineProperty(window, "location", {
      value: new URL("http://localhost/signup?token=tok-123"),
      writable: true,
    });
    render(<SignupPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/invite?token=tok-123");
    });
    // Signup-only form is hidden during the handoff.
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
  });
});
