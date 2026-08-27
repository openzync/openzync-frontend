import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConfigDirtyProvider,
  useConfigDirty,
} from "@/contexts/config-dirty";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: vi.fn(() => "/settings/org-config/llm"),
}));

// ─── Test helper components ───────────────────────────────────────────────────────

function TestConsumer() {
  const { isDirty, setDirty, navigate } = useConfigDirty();
  return (
    <div>
      <p data-testid="dirty">{isDirty ? "true" : "false"}</p>
      <button onClick={() => setDirty(true)}>Set Dirty</button>
      <button onClick={() => setDirty(false)}>Set Clean</button>
      <button onClick={() => navigate("/overview")}>Navigate</button>
    </div>
  );
}

function renderGuarded() {
  return render(
    <ConfigDirtyProvider>
      <TestConsumer />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ConfigDirtyProvider", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockPush.mockReset();
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  it("renders children and provides initial isDirty as false", () => {
    renderGuarded();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("setDirty toggles isDirty", async () => {
    const user = userEvent.setup();
    renderGuarded();
    await user.click(screen.getByText("Set Dirty"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    await user.click(screen.getByText("Set Clean"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("registers a single beforeunload listener only while dirty", async () => {
    const user = userEvent.setup();
    renderGuarded();

    // Delta-based: other libs may hold ambient listeners, so assert on what
    // THIS provider adds/removes around each dirty transition.
    const isBeforeUnload = (c: unknown[]) => c[0] === "beforeunload";
    const beforeDirty = addSpy.mock.calls.filter(isBeforeUnload).length;

    await user.click(screen.getByText("Set Dirty"));
    const whileDirty = addSpy.mock.calls.filter(isBeforeUnload).length;
    expect(whileDirty - beforeDirty).toBe(1);

    // Flipping dirty again must not stack a second concurrent listener.
    await user.click(screen.getByText("Set Clean"));
    const removedWhileClean = removeSpy.mock.calls.filter(isBeforeUnload).length;
    expect(removedWhileClean).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByText("Set Dirty"));
    const reAdded = addSpy.mock.calls.filter(isBeforeUnload).length;
    expect(reAdded - whileDirty).toBe(1);
  });

  it("navigate() passes straight through when clean", async () => {
    const user = userEvent.setup();
    renderGuarded();

    await user.click(screen.getByText("Navigate"));

    expect(mockPush).toHaveBeenCalledWith("/overview");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("navigate() while dirty opens the confirm dialog without navigating", async () => {
    const user = userEvent.setup();
    renderGuarded();

    await user.click(screen.getByText("Set Dirty"));
    await user.click(screen.getByText("Navigate"));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Leave with unsaved changes?")).toBeInTheDocument();
  });

  it("Stay keeps the dirty flag and does not navigate", async () => {
    const user = userEvent.setup();
    renderGuarded();

    await user.click(screen.getByText("Set Dirty"));
    await user.click(screen.getByText("Navigate"));
    await user.click(screen.getByRole("button", { name: "Stay" }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("Leave clears the dirty flag then navigates", async () => {
    const user = userEvent.setup();
    renderGuarded();

    await user.click(screen.getByText("Set Dirty"));
    await user.click(screen.getByText("Navigate"));
    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(mockPush).toHaveBeenCalledWith("/overview");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });
});

describe("useConfigDirty", () => {
  it("throws when used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useConfigDirty must be used within a ConfigDirtyProvider",
    );
    spy.mockRestore();
  });
});
