import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "@/components/shared/copy-button";

function mockClipboard(impl: () => Promise<void>) {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(impl) },
  });
}

describe("CopyButton", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it("copies the value and swaps the copy icon for a check icon", async () => {
    mockClipboard(async () => {});
    const onSuccess = vi.fn();

    render(<CopyButton value="abc-123" label="Copy thing" onSuccess={onSuccess} />);

    expect(screen.getByLabelText("Copy thing")).toBeInTheDocument();
    expect(document.querySelector(".lucide-copy")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Copy thing"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("abc-123");
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    // Success feedback: check icon replaces the copy icon.
    expect(document.querySelector(".lucide-check")).toBeInTheDocument();
    expect(document.querySelector(".lucide-copy")).not.toBeInTheDocument();
  });

  it("logs and calls onError when the clipboard write fails — never silently", async () => {
    mockClipboard(async () => {
      throw new Error("denied");
    });
    const onError = vi.fn();
    const onSuccess = vi.fn();

    render(<CopyButton value="abc-123" onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByLabelText("Copy to clipboard"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    // The failure must be audible in the console.
    expect(consoleErrorSpy).toHaveBeenCalled();
    // No success feedback on failure.
    expect(document.querySelector(".lucide-check")).not.toBeInTheDocument();
  });
});
