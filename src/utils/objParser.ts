import { Vertex3D, Face3D, ObjModel, Model2D, Vertex2D } from '../types';

/**
 * 解析OBJ文件内容
 * @param content OBJ文件内容
 * @returns 解析后的OBJ模型数据
 */
export function parseObjFile(content: string): ObjModel {
  const lines = content.split('\n');
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];
  let name = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const parts = trimmedLine.split(/\s+/);
    const type = parts[0];

    switch (type) {
      case 'o':
      case 'g':
        // 对象或组名
        name = parts.slice(1).join(' ');
        break;
      
      case 'v':
        // 顶点
        if (parts.length >= 4) {
          vertices.push({
            x: parseFloat(parts[1]),
            y: parseFloat(parts[2]),
            z: parseFloat(parts[3])
          });
        }
        break;
      
      case 'f':
        // 面
        if (parts.length >= 4) {
          const faceVertices: number[] = [];
          for (let i = 1; i < parts.length; i++) {
            // 处理 "v/vt/vn" 格式，只取顶点索引
            const vertexPart = parts[i].split('/')[0];
            const vertexIndex = parseInt(vertexPart) - 1; // OBJ索引从1开始
            if (!isNaN(vertexIndex) && vertexIndex >= 0) {
              faceVertices.push(vertexIndex);
            }
          }
          if (faceVertices.length >= 3) {
            faces.push({ vertices: faceVertices });
          }
        }
        break;
    }
  }

  return { vertices, faces, name };
}

/**
 * 将3D模型转换为2D模型（忽略Z轴）
 * @param objModel 3D OBJ模型
 * @returns 2D模型数据
 */
export function convert3DTo2D(objModel: ObjModel): Model2D {
  // 尝试不同的坐标轴映射
  const vertices2D: Vertex2D[] = objModel.vertices.map(vertex => {
    // 检查哪个轴有变化，选择变化最大的两个轴作为2D坐标
    const xRange = Math.abs(vertex.x);
    const yRange = Math.abs(vertex.y);
    const zRange = Math.abs(vertex.z);
    
    // 如果Y轴变化很小，尝试使用X和Z轴
    if (yRange < 0.1 && zRange > 0.1) {
      return {
        x: vertex.x,
        y: vertex.z
      };
    }
    // 如果Z轴变化很小，使用X和Y轴
    else if (zRange < 0.1) {
      return {
        x: vertex.x,
        y: vertex.y
      };
    }
    // 如果X轴变化很小，使用Y和Z轴
    else if (xRange < 0.1) {
      return {
        x: vertex.y,
        y: vertex.z
      };
    }
    // 默认使用X和Y轴
    else {
      return {
        x: vertex.x,
        y: vertex.y
      };
    }
  });

  // 计算边界
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const vertex of vertices2D) {
    // 检查顶点是否有效
    if (isNaN(vertex.x) || isNaN(vertex.y) || !isFinite(vertex.x) || !isFinite(vertex.y)) {
      console.warn('发现无效顶点:', vertex);
      continue;
    }
    
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
  }

  // 检查边界是否有效
  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    console.warn('模型边界计算失败，使用默认值');
    minX = -1; maxX = 1; minY = -1; maxY = 1;
  }

  const center: Vertex2D = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };

  console.log('坐标转换结果:', { 
    originalVertices: objModel.vertices.length,
    bounds: { minX, maxX, minY, maxY },
    center,
    width: maxX - minX,
    height: maxY - minY
  });

  return {
    vertices: vertices2D,
    faces: objModel.faces,
    bounds: { minX, maxX, minY, maxY },
    center
  };
}

/**
 * 应用世界坐标变换
 * @param model2D 2D模型数据
 * @param transform 变换参数
 * @returns 变换后的2D模型数据
 */
export function applyWorldTransform(
  model2D: Model2D, 
  transform: { scale: number; offsetX: number; offsetY: number; rotation?: number }
): Model2D {
  const { scale, offsetX, offsetY, rotation = 0 } = transform;
  
  // 应用变换
  const transformedVertices: Vertex2D[] = model2D.vertices.map(vertex => {
    let x = vertex.x * scale + offsetX;
    let y = vertex.y * scale + offsetY;
    
    // 应用旋转（如果需要）- 围绕(0,0,0)点进行旋转
    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      
      // 围绕(0,0,0)点进行旋转，而不是围绕模型中心点
      const centerX = offsetX; // 旋转中心是(0,0,0)点
      const centerY = offsetY;
      
      const dx = x - centerX;
      const dy = y - centerY;
      
      x = centerX + dx * cos - dy * sin;
      y = centerY + dx * sin + dy * cos;
    }
    
    return { x, y };
  });

  // 重新计算边界和中心
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const vertex of transformedVertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
  }

  const center: Vertex2D = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };

  return {
    vertices: transformedVertices,
    faces: model2D.faces,
    bounds: { minX, maxX, minY, maxY },
    center
  };
}
