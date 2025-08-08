import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Model2D, ModelRenderOptions } from '../types';

interface ObjModelRendererProps {
  model2D: Model2D | null;
  renderOptions: ModelRenderOptions;
  container: PIXI.Container | null;
  viewTransform: { scale: number; offsetX: number; offsetY: number };
}

const ObjModelRenderer: React.FC<ObjModelRendererProps> = ({
  model2D,
  renderOptions,
  container,
  viewTransform
}) => {
  const modelRef = useRef<PIXI.Graphics | null>(null);

  // 安全的销毁函数
  const safeDestroy = (graphics: PIXI.Graphics | null) => {
    if (graphics && typeof graphics.destroy === 'function') {
      try {
        // 检查是否已经被销毁
        if (!graphics.destroyed) {
          graphics.destroy({ children: true });
        }
      } catch (error) {
        console.warn('Graphics销毁失败:', error);
      }
    }
  };

  // 安全的移除函数
  const safeRemove = (graphics: PIXI.Graphics | null, container: PIXI.Container | null) => {
    if (graphics && container && typeof container.removeChildAt === 'function') {
      try {
        const displayObject = graphics as unknown as PIXI.DisplayObject;
        const index = container.children.indexOf(displayObject);
        if (index !== -1) {
          container.removeChildAt(index);
        }
      } catch (error) {
        console.warn('Graphics移除失败:', error);
      }
    }
  };

  useEffect(() => {
    if (!container || !model2D || !renderOptions.visible) {
      // 清除现有模型
      if (modelRef.current) {
        safeRemove(modelRef.current, container);
        safeDestroy(modelRef.current);
        modelRef.current = null;
      }
      return;
    }

    // 清除现有模型
    if (modelRef.current) {
      safeRemove(modelRef.current, container);
      safeDestroy(modelRef.current);
    }

    // 创建新的图形对象
    const graphics = new PIXI.Graphics();
    modelRef.current = graphics;

    const { scale, offsetX, offsetY } = viewTransform;
    const { color, lineWidth, fillAlpha, opacity } = renderOptions;

    // 设置透明度
    graphics.alpha = opacity;

    // 渲染每个面
    for (const face of model2D.faces) {
      if (face.vertices.length < 3) continue;

      // 获取面的顶点
      const faceVertices = face.vertices.map(vertexIndex => {
        const vertex = model2D.vertices[vertexIndex];
        if (!vertex) return null;
        
        // 应用视图变换
        return {
          x: vertex.x * scale + offsetX,
          y: vertex.y * scale + offsetY
        };
      }).filter(Boolean) as { x: number; y: number }[];

      if (faceVertices.length < 3) continue;

      // 绘制面
      graphics.lineStyle(lineWidth, color, 0.8);
      graphics.beginFill(color, fillAlpha);
      graphics.moveTo(faceVertices[0].x, faceVertices[0].y);
      
      for (let i = 1; i < faceVertices.length; i++) {
        graphics.lineTo(faceVertices[i].x, faceVertices[i].y);
      }
      
      graphics.closePath();
      graphics.endFill();
    }

    // 添加到容器
    try {
      if (container && typeof container.addChild === 'function') {
        container.addChild(graphics as unknown as PIXI.DisplayObject);
      }
    } catch (error) {
      console.warn('Graphics添加到容器失败:', error);
      safeDestroy(graphics);
      modelRef.current = null;
    }

    // 清理函数
    return () => {
      if (modelRef.current) {
        safeRemove(modelRef.current, container);
        safeDestroy(modelRef.current);
        modelRef.current = null;
      }
    };
  }, [model2D, renderOptions, container, viewTransform]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (modelRef.current) {
        safeDestroy(modelRef.current);
        modelRef.current = null;
      }
    };
  }, []);

  return null; // 这是一个纯渲染组件，不返回JSX
};

export default ObjModelRenderer;
