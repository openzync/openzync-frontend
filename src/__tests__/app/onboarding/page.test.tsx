import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import { toast } from "sonner";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/onboarding",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The page calls raw fetch (not the api-client helpers) against API_BASE
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
  localStorage.setItem("mg_access_token", "test-token");
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

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

  it("advances to step 2 on Next", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.queryByText("LLM Configuration")).not.toBeInTheDocument();
  });

  it("returns to step 1 on Back", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

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

  it("saves via PUT on the final step and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    await screen.findByText("LLM Configuration");

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
  });
});
