import { describe, it, expect } from "vitest";
import { getPasswordStrength } from "@/lib/password-strength";

// Row contract mirrors how the signup/invite pages consume the result:
// label is rendered beside the meter bar, color + score drive the bar itself.
const CASES = [
  { pw: "", score: 20, label: "Weak", color: "bg-error" },
  { pw: "short", score: 20, label: "Weak", color: "bg-error" },
  { pw: "password", score: 20, label: "Weak", color: "bg-error" }, // 8 chars → 1 point
  { pw: "abcdefghijkl", score: 40, label: "Fair", color: "bg-warning" }, // exactly 12 chars → 2 points
  { pw: "password1", score: 40, label: "Fair", color: "bg-warning" }, // + digit
  { pw: "password1A", score: 60, label: "Good", color: "bg-warning" }, // + upper
  { pw: "password1A!", score: 80, label: "Strong", color: "bg-success" }, // + symbol
  { pw: "longpassword1A!", score: 100, label: "Very Strong", color: "bg-success" }, // 12+ chars
];

describe("getPasswordStrength", () => {
  it.each(CASES)(
    "scores $pw as $label",
    ({ pw, score, label, color }) => {
      expect(getPasswordStrength(pw)).toEqual({ score, label, color });
    },
  );
});
