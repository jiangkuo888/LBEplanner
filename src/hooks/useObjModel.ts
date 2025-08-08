import { useState, useCallback } from 'react';
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

  const loadObjFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      const objModel: ObjModel = parseObjFile(content);
      
      if (objModel.vertices.length === 0) {
        throw new Error('OBJ文件没有有效的顶点数据');
      }

      const model2D = convert3DTo2D(objModel);
      
      // 自动缩放，但不进行居中偏移
      const { bounds } = model2D;
      const modelWidth = bounds.maxX - bounds.minX;
      const modelHeight = bounds.maxY - bounds.minY;
      
      console.log('原始模型尺寸:', { width: modelWidth, height: modelHeight, bounds });
      
      // 检查模型尺寸是否有效
      if (isNaN(modelWidth) || isNaN(modelHeight) || modelWidth === 0 || modelHeight === 0) {
        console.warn('模型尺寸无效，跳过自动缩放');
        // 如果模型尺寸为0，设置一个默认的最小尺寸，但不偏移
        if (modelWidth === 0 || modelHeight === 0) {
          const defaultSize = 100;
          const transformedModel = applyWorldTransform(model2D, {
            scale: defaultSize / Math.max(modelWidth || 1, modelHeight || 1),
            offsetX: 0, // 不偏移，保持(0,0,0)对齐
            offsetY: 0
          });
          setModel2D(transformedModel);
          console.log('应用默认缩放:', { defaultSize, originalSize: { width: modelWidth, height: modelHeight } });
        } else {
          setModel2D(model2D);
        }
        message.success(`OBJ模型加载成功: ${objModel.vertices.length}个顶点, ${objModel.faces.length}个面，已对齐到场地锚点`);
        return;
      }
      
      // 单位转换：如果模型尺寸小于10，可能是厘米或毫米单位，需要转换为米
      let unitScale = 1;
      if (modelWidth < 10 && modelHeight < 10) {
        // 可能是厘米单位，转换为米
        unitScale = 100;
        console.log('检测到小尺寸模型，应用厘米到米的单位转换');
      } else if (modelWidth < 1 && modelHeight < 1) {
        // 可能是毫米单位，转换为米
        unitScale = 1000;
        console.log('检测到极小尺寸模型，应用毫米到米的单位转换');
      }
      
      // 如果模型太大或太小，自动调整缩放
      let autoScale = 1;
      const maxSize = 1000; // 最大尺寸（米）
      const minSize = 10;   // 最小尺寸（米）
      
      const scaledWidth = modelWidth * unitScale;
      const scaledHeight = modelHeight * unitScale;
      
      if (scaledWidth > maxSize || scaledHeight > maxSize) {
        autoScale = maxSize / Math.max(scaledWidth, scaledHeight);
      } else if (scaledWidth < minSize && scaledHeight < minSize) {
        autoScale = minSize / Math.min(scaledWidth, scaledHeight);
      }
      
      // 检查autoScale是否有效
      if (isNaN(autoScale) || !isFinite(autoScale)) {
        console.warn('自动缩放比例无效，使用默认值');
        autoScale = 1;
      }
      
      // 应用单位转换和自动缩放，但不进行任何偏移
      const finalScale = unitScale * autoScale;
      if (finalScale !== 1) {
        const transformedModel = applyWorldTransform(model2D, {
          scale: finalScale,
          offsetX: 0, // 不偏移，保持(0,0,0)对齐到场地锚点
          offsetY: 0
        });
        setModel2D(transformedModel);
        console.log('应用单位转换和缩放:', { 
          unitScale, 
          autoScale, 
          finalScale, 
          originalSize: { width: modelWidth, height: modelHeight },
          scaledSize: { width: scaledWidth, height: scaledHeight }
        });
      } else {
        setModel2D(model2D);
      }
      
      message.success(`OBJ模型加载成功: ${objModel.vertices.length}个顶点, ${objModel.faces.length}个面，已对齐到场地锚点`);
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
  }, []);

  const applyTransform = useCallback((transform: { scale: number; offsetX: number; offsetY: number; rotation?: number }) => {
    if (model2D) {
      const transformedModel = applyWorldTransform(model2D, transform);
      setModel2D(transformedModel);
    }
  }, [model2D]);

  return {
    model2D,
    renderOptions,
    isLoading,
    loadObjFile,
    updateRenderOptions,
    clearModel,
    applyTransform
  };
}
