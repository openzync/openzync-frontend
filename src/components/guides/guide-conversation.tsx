export function GuideConversation() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* User avatar */}
      <circle cx="30" cy="100" r="14" fill="var(--color-brand-500)" fillOpacity="0.3" stroke="var(--color-brand-500)" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="30" cy="96" r="5" fill="var(--color-brand-500)" fillOpacity="0.5" />
      <circle cx="30" cy="110" r="7" fill="var(--color-brand-500)" fillOpacity="0.2" />

      {/* Incoming message bubble */}
      <rect x="52" y="50" width="100" height="30" rx="8" fill="var(--color-surface-400)" fillOpacity="0.15" stroke="var(--color-surface-600)" strokeWidth="1" />
      <circle cx="62" cy="60" r="2" fill="var(--color-surface-400)" fillOpacity="0.4" />
      <circle cx="70" cy="60" r="2" fill="var(--color-surface-400)" fillOpacity="0.4" />
      <circle cx="78" cy="60" r="2" fill="var(--color-surface-400)" fillOpacity="0.4" />

      {/* Outgoing message bubble */}
      <rect x="80" y="88" width="100" height="30" rx="8" fill="var(--color-brand-500)" fillOpacity="0.15" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="88" y="96" width="36" height="4" rx="2" fill="var(--color-brand-500)" fillOpacity="0.5" />
      <rect x="88" y="104" width="24" height="4" rx="2" fill="var(--color-brand-500)" fillOpacity="0.3" />

      {/* Thought dots above */}
      <circle cx="170" cy="28" r="3" fill="var(--color-accent-300)" fillOpacity="0.6" />
      <circle cx="158" cy="20" r="2" fill="var(--color-accent-300)" fillOpacity="0.4" />
      <circle cx="180" cy="20" r="2" fill="var(--color-accent-300)" fillOpacity="0.4" />
    </svg>
  );
}
