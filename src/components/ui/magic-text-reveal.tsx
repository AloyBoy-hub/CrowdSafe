"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";

interface Particle {
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  color: string;
  opacity: number;
  originalAlpha: number;
  velocityX: number;
  velocityY: number;
  angle: number;
  speed: number;
  floatingOffsetX: number;
  floatingOffsetY: number;
  floatingSpeed: number;
  floatingAngle: number;
  targetOpacity: number;
  sparkleSpeed: number;
}

interface MagicTextRevealProps {
  text?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  spread?: number;
  speed?: number;
  density?: number;
  paddingScale?: number;
  resetOnMouseLeave?: boolean;
  alwaysShowText?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const MagicTextReveal: React.FC<MagicTextRevealProps> = ({
  text = "Magic Text",
  color = "rgba(255, 255, 255, 1)",
  fontSize = 70,
  fontFamily = "Jakarta Sans, sans-serif",
  fontWeight = 600,
  spread = 40,
  speed = 0.5,
  density = 4,
  paddingScale = 1,
  resetOnMouseLeave = true,
  alwaysShowText = false,
  className = "",
  style = {}
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const [isHovered, setIsHovered] = useState(false);
  const [showText, setShowText] = useState(false);
  const [hasBeenShown, setHasBeenShown] = useState(false);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const [textDimensions, setTextDimensions] = useState({ width: 0, height: 0 });

  const transformedDensity = 6 - density;
  const globalDpr = useMemo(() => {
    if (typeof window !== "undefined") return window.devicePixelRatio * 1.5 || 1;
    return 1;
  }, []);

  const measureText = useCallback((inputText: string, inputFontSize: number, inputFontWeight: number, inputFontFamily: string) => {
    if (typeof window === "undefined") return { width: 200, height: 60 };

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { width: 200, height: 60 };

    ctx.font = `${inputFontWeight} ${inputFontSize}px ${inputFontFamily}`;
    const metrics = ctx.measureText(inputText);

    return {
      width: Math.ceil(metrics.width + inputFontSize * 0.5),
      height: Math.ceil(inputFontSize * 1.4)
    };
  }, []);

  useEffect(() => {
    const dimensions = measureText(text, fontSize, fontWeight, fontFamily);
    setTextDimensions(dimensions);
  }, [text, fontSize, fontWeight, fontFamily, measureText]);

  const createParticles = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      inputText: string,
      textX: number,
      textY: number,
      font: string,
      inputColor: string,
      samplingDensity: number
    ): Particle[] => {
      const particles: Particle[] = [];

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = inputColor;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.imageSmoothingEnabled = true;
      ctx.fillText(inputText, textX, textY);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const currentDpr = canvas.width / parseInt(canvas.style.width, 10);
      const baseSampleRate = Math.max(2, Math.round(currentDpr));
      const sampleRate = baseSampleRate * samplingDensity;

      let minX = canvas.width;
      let maxX = 0;
      let minY = canvas.height;
      let maxY = 0;

      for (let y = 0; y < canvas.height; y += sampleRate) {
        for (let x = 0; x < canvas.width; x += sampleRate) {
          const index = (y * canvas.width + x) * 4;
          const alpha = data[index + 3];
          if (alpha > 0) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }

      const textWidth = maxX - minX;
      const textHeight = maxY - minY;
      const spreadRadius = Math.max(textWidth, textHeight) * 0.1;

      for (let y = 0; y < canvas.height; y += sampleRate) {
        for (let x = 0; x < canvas.width; x += sampleRate) {
          const index = (y * canvas.width + x) * 4;
          const alpha = data[index + 3];
          if (alpha > 0) {
            const originalAlpha = alpha / 255;
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spreadRadius;
            const initialX = x + Math.cos(angle) * distance;
            const initialY = y + Math.sin(angle) * distance;

            particles.push({
              x: initialX,
              y: initialY,
              originalX: x,
              originalY: y,
              color: `rgba(${data[index]}, ${data[index + 1]}, ${data[index + 2]}, ${originalAlpha})`,
              opacity: originalAlpha * 0.3,
              originalAlpha,
              velocityX: 0,
              velocityY: 0,
              angle: Math.random() * Math.PI * 2,
              speed: 0,
              floatingOffsetX: 0,
              floatingOffsetY: 0,
              floatingSpeed: Math.random() * 2 + 1,
              floatingAngle: Math.random() * Math.PI * 2,
              targetOpacity: Math.random() * originalAlpha * 0.5,
              sparkleSpeed: Math.random() * 2 + 1
            });
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return particles;
    },
    []
  );

  const updateParticles = useCallback(
    (
      particles: Particle[],
      deltaTime: number,
      hovered: boolean,
      textShown: boolean,
      setTextShown: (show: boolean) => void,
      spreadDistance: number,
      movementSpeed: number
    ) => {
      const FLOAT_RADIUS = spreadDistance;
      const RETURN_SPEED = 3;
      const FLOAT_SPEED = movementSpeed;
      const TRANSITION_SPEED = 5 * FLOAT_SPEED;
      const NOISE_SCALE = 0.6;
      const CHAOS_FACTOR = 1.3;
      const FADE_SPEED = 13;

      particles.forEach((particle) => {
        if (hovered) {
          const dx = particle.originalX - particle.x;
          const dy = particle.originalY - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 0.1) {
            particle.x += (dx / distance) * RETURN_SPEED * deltaTime * 60;
            particle.y += (dy / distance) * RETURN_SPEED * deltaTime * 60;
          } else {
            particle.x = particle.originalX;
            particle.y = particle.originalY;
          }

          particle.opacity = Math.max(0, particle.opacity - FADE_SPEED * deltaTime);
        } else {
          particle.floatingAngle += deltaTime * particle.floatingSpeed * (1 + Math.random() * CHAOS_FACTOR);

          const time = Date.now() * 0.001;
          const uniqueOffset = particle.floatingSpeed * 2000;
          const noiseX =
            (Math.sin(time * particle.floatingSpeed + particle.floatingAngle) * 1.2 +
              Math.sin((time + uniqueOffset) * 0.5) * 0.8 +
              (Math.random() - 0.5) * CHAOS_FACTOR) *
            NOISE_SCALE;
          const noiseY =
            (Math.cos(time * particle.floatingSpeed + particle.floatingAngle * 1.5) * 0.6 +
              Math.cos((time + uniqueOffset) * 0.5) * 0.4 +
              (Math.random() - 0.5) * CHAOS_FACTOR) *
            NOISE_SCALE;

          const targetX = particle.originalX + FLOAT_RADIUS * noiseX;
          const targetY = particle.originalY + FLOAT_RADIUS * noiseY;
          const dx = targetX - particle.x;
          const dy = targetY - particle.y;
          const distanceFromTarget = Math.sqrt(dx * dx + dy * dy);
          const jitterScale = Math.min(1, distanceFromTarget / (FLOAT_RADIUS * 1.5));
          const jitterX = (Math.random() - 0.5) * FLOAT_SPEED * jitterScale;
          const jitterY = (Math.random() - 0.5) * FLOAT_SPEED * jitterScale;

          particle.x += dx * TRANSITION_SPEED * deltaTime + jitterX;
          particle.y += dy * TRANSITION_SPEED * deltaTime + jitterY;

          const distanceFromOrigin = Math.sqrt(
            Math.pow(particle.x - particle.originalX, 2) + Math.pow(particle.y - particle.originalY, 2)
          );

          if (distanceFromOrigin > FLOAT_RADIUS) {
            const angle = Math.atan2(particle.y - particle.originalY, particle.x - particle.originalX);
            const pullBack = (distanceFromOrigin - FLOAT_RADIUS) * 0.1;
            particle.x -= Math.cos(angle) * pullBack;
            particle.y -= Math.sin(angle) * pullBack;
          }

          const opacityDiff = particle.targetOpacity - particle.opacity;
          particle.opacity += opacityDiff * particle.sparkleSpeed * deltaTime * 3;
          if (Math.abs(opacityDiff) < 0.01) {
            particle.targetOpacity =
              Math.random() < 0.5 ? Math.random() * 0.1 * particle.originalAlpha : particle.originalAlpha * 3;
            particle.sparkleSpeed = Math.random() * 3 + 1;
          }
        }
      });

      if (hovered && !textShown) setTextShown(true);
      if (!hovered && textShown) setTextShown(false);
    },
    []
  );

  const renderParticles = useCallback((ctx: CanvasRenderingContext2D, particles: Particle[], dpr: number) => {
    ctx.save();
    ctx.scale(dpr, dpr);

    const particlesByColor = new Map<string, Array<{ x: number; y: number }>>();
    particles.forEach((particle) => {
      if (particle.opacity <= 0) return;
      const particleColor = particle.color.replace(/[\d.]+\)$/, `${particle.opacity})`);
      if (!particlesByColor.has(particleColor)) particlesByColor.set(particleColor, []);
      particlesByColor.get(particleColor)?.push({ x: particle.x / dpr, y: particle.y / dpr });
    });

    particlesByColor.forEach((positions, particleColor) => {
      ctx.fillStyle = particleColor;
      positions.forEach(({ x, y }) => {
        ctx.fillRect(x, y, 1, 1);
      });
    });

    ctx.restore();
  }, []);

  const renderCanvas = useCallback(() => {
    if (!wrapperRef.current || !canvasRef.current || !wrapperSize.width || !wrapperSize.height) return;

    const canvas = canvasRef.current;
    const { width, height } = wrapperSize;
    canvas.width = width * globalDpr;
    canvas.height = height * globalDpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const textX = canvas.width / 2;
    const textY = canvas.height / 2;
    const font = `${fontWeight} ${fontSize * globalDpr}px ${fontFamily}`;
    const particles = createParticles(ctx, canvas, text, textX, textY, font, color, transformedDensity);
    particlesRef.current = particles;
    renderParticles(ctx, particles, globalDpr);
  }, [wrapperSize, globalDpr, text, fontSize, fontFamily, fontWeight, color, transformedDensity, createParticles, renderParticles]);

  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !particlesRef.current.length) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      updateParticles(particlesRef.current, deltaTime, isHovered, showText, setShowText, spread, speed);
      renderParticles(ctx, particlesRef.current, globalDpr);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isHovered, showText, spread, speed, globalDpr, updateParticles, renderParticles]);

  useEffect(() => {
    const handleResize = () => {
      if (!wrapperRef.current || !textDimensions.width || !textDimensions.height) return;

      const isMobile = window.innerWidth < 768;
      const basePaddingRaw = isMobile ? Math.max(fontSize * 0.3, 20) : Math.max(fontSize * 0.5, 40);
      const basePadding = Math.max(8, basePaddingRaw * paddingScale);
      const minWidth = Math.max(textDimensions.width + basePadding * 2, isMobile ? 120 : 200);
      const minHeight = Math.max(textDimensions.height + basePadding * 2, isMobile ? 60 : 100);
      const parentRect = wrapperRef.current.parentElement?.getBoundingClientRect();
      const viewportMargin = isMobile ? 0.95 : 0.9;
      const maxWidth = parentRect ? parentRect.width * viewportMargin : window.innerWidth * viewportMargin;
      const maxHeight = parentRect ? parentRect.height * viewportMargin : window.innerHeight * viewportMargin;

      setWrapperSize({
        width: Math.min(minWidth, maxWidth),
        height: Math.min(minHeight, maxHeight)
      });
    };

    if (textDimensions.width && textDimensions.height) handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [textDimensions, fontSize, paddingScale]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setHasBeenShown(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (resetOnMouseLeave || !hasBeenShown) setIsHovered(false);
  }, [resetOnMouseLeave, hasBeenShown]);

  return (
    <div
      ref={wrapperRef}
      className={`relative flex items-center justify-center overflow-hidden rounded-lg transition-all duration-300 ${className}`}
      style={{
        width: wrapperSize.width || "auto",
        height: wrapperSize.height || "auto",
        minWidth: "150px",
        minHeight: "80px",
        maxWidth: "100%",
        backgroundColor: "rgba(15, 15, 15, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(10px)",
        cursor: "pointer",
        ...style
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`absolute z-10 transition-opacity duration-200 ${showText || alwaysShowText ? "opacity-100" : "opacity-0"}`}
        style={{
          color,
          fontFamily,
          fontWeight,
          fontSize: `${fontSize}px`,
          userSelect: "none",
          whiteSpace: "nowrap",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center"
        }}
      >
        {text}
      </div>
      <canvas ref={canvasRef} className="absolute left-0 top-0 h-full w-full" />
    </div>
  );
};
