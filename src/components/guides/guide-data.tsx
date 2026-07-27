export function GuideData() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Database cylinder — top ellipse */}
      <ellipse cx="100" cy="110" rx="48" ry="8" fill="var(--color-surface-400)" fillOpacity="0.2" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      {/* Database cylinder — body */}
      <rect x="52" y="110" width="96" height="20" fill="var(--color-surface-400)" fillOpacity="0.1" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      {/* Database cylinder — bottom ellipse */}
      <ellipse cx="100" cy="130" rx="48" ry="8" fill="var(--color-surface-400)" fillOpacity="0.15" stroke="var(--color-surface-600)" strokeWidth="1.5" />

      {/* Lines connecting database to table above */}
      <line x1="80" y1="108" x2="60" y2="40" stroke="var(--color-brand-500)" strokeOpacity="0.3" strokeWidth="1" />
      <line x1="120" y1="108" x2="140" y2="40" stroke="var(--color-brand-500)" strokeOpacity="0.3" strokeWidth="1" />

      {/* Table header row */}
      <rect x="44" y="18" width="112" height="14" rx="3" fill="var(--color-brand-500)" fillOpacity="0.2" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="1" />
      {/* Table header columns */}
      <rect x="52" y="21" width="28" height="8" rx="1.5" fill="var(--color-brand-500)" fillOpacity="0.4" />
      <rect x="86" y="21" width="28" height="8" rx="1.5" fill="var(--color-brand-500)" fillOpacity="0.4" />
      <rect x="120" y="21" width="28" height="8" rx="1.5" fill="var(--color-brand-500)" fillOpacity="0.4" />

      {/* Data row 1 */}
      <rect x="44" y="36" width="112" height="10" rx="2" fill="var(--color-surface-400)" fillOpacity="0.1" />
      <rect x="52" y="38" width="20" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="86" y="38" width="16" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="120" y="38" width="24" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />

      {/* Data row 2 */}
      <rect x="44" y="50" width="112" height="10" rx="2" fill="var(--color-surface-400)" fillOpacity="0.1" />
      <rect x="52" y="52" width="24" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="86" y="52" width="20" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="120" y="52" width="18" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />

      {/* Data row 3 */}
      <rect x="44" y="64" width="112" height="10" rx="2" fill="var(--color-surface-400)" fillOpacity="0.1" />
      <rect x="52" y="66" width="22" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="86" y="66" width="18" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="120" y="66" width="20" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />

      {/* Data row 4 */}
      <rect x="44" y="78" width="112" height="10" rx="2" fill="var(--color-surface-400)" fillOpacity="0.1" />
      <rect x="52" y="80" width="18" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="86" y="80" width="24" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <rect x="120" y="80" width="16" height="6" rx="1.5" fill="var(--color-surface-400)" fillOpacity="0.3" />
    </svg>
  );
}
