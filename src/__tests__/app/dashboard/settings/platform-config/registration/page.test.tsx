import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfigLayout from "@/app/(dashboard)/settings/platform-config/layout";
import PlatformConfigRegistrationPage from "@/app/(dashboard)/settings/platform-config/registration/page";
import { ConfigDirtyProvider } from "@/contexts/config-dirty";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// jsdom lacks the PointerEvent APIs Radix Select relies on.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const { mockUseUser, mockGet, mockPatch, mockReplace } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings/platform-config/registration",
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
    get isForbidden(): boolean {
      return this.status === 403;
    }
  }
  return {
    ...actual,
    get: mockGet,
    patch: mockPatch,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof Error ? err.message : fallback,
  };
});

function rootMock() {
  return { isAdmin: true, loading: false, can: () => true };
}

function nonRootMock() {
  return { isAdmin: false, loading: false, can: () => true };
}

function renderLayout() {
  return render(
    <ConfigDirtyProvider>
      <ConfigLayout>
        <div>tab content</div>
      </ConfigLayout>
    </ConfigDirtyProvider>,
  );
}

function renderPage() {
  return render(
    <ConfigDirtyProvider>
      <PlatformConfigRegistrationPage />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("PlatformConfig layout Registration tab gating", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
  });

  it("root sees the Registration tab", () => {
    mockUseUser.mockReturnValue(rootMock());
    renderLayout();

    expect(
      screen.getByRole("button", { name: "Registration" }),
    ).toBeInTheDocument();
  });

  it("non-root does not see the Registration tab", () => {
    mockUseUser.mockReturnValue(nonRootMock());
    renderLayout();

    expect(
      screen.queryByRole("button", { name: "Registration" }),
    ).not.toBeInTheDocument();
    // Other tabs stay visible.
    expect(screen.getByRole("button", { name: "LLM" })).toBeInTheDocument();
  });
});

describe("PlatformConfigRegistrationPage (root-only)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPatch.mockReset();
    mockReplace.mockReset();
  });

  it("root sees the Registration tab content and save PATCH flips registration_mode", async () => {
    const user = userEvent.setup();
    mockUseUser.mockReturnValue(rootMock());
    mockGet.mockResolvedValue({ registration_mode: "invite_only" });
    mockPatch.mockResolvedValue({ registration_mode: "open" });
    renderPage();

    // Seeded from GET /admin/system/registration.
    expect(await screen.findByLabelText("Registration mode")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/admin/system/registration");

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/system/registration", {
        registration_mode: "open",
      });
    });
  });

  it("non-root redirects to /overview without the Registration field", async () => {
    mockUseUser.mockReturnValue(nonRootMock());
    mockGet.mockResolvedValue({ registration_mode: "invite_only" });
    renderPage();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
    expect(screen.queryByLabelText("Registration mode")).not.toBeInTheDocument();
  });
});
