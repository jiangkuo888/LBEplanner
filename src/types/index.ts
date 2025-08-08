// 3D顶点类型
export interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

// 2D顶点类型
export interface Vertex2D {
  x: number;
  y: number;
}

// 3D面类型
export interface Face3D {
  vertices: number[]; // 顶点索引
  normal?: Vertex3D;  // 法向量（可选）
}

// OBJ模型数据结构
export interface ObjModel {
  vertices: Vertex3D[];
  faces: Face3D[];
  name?: string;
  material?: string;
}

// 解析后的2D模型数据
export interface Model2D {
  vertices: Vertex2D[];
  faces: Face3D[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  center: Vertex2D;
}

// 世界坐标转换参数
export interface WorldTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

// 模型渲染选项
export interface ModelRenderOptions {
  visible: boolean;
  opacity: number;
  color: number;
  lineWidth: number;
  fillAlpha: number;
}

// 原点信息类型
export interface OriginInfo {
  x: number;      // 世界坐标系X位置
  y: number;      // 世界坐标系Y位置
  z: number;      // 世界坐标系Z位置
  rx: number;     // X轴旋转（弧度）
  ry: number;     // Y轴旋转（弧度）
  rz: number;     // Z轴旋转（弧度）
  rw: number;     // W分量（四元数）
}
