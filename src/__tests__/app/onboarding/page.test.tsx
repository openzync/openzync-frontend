import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import { toast } from "sonner";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();
// Stable router identity — the wizard's load effect depends on [router], so a
// fresh object per useRouter() call would re-run it on every render and wipe
// typed form values. Real next/navigation returns a stable reference.
const mockRouter = { push: vi.fn(), replace: mockReplace, prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/onboarding",
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The page calls the api-client helpers against API_BASE
// (http://localhost:8000 by default) — match on URL suffix + method.
const mockFetch = vi.fn();
mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/admin/org/config/defaults")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ llm_backend: "openai", llm_model: "gpt-4o-mini" }),
    });
  }
  if (url.endsWith("/admin/org/config")) {
    if (init?.method === "PUT") {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    // GET — no stored config yet, so the page stays on onboarding
    return Promise.resolve({
      ok: true,
      json: async () => ({ stored: { llm_backend: null } }),
    });
  }
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
});
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockReplace.mockReset();
  mockFetch.mockClear();
  mockSearchParams.delete("step");
  localStorage.setItem("mg_access_token", "test-token");
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

/** The wizard gates step 1 → 2 on having at least one LLM API key. */
async function fillOpenAiKey(user: ReturnType<typeof userEvent.setup>) {
  // Anchored regex — exact match would fail on the nested "Required" badge,
  // and unanchored would also hit "Azure OpenAI API Key".
  await user.type(await screen.findByLabelText(/^OpenAI API Key/), "sk-test-key");
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("OnboardingPage", () => {
  it("renders the stepper and step 1 (LLM config)", async () => {
    render(<OnboardingPage />);

    expect(await screen.findByText("Complete Your Setup")).toBeInTheDocument();
    expect(screen.getByText("LLM Provider")).toBeInTheDocument();
    expect(screen.getByText("Embeddings & Graph")).toBeInTheDocument();
    expect(screen.getByText("Review & Save")).toBeInTheDocument();
    expect(screen.getByText("LLM Configuration")).toBeInTheDocument();
    expect(screen.queryByText("Knowledge Graph")).not.toBeInTheDocument();
  });

  it("disables Next until at least one API key is entered", async () => {
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    const nextBtn = screen.getByRole("button", { name: "Next" });
    expect(nextBtn).toBeDisabled();

    await fillOpenAiKey(userEvent.setup());
    expect(nextBtn).toBeEnabled();
  });

  it("advances to step 2 on Next after a key is entered", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await fillOpenAiKey(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.queryByText("LLM Configuration")).not.toBeInTheDocument();
  });

  it("writes the current step to the URL on navigation", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await fillOpenAiKey(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(mockReplace).toHaveBeenCalledWith("/onboarding?step=1", { scroll: false });
  });

  it("clamps an out-of-range ?step= param to the last step", async () => {
    mockSearchParams.set("step", "9");
    render(<OnboardingPage />);

    // The Save button only exists on the final step (the stepper header
    // renders every step title on all steps, so it can't discriminate).
    expect(
      await screen.findByRole("button", { name: /save & continue/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("LLM Configuration")).not.toBeInTheDocument();
  });

  it("falls back to step 1 for a non-numeric ?step= param", async () => {
    mockSearchParams.set("step", "abc");
    render(<OnboardingPage />);

    expect(await screen.findByText("LLM Configuration")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save & continue/i }),
    ).not.toBeInTheDocument();
  });

  it("returns to step 1 on Back", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await fillOpenAiKey(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Knowledge Graph");

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByText("LLM Configuration")).toBeInTheDocument();
  });

  it("navigates to /overview when Skip for now is clicked", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    expect(mockReplace).toHaveBeenCalledWith("/overview");
  });

  it("saves via PUT on the final step, toasts success, and redirects immediately", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await fillOpenAiKey(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Knowledge Graph");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Save & Continue");

    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/org/config"),
        expect.objectContaining({ method: "PUT" }),
      );
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Configuration saved successfully",
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
  });

  it("reports save failures via toast only (no inline banner)", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/admin/org/config/defaults")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ llm_backend: "openai" }),
        });
      }
      if (url.endsWith("/admin/org/config")) {
        if (init?.method === "PUT") {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({ detail: "Missing permission" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ stored: { llm_backend: null } }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    render(<OnboardingPage />);
    await fillOpenAiKey(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Knowledge Graph");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Save & Continue");

    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    // Toast is the single failure channel — no inline banner is rendered.
    expect(toast.error).toHaveBeenCalledWith("Missing permission");
    expect(screen.queryByText(/border-error/)).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalledWith("/overview");
  });
});
