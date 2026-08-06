import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnrichmentStatus } from "@/components/shared/enrichment-status";

describe("EnrichmentStatus", () => {
  it("renders accepted state with queued job", () => {
    render(<EnrichmentStatus status="accepted" jobId="job_123" episodeCount={3} />);
    expect(screen.getByText("Ingest accepted")).toBeInTheDocument();
    expect(screen.getByText("Job queued")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("3 episodes queued for enrichment")).toBeInTheDocument();
  });

  it("renders processing state with an active pulse", () => {
    const { container } = render(
      <EnrichmentStatus status="accepted" jobId="job_1" episodeCount={1} />,
    );
    expect(container.querySelector(".animate-pulse-dot")).toBeInTheDocument();
    expect(screen.getByLabelText("Enrichment pipeline status")).toBeInTheDocument();
  });

  it("renders done state when status reports completion", () => {
    render(<EnrichmentStatus status="completed" jobId="job_1" episodeCount={5} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    // "Processing" is complete once done — no active pulse remains
    const container = document.querySelector(".animate-pulse-dot");
    expect(container).not.toBeInTheDocument();
  });

  it("handles missing props gracefully", () => {
    const { container } = render(<EnrichmentStatus />);
    expect(screen.getByText("Ingest accepted")).toBeInTheDocument();
    expect(screen.getByText("Job queued")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    // No job id / episode meta line when props are absent
    expect(container.querySelector(".font-mono")).not.toBeInTheDocument();
  });

  it("renders free-text status verbatim with a pulse", () => {
    render(<EnrichmentStatus status="awaiting worker pool" />);
    expect(screen.getByText("awaiting worker pool")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders attached file count only when blobs were ingested", () => {
    const { rerender } = render(
      <EnrichmentStatus status="accepted" jobId="job_1" blobCount={2} />,
    );
    expect(screen.getByText("2 files attached")).toBeInTheDocument();
    rerender(<EnrichmentStatus status="accepted" jobId="job_1" blobCount={0} />);
    expect(screen.queryByText(/files? attached/)).not.toBeInTheDocument();
    rerender(<EnrichmentStatus status="accepted" jobId="job_1" />);
    expect(screen.queryByText(/files? attached/)).not.toBeInTheDocument();
  });
});
