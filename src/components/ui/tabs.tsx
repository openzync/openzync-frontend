"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

type TabsVariant = "underline" | "pill";

const TabsVariantContext = createContext<TabsVariant>("underline");

interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  /** "underline": bottom-bar tabs (session detail). "pill": segmented control (memory page). */
  variant?: TabsVariant;
}

export function Tabs({ variant = "underline", className, ...props }: TabsProps) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root className={className} {...props} />
    </TabsVariantContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.List
      className={
        variant === "underline"
          ? cn("flex items-center gap-4 border-b border-surface-700", className)
          : cn(
              "inline-flex items-center gap-1 rounded-lg bg-surface-900 p-1",
              className,
            )
      }
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer text-sm font-medium transition-colors outline-none",
        "focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "underline"
          ? "-mb-px border-b-2 border-transparent pb-2 text-surface-400 hover:text-text-secondary data-[state=active]:border-brand-500 data-[state=active]:text-text-primary"
          : "rounded-md px-3 py-1.5 text-surface-400 hover:text-text-secondary data-[state=active]:bg-surface-800 data-[state=active]:text-text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("outline-none", className)}
      {...props}
    />
  );
}
