export function GuideGraph() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Edges */}
      <line x1="40" y1="30" x2="100" y2="20" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="100" y1="20" x2="160" y2="30" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="40" y1="30" x2="30" y2="80" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="100" y1="20" x2="90" y2="80" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="160" y1="30" x2="170" y2="80" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="30" y1="80" x2="100" y2="100" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="170" y1="80" x2="100" y2="100" stroke="var(--color-surface-600)" strokeWidth="1" strokeOpacity="0.5" />

      {/* Nodes */}
      <circle cx="40" cy="30" r="8" fill="var(--color-surface-400)" fillOpacity="0.3" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      <circle cx="100" cy="20" r="8" fill="var(--color-brand-500)" fillOpacity="0.3" stroke="var(--color-brand-500)" strokeWidth="1.5" />
      <circle cx="160" cy="30" r="8" fill="var(--color-surface-400)" fillOpacity="0.3" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      <circle cx="30" cy="80" r="8" fill="var(--color-surface-400)" fillOpacity="0.3" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="8" fill="var(--color-surface-400)" fillOpacity="0.3" stroke="var(--color-surface-600)" strokeWidth="1.5" />
      <circle cx="170" cy="80" r="8" fill="var(--color-surface-400)" fillOpacity="0.3" stroke="var(--color-surface-600)" strokeWidth="1.5" />

      {/* Highlighted node inner dot */}
      <circle cx="100" cy="20" r="3" fill="var(--color-brand-500)" fillOpacity="0.6" />

      {/* Label-like line under center node */}
      <rect x="85" y="110" width="30" height="3" rx="1.5" fill="var(--color-brand-500)" fillOpacity="0.3" />
    </svg>
  );
}
