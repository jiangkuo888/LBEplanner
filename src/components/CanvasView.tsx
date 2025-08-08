import React from 'react';
import * as PIXI from 'pixi.js';
import { Model2D, ModelRenderOptions } from '../types';
import ObjModelRenderer from './ObjModelRenderer';

interface CanvasViewProps {
  pixiContainer: React.RefObject<HTMLDivElement | null>;
  style?: React.CSSProperties;
  model2D?: Model2D | null;
  modelRenderOptions?: ModelRenderOptions;
  viewTransform?: { scale: number; offsetX: number; offsetY: number };
  blocksLayer?: PIXI.Container | null;
}

const CanvasView: React.FC<CanvasViewProps> = ({ 
  pixiContainer, 
  style,
  model2D,
  modelRenderOptions,
  viewTransform = { scale: 1, offsetX: 0, offsetY: 0 },
  blocksLayer
}) => {
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

// 导出ObjModelRenderer组件，让App.tsx直接使用
export { ObjModelRenderer };
export default CanvasView; 