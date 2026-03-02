import * as React from "react";
import { cn } from "../../lib/utils";

interface GlassProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
  effectClassName?: string;
}

const Glass = React.forwardRef<HTMLDivElement, GlassProps>(
  ({ className, width = "w-[360px] lg:w-[900px]", height = "h-[40px]", effectClassName, children, ...props }, ref) => {
    return (
      <div
        className={cn("fixed left-1/2 top-0 z-50 -translate-x-1/2 animate-slide-up", className)}
        ref={ref}
        {...props}
      >
        <div className="flex w-full flex-col items-center justify-center">
          <div className={cn("relative overflow-hidden rounded-b-2xl", width, height)}>
            <div className="pointer-events-none absolute bottom-0 z-10 h-full w-full overflow-hidden rounded-b-2xl border border-[#f5f5f566]">
              <div className={cn("glass-effect h-full w-full", effectClassName)} />
            </div>

            <div className="relative z-20 h-full w-full">{children}</div>

            <svg className="absolute">
              <defs>
                <filter id="fractal-noise-glass">
                  <feTurbulence type="fractalNoise" baseFrequency="0.12 0.12" numOctaves="1" result="warp" />
                  <feDisplacementMap
                    xChannelSelector="R"
                    yChannelSelector="G"
                    scale="30"
                    in="SourceGraphic"
                    in2="warp"
                  />
                </filter>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    );
  }
);

Glass.displayName = "Glass";

export { Glass };
