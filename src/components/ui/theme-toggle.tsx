"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  isDark?: boolean;
  onToggle?: (next: boolean) => void;
}

export function ThemeToggle({ className, isDark, onToggle }: ThemeToggleProps) {
  const [internalIsDark, setInternalIsDark] = useState(true);
  const resolvedIsDark = isDark ?? internalIsDark;

  const handleToggle = () => {
    const next = !resolvedIsDark;
    if (isDark === undefined) {
      setInternalIsDark(next);
    }
    onToggle?.(next);
  };

  return (
    <div
      className={cn(
        "flex h-8 w-16 cursor-pointer rounded-full p-1 transition-all duration-300",
        resolvedIsDark
          ? "border border-zinc-800 bg-zinc-950"
          : "border border-zinc-200 bg-white",
        className
      )}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Toggle theme"
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-300",
            resolvedIsDark
              ? "translate-x-0 transform bg-zinc-800"
              : "translate-x-8 transform bg-gray-200"
          )}
        >
          {resolvedIsDark ? (
            <Moon className="h-4 w-4 text-white" strokeWidth={1.5} />
          ) : (
            <Sun className="h-4 w-4 text-gray-700" strokeWidth={1.5} />
          )}
        </div>
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-300",
            resolvedIsDark ? "bg-transparent" : "-translate-x-8 transform"
          )}
        >
          {resolvedIsDark ? (
            <Sun className="h-4 w-4 text-gray-500" strokeWidth={1.5} />
          ) : (
            <Moon className="h-4 w-4 text-black" strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  );
}
