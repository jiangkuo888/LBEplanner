import { useState, useCallback, useRef } from 'react';
import { message } from 'antd';
import { ObjModel, Model2D, ModelRenderOptions } from '../types';
import { parseObjFile, convert3DTo2D, applyWorldTransform } from '../utils/objParser';

export interface UseObjModelReturn {
  model2D: Model2D | null;
  renderOptions: ModelRenderOptions;
  isLoading: boolean;
  loadObjFile: (file: File) => Promise<void>;
  updateRenderOptions: (options: Partial<ModelRenderOptions>) => void;
  clearModel: () => void;
  applyTransform: (transform: { scale: number; offsetX: number; offsetY: number; rotation?: number }) => void;
  cleanupMemory: () => void;
}

const defaultRenderOptions: ModelRenderOptions = {
  visible: true,
  opacity: 0.8,
  color: 0x00ff00, // 绿色，更容易看到
  lineWidth: 2,
  fillAlpha: 0.3
};

export function useObjModel(): UseObjModelReturn {
  const [model2D, setModel2D] = useState<Model2D | null>(null);
  const [renderOptions, setRenderOptions] = useState<ModelRenderOptions>(defaultRenderOptions);
  const [isLoading, setIsLoading] = useState(false);
  
  // 缓存原始模型数据，避免重复解析
  const originalModelRef = useRef<ObjModel | null>(null);
  const currentTransformRef = useRef<{ scale: number; offsetX: number; offsetY: number; rotation: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0
  });

  const loadObjFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      const objModel: ObjModel = parseObjFile(content);
      
      if (objModel.vertices.length === 0) {
        throw new Error('OBJ文件没有有效的顶点数据');
      }

      // 缓存原始模型
      originalModelRef.current = objModel;
      
      const model2D = convert3DTo2D(objModel);
      
      // 将模型单位放大100倍（厘米转米）
      const { bounds } = model2D;
      const modelWidth = bounds.maxX - bounds.minX;
      const modelHeight = bounds.maxY - bounds.minY;
      
      console.log('原始模型尺寸:', { width: modelWidth, height: modelHeight, bounds });
      
      // 检查模型尺寸是否有效
      if (isNaN(modelWidth) || isNaN(modelHeight) || modelWidth === 0 || modelHeight === 0) {
        console.warn('模型尺寸无效，使用原始模型');
        setModel2D(model2D);
        message.success(`OBJ模型加载成功: ${objModel.vertices.length}个顶点, ${objModel.faces.length}个面，已对齐到场地锚点`);
        return;
      }
      
      // 将模型单位放大100倍（厘米转米）并旋转90度（正方向从向下改为向右）
      const scale = 100;
      const rotation = -Math.PI / 2; // 顺时针旋转90度，将正方向从向下改为向右
      
      // 更新当前变换
      currentTransformRef.current = { scale, offsetX: 0, offsetY: 0, rotation };
      
      const transformedModel = applyWorldTransform(model2D, {
        scale: scale,
        offsetX: 0, // 不偏移，保持(0,0,0)对齐到场地锚点
        offsetY: 0,
        rotation: rotation
      });
      
      setModel2D(transformedModel);
      console.log('应用单位转换和旋转（厘米转米，顺时针90度）:', { 
        scale,
        rotation: `${(rotation * 180 / Math.PI).toFixed(1)}°`,
        originalSize: { width: modelWidth, height: modelHeight },
        scaledSize: { width: modelWidth * scale, height: modelHeight * scale },
        bounds
      });
      
      message.success(`OBJ模型加载成功: ${objModel.vertices.length}个顶点, ${objModel.faces.length}个面，已对齐到场地锚点（厘米转米，正方向向右）`);
    } catch (error) {
      console.error('OBJ文件解析失败:', error);
      message.error('OBJ文件解析失败，请检查文件格式');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateRenderOptions = useCallback((options: Partial<ModelRenderOptions>) => {
    setRenderOptions(prev => ({ ...prev, ...options }));
  }, []);

  const clearModel = useCallback(() => {
    setModel2D(null);
    originalModelRef.current = null;
    currentTransformRef.current = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
  }, []);

  const applyTransform = useCallback((transform: { scale: number; offsetX: number; offsetY: number; rotation?: number }) => {
    if (originalModelRef.current) {
      // 合并变换
      const newTransform = {
        ...currentTransformRef.current,
        ...transform
      };
      
      // 从原始模型重新计算，避免累积误差
      const model2D = convert3DTo2D(originalModelRef.current);
      const transformedModel = applyWorldTransform(model2D, newTransform);
      
      currentTransformRef.current = newTransform;
      setModel2D(transformedModel);
    }
  }, []);

  const cleanupMemory = useCallback(() => {
    // 清理不必要的缓存数据
    if (process.env.NODE_ENV === 'development') {
      console.log('清理OBJ模型内存...');
    }
  }, []);

  return {
    model2D,
    renderOptions,
    isLoading,
    loadObjFile,
    updateRenderOptions,
    clearModel,
    applyTransform,
    cleanupMemory
  };
}
