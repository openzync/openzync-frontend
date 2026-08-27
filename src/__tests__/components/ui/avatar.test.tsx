import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("renders fallback initials when no image loads", () => {
    render(
      <Avatar>
        <AvatarImage src="/nope.png" alt="" />
        <AvatarFallback>RL</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("RL")).toBeInTheDocument();
  });
});
