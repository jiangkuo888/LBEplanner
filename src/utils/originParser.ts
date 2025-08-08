import { OriginInfo } from '../types';

/**
 * 解析原点信息文件内容
 * @param content 原点信息文件内容（JSON格式）
 * @returns 解析后的原点信息
 */
export function parseOriginFile(content: string): OriginInfo {
  try {
    const data = JSON.parse(content);
    
    // 验证必需字段
    const requiredFields = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'rw'];
    for (const field of requiredFields) {
      if (typeof data[field] !== 'number') {
        throw new Error(`缺少必需字段或字段类型错误: ${field}`);
      }
    }
    
    return {
      x: data.x,
      y: data.y,
      z: data.z,
      rx: data.rx,
      ry: data.ry,
      rz: data.rz,
      rw: data.rw
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('原点信息文件格式错误，请检查JSON格式');
    }
    throw error;
  }
}

/**
 * 将四元数转换为欧拉角（弧度）
 * @param originInfo 原点信息
 * @returns 欧拉角对象
 */
export function quaternionToEuler(originInfo: OriginInfo): { x: number; y: number; z: number } {
  const { rw, rx, ry, rz } = originInfo;
  
  // 四元数转欧拉角（ZYX顺序）
  const sinr_cosp = 2 * (rw * rx + ry * rz);
  const cosr_cosp = 1 - 2 * (rx * rx + ry * ry);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);
  
  const sinp = 2 * (rw * ry - rz * rx);
  let pitch;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2;
  } else {
    pitch = Math.asin(sinp);
  }
  
  const siny_cosp = 2 * (rw * rz + rx * ry);
  const cosy_cosp = 1 - 2 * (ry * ry + rz * rz);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  
  return { x: roll, y: pitch, z: yaw };
}

/**
 * 将欧拉角转换为度数
 * @param radians 弧度
 * @returns 度数
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * 将度数转换为弧度
 * @param degrees 度数
 * @returns 弧度
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
