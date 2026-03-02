import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CalendarDays, Users } from "lucide-react";
import { cn } from "../../lib/utils";

gsap.registerPlugin(ScrollTrigger);

export interface StackedEventCard {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  timeLabel: string;
  crowdLabel: string;
  accentRgb: string;
}

interface CardProps {
  card: StackedEventCard;
  index: number;
  totalCards: number;
  onCardClick?: (card: StackedEventCard) => void;
}

const Card: React.FC<CardProps> = ({ card, index, totalCards, onCardClick }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cardEl = cardRef.current;
    const container = containerRef.current;
    if (!cardEl || !container) return;

    const targetScale = 1 - (totalCards - index - 1) * 0.05;
    gsap.set(cardEl, { scale: 1, transformOrigin: "center top" });

    const trigger = ScrollTrigger.create({
      trigger: container,
      start: "top top+=120",
      end: "bottom top+=140",
      scrub: 1,
      onUpdate: (self) => {
        const scale = gsap.utils.interpolate(1, targetScale, self.progress);
        gsap.set(cardEl, { scale: Math.max(scale, targetScale) });
      }
    });

    return () => trigger.kill();
  }, [index, totalCards]);

  return (
    <div ref={containerRef} className="events-stack-row">
      <article
        ref={cardRef}
        className="events-stack-card"
        style={{ top: `calc(8vh + ${index * 24}px)` }}
        role={onCardClick ? "button" : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onClick={onCardClick ? () => onCardClick(card) : undefined}
        onKeyDown={
          onCardClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onCardClick(card);
                }
              }
            : undefined
        }
      >
        <div
          className="events-stack-border"
          style={{
            background: `conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(${card.accentRgb}, 0.95) 60deg,
              rgba(${card.accentRgb}, 0.7) 120deg,
              transparent 180deg,
              rgba(${card.accentRgb}, 0.5) 240deg,
              transparent 360deg
            )`
          }}
        />

        <div className="events-stack-glass">
          <img src={card.imageUrl} alt={card.title} className="events-stack-image" />
          <div className="events-stack-image-overlay" />
          <div className="events-stack-reflection" />
          <div className="events-stack-grain" />

          <div className="events-stack-content">
            <h3 className="events-stack-title">{card.title}</h3>
            <p className="events-stack-description">{card.description}</p>
            <div className="events-stack-meta">
              <span className="events-stack-chip">
                <CalendarDays className="h-4 w-4" />
                {card.timeLabel}
              </span>
              <span className="events-stack-chip">
                <Users className="h-4 w-4" />
                {card.crowdLabel}
              </span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
};

interface StackedCardsProps {
  cards: StackedEventCard[];
  className?: string;
  onCardClick?: (card: StackedEventCard) => void;
}

export const StackedCards: React.FC<StackedCardsProps> = ({ cards, className, onCardClick }) => {
  return (
    <section className={cn("events-stack-section", className)}>
      <div className="events-stack-heading-wrap">
        <p className="events-stack-kicker">Ongoing Activity</p>
        <h2 className="events-stack-heading">Current Events</h2>
        <p className="events-stack-sub">
          Scroll to preview active venues and live crowd pressure at a glance.
        </p>
      </div>
      {cards.map((card, index) => (
        <Card
          key={card.id}
          card={card}
          index={index}
          totalCards={cards.length}
          onCardClick={onCardClick}
        />
      ))}
    </section>
  );
};
