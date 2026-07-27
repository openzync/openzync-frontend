"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

interface PageGuideProps {
  title: string;
  illustration: React.ReactNode;
  children: React.ReactNode;
}

export function PageGuide({ title, illustration, children }: PageGuideProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
        aria-expanded={isOpen}
        aria-controls="page-guide-content"
      >
        {isOpen ? (
          <>
            <X size={14} />
            Close guide
          </>
        ) : (
          <>
            <HelpCircle size={14} />
            Learn about this page
          </>
        )}
      </button>

      <div
        id="page-guide-content"
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex gap-6 p-4 rounded-lg bg-surface-900 border border-surface-800">
          <div className="shrink-0 w-44 h-32 flex items-center justify-center">
            {illustration}
          </div>
          <div className="min-w-0 text-sm text-surface-300 space-y-1.5">
            <p className="font-medium text-surface-100">{title}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
