// Compact number display (1.1k style): k/M/B with 1 decimal, trailing ".0"
// trimmed. Re-checks after rounding so 999950 promotes to 1M, not 1000k.
export function formatCompact(v: number): string {
  const units: Array<[number, string]> = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [div, suffix] of units) {
    if (v >= div) {
      const rounded = Math.round((v / div) * 10) / 10;
      if (rounded >= 1000 && div < 1e9) return formatCompact(rounded * div);
      return `${rounded.toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return v.toLocaleString();
}
