import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { Model2D, ModelRenderOptions } from '../types';

interface ObjModelRendererProps {
  container: PIXI.Container | null;
  model2D: Model2D | null;
  renderOptions: ModelRenderOptions;
  viewTransform: { scale: number; offsetX: number; offsetY: number };
}

// 对象池管理
class PIXIObjectPool {
  private graphicsPool: PIXI.Graphics[] = [];
  private textPool: PIXI.Text[] = [];
  private maxPoolSize = 50;

  getGraphics(): PIXI.Graphics {
    if (this.graphicsPool.length > 0) {
      const graphics = this.graphicsPool.pop()!;
      graphics.clear();
      return graphics;
    }
    return new PIXI.Graphics();
  }

  returnGraphics(graphics: PIXI.Graphics) {
    if (this.graphicsPool.length < this.maxPoolSize) {
      graphics.clear();
      this.graphicsPool.push(graphics);
    }
  }

  getText(): PIXI.Text {
    if (this.textPool.length > 0) {
      return this.textPool.pop()!;
    }
    return new PIXI.Text('', {
      fontSize: 12,
      fill: 0xffffff,
      fontWeight: 'bold',
      align: 'center',
      stroke: 0x000000,
      strokeThickness: 2
    });
  }

  returnText(text: PIXI.Text) {
    if (this.textPool.length < this.maxPoolSize) {
      text.text = '';
      this.textPool.push(text);
    }
  }

  clear() {
    this.graphicsPool = [];
    this.textPool = [];
  }
}

const ObjModelRenderer: React.FC<ObjModelRendererProps> = ({
  container,
  model2D,
  renderOptions,
  viewTransform
}) => {
  const objectPool = useRef(new PIXIObjectPool());
  const renderedObjects = useRef<PIXI.DisplayObject[]>([]);
  const lastRenderData = useRef<{
    modelHash: string;
    viewHash: string;
    optionsHash: string;
  } | null>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理之前的渲染对象
  const clearPreviousRender = useCallback(() => {
    if (container && renderedObjects.current.length > 0) {
      renderedObjects.current.forEach(obj => {
        if (obj instanceof PIXI.Graphics) {
          objectPool.current.returnGraphics(obj);
        } else if (obj instanceof PIXI.Text) {
          objectPool.current.returnText(obj);
        }
        container.removeChild(obj);
      });
      renderedObjects.current = [];
    }
  }, [container]);

  // 计算模型数据的哈希值，用于判断是否需要重新渲染
  const modelHash = useMemo(() => {
    if (!model2D) return '';
    return JSON.stringify({
      facesCount: model2D.faces.length,
      verticesCount: model2D.vertices.length,
      bounds: model2D.bounds,
      center: model2D.center
    });
  }, [model2D]);

  // 计算视图变换的哈希值（使用四舍五入减少不必要的重渲染）
  const viewHash = useMemo(() => {
    const { scale, offsetX, offsetY } = viewTransform;
    // 四舍五入到小数点后2位，减少微小变化导致的重渲染
    const roundedScale = Math.round(scale * 100) / 100;
    const roundedOffsetX = Math.round(offsetX * 100) / 100;
    const roundedOffsetY = Math.round(offsetY * 100) / 100;
    return JSON.stringify({ scale: roundedScale, offsetX: roundedOffsetX, offsetY: roundedOffsetY });
  }, [viewTransform]);

  // 计算渲染选项的哈希值
  const optionsHash = useMemo(() => {
    return JSON.stringify(renderOptions);
  }, [renderOptions]);

  // 判断是否需要重新渲染
  const shouldReRender = useMemo(() => {
    if (!lastRenderData.current) return true;
    
    // 模型数据变化时立即重渲染
    if (lastRenderData.current.modelHash !== modelHash) return true;
    
    // 渲染选项变化时立即重渲染
    if (lastRenderData.current.optionsHash !== optionsHash) return true;
    
    // 视图变换变化时也重渲染，但用防抖控制频率
    if (lastRenderData.current.viewHash !== viewHash) {
      return true;
    }
    
    return false;
  }, [modelHash, viewHash, optionsHash]);

  // 渲染边长标注
  const renderEdgeLabels = useCallback((
    model2D: Model2D, 
    scale: number, 
    offsetX: number, 
    offsetY: number
  ): PIXI.Text[] => {
    const labels: PIXI.Text[] = [];
    const processedEdges = new Map<string, {
      v1: { x: number; y: number };
      v2: { x: number; y: number };
      length: number;
      count: number;
    }>();

    // 收集所有边并统计出现次数
    for (const face of model2D.faces) {
      if (face.vertices.length < 3) continue;
      
      for (let i = 0; i < face.vertices.length; i++) {
        const currentIndex = face.vertices[i];
        const nextIndex = face.vertices[(i + 1) % face.vertices.length];
        
        const currentVertex = model2D.vertices[currentIndex];
        const nextVertex = model2D.vertices[nextIndex];
        
        if (!currentVertex || !nextVertex) continue;
        
        const v1x = Math.round(currentVertex.x * 1000) / 1000;
        const v1y = Math.round(currentVertex.y * 1000) / 1000;
        const v2x = Math.round(nextVertex.x * 1000) / 1000;
        const v2y = Math.round(nextVertex.y * 1000) / 1000;
        
        const edgeKey = v1x < v2x || (v1x === v2x && v1y < v2y) 
          ? `${v1x},${v1y}-${v2x},${v2y}`
          : `${v2x},${v2y}-${v1x},${v1y}`;
        
        const worldLength = Math.sqrt(
          Math.pow(nextVertex.x - currentVertex.x, 2) + 
          Math.pow(nextVertex.y - currentVertex.y, 2)
        );
        
        if (processedEdges.has(edgeKey)) {
          processedEdges.get(edgeKey)!.count++;
        } else {
          processedEdges.set(edgeKey, {
            v1: currentVertex,
            v2: nextVertex,
            length: worldLength,
            count: 1
          });
        }
      }
    }

    // 只标注外边界的长边
    for (const [edgeKey, edge] of Array.from(processedEdges.entries())) {
      if (edge.count === 1 && edge.length > 1) {
        const midX = (edge.v1.x + edge.v2.x) / 2 * scale + offsetX;
        const midY = (edge.v1.y + edge.v2.y) / 2 * scale + offsetY;
        
        const label = objectPool.current.getText();
        label.text = `${edge.length.toFixed(1)}m`;
        label.anchor.set(0.5);
        label.x = midX;
        label.y = midY - 8;
        
        labels.push(label);
      }
    }

    return labels;
  }, []);

  // 渲染OBJ模型（采用动块的渲染方式）
  const renderModel = useCallback(() => {
    if (!container || !model2D || !renderOptions.visible) return;

    const { scale, offsetX, offsetY } = viewTransform;
    const { color, lineWidth, fillAlpha, opacity } = renderOptions;

    // 为每个面创建独立的Graphics对象（像动块一样）
    for (const face of model2D.faces) {
      if (face.vertices.length < 3) continue;
      
      const faceGraphics = objectPool.current.getGraphics();
      faceGraphics.alpha = opacity;
      
      const faceVertices = face.vertices.map(vertexIndex => {
        const vertex = model2D.vertices[vertexIndex];
        if (!vertex) return null;
        
        return {
          x: vertex.x * scale + offsetX,
          y: vertex.y * scale + offsetY
        };
      }).filter(Boolean) as { x: number; y: number }[];
      
      if (faceVertices.length < 3) continue;
      
      // 每个面独立绘制，不累积
      faceGraphics.lineStyle(lineWidth, color, 0.8);
      faceGraphics.beginFill(color, fillAlpha);
      faceGraphics.moveTo(faceVertices[0].x, faceVertices[0].y);
      
      for (let i = 1; i < faceVertices.length; i++) {
        faceGraphics.lineTo(faceVertices[i].x, faceVertices[i].y);
      }
      
      faceGraphics.closePath();
      faceGraphics.endFill();
      
      // 立即添加到容器
      container.addChild(faceGraphics as unknown as PIXI.DisplayObject);
      renderedObjects.current.push(faceGraphics as unknown as PIXI.DisplayObject);
    }

    // 渲染边长标注（每个标签独立创建）
    const edgeLabels = renderEdgeLabels(model2D, scale, offsetX, offsetY);
    edgeLabels.forEach(label => {
      container.addChild(label as unknown as PIXI.DisplayObject);
      renderedObjects.current.push(label as unknown as PIXI.DisplayObject);
    });

    // 更新渲染数据哈希
    lastRenderData.current = { modelHash, viewHash, optionsHash };
  }, [container, model2D, renderOptions, viewTransform, modelHash, viewHash, optionsHash, renderEdgeLabels]);

  // 主渲染逻辑（智能防抖：拖拽时保持显示，停止后更新）
  useEffect(() => {
    if (!shouldReRender) return;

    // 清除之前的定时器
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // 检查是否是视图变换变化
    const isViewTransformChange = lastRenderData.current && 
      lastRenderData.current.viewHash !== viewHash;

    if (isViewTransformChange) {
      // 视图变换变化时，使用短延迟，让模型在拖拽过程中保持可见
      renderTimeoutRef.current = setTimeout(() => {
        clearPreviousRender();
        renderModel();
      }, 16); // 16ms，约60fps，拖拽时保持流畅
    } else {
      // 其他变化（模型数据、渲染选项）时，立即渲染
      clearPreviousRender();
      renderModel();
    }
  }, [shouldReRender, clearPreviousRender, renderModel, viewHash]);

  // 清理函数
  useEffect(() => {
    return () => {
      clearPreviousRender();
      objectPool.current.clear();
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [clearPreviousRender]);

  // 调试信息
  useEffect(() => {
    if (model2D && renderOptions.visible) {
      console.log('OBJ模型渲染优化:', {
        面数: model2D.faces.length,
        顶点数: model2D.vertices.length,
        对象池大小: objectPool.current['maxPoolSize'],
        当前渲染对象数: renderedObjects.current.length,
        是否需要重渲染: shouldReRender
      });
    }
  }, [model2D, renderOptions.visible, shouldReRender]);

  return null; // 这是一个纯渲染组件，不需要DOM
};

export default ObjModelRenderer;
