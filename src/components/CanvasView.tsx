import React from 'react';

interface CanvasViewProps {
  pixiContainer: React.RefObject<HTMLDivElement | null>;
  style?: React.CSSProperties;
}

const CanvasView: React.FC<CanvasViewProps> = ({ pixiContainer, style }) => {
  return (
    <div
      ref={pixiContainer as React.RefObject<HTMLDivElement>}
      style={style || {
        width: '100%',
        height: '100%',
        minWidth: 800,
        minHeight: 600,
        background: '#222',
        borderRadius: 8,
        boxShadow: '0 2px 16px #0002',
        position: 'relative',
      }}
    />
  );
};

export default CanvasView; 