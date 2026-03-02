"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

type GlassEffectProps = React.HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  liquidLevel?: "normal" | "strong";
  borderless?: boolean;
  rimless?: boolean;
};

export function GlassEffect({
  className,
  children,
  contentClassName,
  liquidLevel = "normal",
  borderless = false,
  rimless = false,
  ...props
}: GlassEffectProps) {
  const filterId = liquidLevel === "strong" ? "glass-distortion-strong" : "glass-distortion";
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl bg-white/5 text-inherit shadow-[0_10px_26px_rgba(2,6,23,0.2)] dark:bg-slate-900/15 dark:shadow-[0_10px_30px_rgba(0,0,0,0.38)]",
        borderless ? "border-0" : "border border-white/25 dark:border-white/12",
        className
      )}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backdropFilter: "blur(8px) saturate(130%)", filter: `url(#${filterId})` }}
      />
      <div className="pointer-events-none absolute inset-0 z-10 bg-white/14 dark:bg-slate-900/18" />
      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          boxShadow: rimless
            ? "none"
            : "inset 1px 1px 0.5px rgba(255,255,255,0.55), inset -1px -1px 0.5px rgba(255,255,255,0.35)"
        }}
      />
      <div className={cn("relative z-30", contentClassName)}>{children}</div>
    </div>
  );
}

type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  buttonClassName?: string;
  borderless?: boolean;
  rimless?: boolean;
};

export function GlassButton({
  className,
  buttonClassName,
  children,
  borderless = false,
  rimless = false,
  ...props
}: GlassButtonProps) {
  return (
    <GlassEffect
      className={cn(
        "rounded-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        className
      )}
      contentClassName="h-full"
      borderless={borderless}
      rimless={rimless}
    >
      <button
        className={cn(
          "inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
          buttonClassName
        )}
        {...props}
      >
        {children}
      </button>
    </GlassEffect>
  );
}

type GlassLinkWrapProps = {
  className?: string;
  children: React.ReactNode;
  borderless?: boolean;
  rimless?: boolean;
};

export function GlassLinkWrap({ className, children, borderless = false, rimless = false }: GlassLinkWrapProps) {
  return (
    <GlassEffect
      className={cn(
        "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        className
      )}
      borderless={borderless}
      rimless={rimless}
    >
      {children}
    </GlassEffect>
  );
}

export function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden="true">
      <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
        <feTurbulence type="fractalNoise" baseFrequency="0.001 0.005" numOctaves="1" seed="17" result="turbulence" />
        <feComponentTransfer in="turbulence" result="mapped">
          <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
          <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
          <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
        </feComponentTransfer>
        <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
        <feSpecularLighting
          in="softMap"
          surfaceScale="5"
          specularConstant="1"
          specularExponent="100"
          lightingColor="white"
          result="specLight"
        >
          <fePointLight x="-200" y="-200" z="300" />
        </feSpecularLighting>
        <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
        <feDisplacementMap in="SourceGraphic" in2="softMap" scale="200" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="glass-distortion-strong" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.018" numOctaves="2" seed="23" result="turbulence" />
        <feGaussianBlur in="turbulence" stdDeviation="4.5" result="softMap" />
        <feDisplacementMap in="SourceGraphic" in2="softMap" scale="280" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
