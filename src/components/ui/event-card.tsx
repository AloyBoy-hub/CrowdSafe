import styled from "styled-components";
import { Plus } from "lucide-react";

interface EventCardProps {
  title?: string;
  imageUrl?: string;
  isAddCard?: boolean;
}

export function EventCard({ title, imageUrl, isAddCard = false }: EventCardProps) {
  return (
    <StyledWrapper>
      <div
        className="card ui-clickable"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        <div className="overlay" />
        {isAddCard ? (
          <div className="add-content">
            <Plus size={28} />
            <span>New Event</span>
          </div>
        ) : (
          <div className="title">{title}</div>
        )}
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .card {
    position: relative;
    width: 190px;
    height: 254px;
    border-radius: 50px;
    background: #e0e0e0;
    box-shadow:
      20px 20px 60px #bebebe,
      -20px -20px 60px #ffffff;
    background-size: cover;
    background-position: center;
    overflow: hidden;
  }

  .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(2, 6, 23, 0.74), rgba(2, 6, 23, 0.05));
  }

  .title {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 18px;
    color: #f8fafc;
    font-weight: 600;
    font-size: 14px;
  }

  .add-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #0f172a;
    font-weight: 600;
    background: linear-gradient(145deg, #e2e8f0, #f8fafc);
  }
`;
