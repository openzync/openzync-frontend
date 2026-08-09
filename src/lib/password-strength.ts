/**
 * Shared password-strength heuristic used by the signup and invite pages.
 *
 * Extracted from the signup page so both password-setting flows (org signup,
 * invite acceptance) render an identical strength meter. Do not drift the
 * logic in one page only — change it here and both call sites stay consistent.
 */
export function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 1) return { score: 20, label: "Weak", color: "bg-error" };
  if (score <= 2) return { score: 40, label: "Fair", color: "bg-warning" };
  if (score <= 3) return { score: 60, label: "Good", color: "bg-warning" };
  if (score <= 4) return { score: 80, label: "Strong", color: "bg-success" };
  return { score: 100, label: "Very Strong", color: "bg-success" };
}
