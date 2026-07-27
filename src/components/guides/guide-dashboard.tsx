export function GuideDashboard() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Stat card blocks */}
      <rect x="10" y="20" width="40" height="24" rx="4" fill="var(--color-brand-500)" fillOpacity="0.2" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="54" y="20" width="40" height="24" rx="4" fill="var(--color-accent-300)" fillOpacity="0.2" stroke="var(--color-accent-300)" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="98" y="20" width="40" height="24" rx="4" fill="var(--color-success)" fillOpacity="0.2" stroke="var(--color-success)" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="142" y="20" width="40" height="24" rx="4" fill="var(--color-surface-400)" fillOpacity="0.2" stroke="var(--color-surface-400)" strokeOpacity="0.4" strokeWidth="1.5" />

      {/* Bar chart */}
      <rect x="16" y="68" width="12" height="28" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />
      <rect x="32" y="60" width="12" height="36" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />
      <rect x="48" y="52" width="12" height="44" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />
      <rect x="64" y="56" width="12" height="40" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />
      <rect x="80" y="46" width="12" height="50" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />
      <rect x="96" y="60" width="12" height="36" rx="2" fill="var(--color-brand-500)" fillOpacity="0.6" />

      {/* X-axis line */}
      <line x1="10" y1="98" x2="110" y2="98" stroke="var(--color-surface-600)" strokeWidth="1" />

      {/* Activity dots */}
      <circle cx="130" cy="78" r="3" fill="var(--color-accent-300)" fillOpacity="0.7" />
      <circle cx="145" cy="68" r="3" fill="var(--color-accent-300)" fillOpacity="0.7" />
      <circle cx="160" cy="84" r="3" fill="var(--color-accent-300)" fillOpacity="0.7" />
      <circle cx="175" cy="74" r="3" fill="var(--color-accent-300)" fillOpacity="0.7" />

      {/* Connecting lines between dots */}
      <line x1="130" y1="78" x2="145" y2="68" stroke="var(--color-accent-300)" strokeOpacity="0.3" strokeWidth="1" />
      <line x1="145" y1="68" x2="160" y2="84" stroke="var(--color-accent-300)" strokeOpacity="0.3" strokeWidth="1" />
      <line x1="160" y1="84" x2="175" y2="74" stroke="var(--color-accent-300)" strokeOpacity="0.3" strokeWidth="1" />
    </svg>
  );
}
