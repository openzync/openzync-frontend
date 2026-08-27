import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shared/table";

function renderTable(props: { zebra?: boolean } = {}) {
  return render(
    <Table zebra={props.zebra}>
      <TableHeader>
        <TableHead>Name</TableHead>
        <TableHead align="right">Actions</TableHead>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>alpha</TableCell>
          <TableCell align="right">edit</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>beta</TableCell>
          <TableCell align="right">edit</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table", () => {
  it("renders headers and rows inside a semantic table", () => {
    const { container } = renderTable();
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("wraps the table in an overflow-x-auto container for mobile scroll", () => {
    const { container } = renderTable();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("overflow-x-auto");
  });

  it("applies the canonical header style (bg-surface-800 row, uppercase th)", () => {
    const { container } = renderTable();
    const headerRow = container.querySelector("thead tr") as HTMLElement;
    expect(headerRow.className).toContain("bg-surface-800");
    const th = container.querySelector("th") as HTMLElement;
    expect(th.className).toContain("uppercase");
    expect(th.className).toContain("px-4");
  });

  it("enables zebra striping by default via nth-child on the table", () => {
    const { container } = renderTable();
    const table = container.querySelector("table") as HTMLElement;
    expect(table.className).toContain("nth-child(odd)");
  });

  it("omits zebra striping when zebra={false}", () => {
    const { container } = renderTable({ zebra: false });
    const table = container.querySelector("table") as HTMLElement;
    expect(table.className).not.toContain("nth-child");
  });
});
