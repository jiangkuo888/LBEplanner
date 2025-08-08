import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Layout, Button, Upload, Card, Divider, Typography, message, List, Checkbox, Switch, Modal } from 'antd';
import { UploadOutlined, DownloadOutlined, RedoOutlined, PlusOutlined, MinusOutlined, ExpandOutlined, PictureOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import 'antd/dist/reset.css';
import Sidebar from './components/Sidebar';
import CanvasView from './components/CanvasView';
import RightSider from './components/RightSider';
import BlockList from './components/BlockList';
import { BlockDetailContent } from './components/BlockDetail';
import { useObjModel } from './hooks/useObjModel';
import { OriginInfo } from './types';
import { parseOriginFile, quaternionToEuler, radiansToDegrees } from './utils/originParser';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

interface Point {
  X: number;
  Y: number;
}

interface BlockData {
  Name: string;
  Index: number;
  Points: { Point: Point }[];
  Entrance: { Point: Point };
  Exit: { Point: Point };
  DeltaYaw: number;
  BlockRotateZAxisValue?: number;
  bShouldRotate?: boolean;
}

const COLORS = [
  0x4fc3f7, 0xffb74d, 0x81c784, 0xe57373, 0xba68c8, 0xa1887f, 0x90a4ae, 0xf06292, 0xffd54f, 0x64b5f6
];

const App: React.FC = () => {
  const pixiContainer = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  // jsonData类型由BlockData[]改为any[]，以兼容合并后的动态字段
  const [jsonData, setJsonData] = useState<any[]>([]);
  const blocksLayer = useRef<PIXI.Container | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  const dragInfo = useRef<{ blockIndex: number; offset: { x: number; y: number } } | null>(null);
  // 新增：拖动阈值相关
  const dragStartRef = useRef<{ x: number; y: number; blockIndex: number | null }>({ x: 0, y: 0, blockIndex: null });
  const dragStartedRef = useRef<boolean>(false);
  const DRAG_THRESHOLD = 5; // px
  const [viewTransform, setViewTransform] = useState<{ scale: number; offsetX: number; offsetY: number }>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const rotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rotateDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRDownRef = useRef(false);
  const [moveSingleBlock, setMoveSingleBlock] = useState(false);
  const [showEntrance, setShowEntrance] = useState(false); // 默认隐藏入口
  const [showExit, setShowExit] = useState(false); // 默认隐藏出口
  // 新增：场地参考图状态
  const [backgroundImage, setBackgroundImage] = useState<{ texture: PIXI.Texture | null, x: number, y: number, scale: number, rotation: number } | null>(null);
  const [bgImgDragging, setBgImgDragging] = useState(false);
  const [bgImgDragOffset, setBgImgDragOffset] = useState<{ x: number, y: number } | null>(null);
  const [bgImgSelected, setBgImgSelected] = useState(false);
  const [bgImgPoints, setBgImgPoints] = useState<{x: number, y: number}[]>([]);
  const [enableBgImgPoint, setEnableBgImgPoint] = useState(false); // 场地图打点功能toggle
  // 记录导入的场地图片文件名
  const [bgImgFileName, setBgImgFileName] = useState<string>('场地图点位.json');
  const [helpVisible, setHelpVisible] = useState(false);
  const [blockDetailData, setBlockDetailData] = useState<any[]>([]);
  const [rawBlockData, setRawBlockData] = useState<BlockData[]>([]); // 原始playarea数据
  // 新增：调节内容转向模式
  const [enableBlockRotate, setEnableBlockRotate] = useState(false);
  // 修复：用ref同步enableBlockRotate，保证setJsonData回调里拿到最新值
  const enableBlockRotateRef = useRef(enableBlockRotate);
  useEffect(() => { enableBlockRotateRef.current = enableBlockRotate; }, [enableBlockRotate]);
  // 新增：需要更新的动块index列表
  const [needUpdateIndices, setNeedUpdateIndices] = useState<number[]>([]);
  // 修复：用ref同步needUpdateIndices，保证setJsonData回调里拿到最新值
  const needUpdateIndicesRef = useRef(needUpdateIndices);
  useEffect(() => { needUpdateIndicesRef.current = needUpdateIndices; }, [needUpdateIndices]);
  
  // 新增：OBJ模型管理
  const {
    model2D,
    renderOptions: modelRenderOptions,
    isLoading: modelLoading,
    loadObjFile,
    updateRenderOptions: updateModelRenderOptions,
    clearModel,
    applyTransform: applyModelTransform
  } = useObjModel();
  
  // 新增：原点信息管理
  const [originInfo, setOriginInfo] = useState<OriginInfo | null>(null);
  
  // 1. 定义快照结构和撤销/重做栈
  interface EditorSnapshot {
    jsonData: any[];
    bgImgPoints: {x: number, y: number}[];
    backgroundImage: { x: number; y: number; scale: number; rotation: number } | null;
  }
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [blockTooltip, setBlockTooltip] = useState<{ visible: boolean; x: number; y: number; block: any | null }>({ visible: false, x: 0, y: 0, block: null });
  const blockTooltipTimer = useRef<NodeJS.Timeout | null>(null);
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);

  // 2. 深拷贝工具
  function deepClone(obj: any) {
    return JSON.parse(JSON.stringify(obj));
  }
  // 3. pushUndo 工具函数
  function pushUndo() {
    const current = JSON.stringify(jsonData);
    const lastSnap = undoStack.length > 0 ? JSON.stringify(undoStack[undoStack.length - 1].jsonData) : null;
    if (!Array.isArray(jsonData) || jsonData.length === 0) return;
    if (current === lastSnap) return; // 只有数据变化时才 push
    // 只保存可序列化字段
    const safeBgImg = backgroundImage
      ? {
          x: backgroundImage.x,
          y: backgroundImage.y,
          scale: backgroundImage.scale,
          rotation: backgroundImage.rotation,
          // texture: null // 不保存 texture
        }
      : null;
    const snap = {
      jsonData: deepClone(jsonData),
      bgImgPoints: deepClone(bgImgPoints),
      backgroundImage: safeBgImg,
    };
    console.log('pushUndo 快照:', JSON.stringify(snap));
    setUndoStack(stack => [...stack, snap]);
    setRedoStack([]);
  }

  // 多选逻辑
  const handleSelectBlock = (index: number, checked: boolean) => {
    setSelectedIndices(prev => {
      if (checked) return [...prev, index];
      return prev.filter(i => i !== index);
    });
  };

  // 监听shift键状态
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 单击画布动块时同步多选，支持shift批量和toggle
  const handleCanvasSelect = (index: number) => {
    setSelectedIndices(prev => {
      if (isShiftDown) {
        if (prev.includes(index)) return prev;
        return [...prev, index];
      } else {
        if (enableBlockRotateRef.current) {
          // 调节内容转向开关开启时，选中index及其之后所有动块
          const indices = jsonData.filter(b => b.Index >= index).map(b => b.Index);
          return indices;
        }
        if (moveSingleBlock) {
          if (prev.length > 1 && prev.includes(index)) {
            return prev;
          } else {
            return [index];
          }
        } else {
          // 选中该幕的所有动块
          const block = jsonData.find(b => b.Index === index);
          if (!block) return prev;
          const scene = (block.Name || '').split('-')[0];
          const indices = jsonData.filter(b => (b.Name || '').split('-')[0] === scene).map(b => b.Index);
          return indices;
        }
      }
    });
  };

  // 只在导入JSON后适配一次包围盒
  const fitViewToBlocks = (blocks: BlockData[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    blocks.forEach(block => {
      block.Points.forEach(p => {
        minX = Math.min(minX, p.Point.X);
        minY = Math.min(minY, p.Point.Y);
        maxX = Math.max(maxX, p.Point.X);
        maxY = Math.max(maxY, p.Point.Y);
      });
      minX = Math.min(minX, block.Entrance.Point.X, block.Exit.Point.X);
      minY = Math.min(minY, block.Entrance.Point.Y, block.Exit.Point.Y);
      maxX = Math.max(maxX, block.Entrance.Point.X, block.Exit.Point.X);
      maxY = Math.max(maxY, block.Entrance.Point.Y, block.Exit.Point.Y);
    });
    const container = pixiContainer.current;
    const canvas = appRef.current?.view as HTMLCanvasElement;
    const canvasWidth = container?.clientWidth || 1200;
    const canvasHeight = container?.clientHeight || 800;
    let scale = 1;
    let offsetX = 0, offsetY = 0;
    if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      const bboxWidth = maxX - minX;
      const bboxHeight = maxY - minY;
      const margin = 0.1;
      const scaleX = (canvasWidth * (1 - margin * 2)) / (bboxWidth || 1);
      const scaleY = (canvasHeight * (1 - margin * 2)) / (bboxHeight || 1);
      scale = Math.min(scaleX, scaleY);
      const contentWidth = bboxWidth * scale;
      const contentHeight = bboxHeight * scale;
      offsetX = (canvasWidth - contentWidth) / 2 - minX * scale;
      offsetY = (canvasHeight - contentHeight) / 2 - minY * scale;
    }
    setViewTransform({ scale, offsetX, offsetY });
  };

  useEffect(() => {
    let app: PIXI.Application;
    const canvas = document.createElement('canvas');
    // 动态获取容器宽高
    const container = pixiContainer.current;
    const getSize = () => {
      return {
        width: container?.clientWidth || window.innerWidth,
        height: container?.clientHeight || window.innerHeight
      };
    };
    const { width, height } = getSize();
    app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x222222,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    });
    appRef.current = app;
    app.stage.interactive = true;
    if (container) {
      container.appendChild(app.view as unknown as Node);
    }
    blocksLayer.current = new PIXI.Container();
    blocksLayer.current.interactive = true;
    app.stage.addChild(blocksLayer.current as unknown as PIXI.DisplayObject);
    setPixiReady(true);
    // 画布中心点正好是(0,0)
    setViewTransform({ scale: 1, offsetX: width / 2, offsetY: height / 2 });
    // 监听窗口resize
    const handleResize = () => {
      const { width, height } = getSize();
      app.renderer.resize(width, height);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      if (app) {
        app.destroy(true, { children: true });
      }
      if (container) {
        container.innerHTML = '';
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    console.log('PixiJS 渲染 useEffect 触发，jsonData:', jsonData);
    if (!pixiReady) return;
    const layer = blocksLayer.current;
    if (!layer) return;
    layer.removeChildren();
    const { scale, offsetX, offsetY } = viewTransform;
    
    // 新增：渲染OBJ模型
    if (model2D && modelRenderOptions && modelRenderOptions.visible) {
      const graphics = new PIXI.Graphics();
      const { color, lineWidth, fillAlpha, opacity } = modelRenderOptions;
      
      // 设置透明度
      graphics.alpha = opacity;
      
      // 计算模型的边界和缩放
      const modelWidth = model2D.bounds.maxX - model2D.bounds.minX;
      const modelHeight = model2D.bounds.maxY - model2D.bounds.minY;
      const modelCenterX = model2D.center.x;
      const modelCenterY = model2D.center.y;
      
      // 计算模型在画布中的位置
      const canvasCenterX = modelCenterX * scale + offsetX;
      const canvasCenterY = modelCenterY * scale + offsetY;
      
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
      
      // 添加到图层
      layer.addChild(graphics as unknown as PIXI.DisplayObject);
      
      // 添加边长标注 - 只标注最外层边界的边长
      const edgeLabels: PIXI.Text[] = [];
      const processedEdges = new Map<string, {
        v1: { x: number; y: number };
        v2: { x: number; y: number };
        length: number;
        count: number;
      }>();
      
      // 第一步：收集所有边并统计出现次数
      for (const face of model2D.faces) {
        if (face.vertices.length < 3) continue;
        
        for (let i = 0; i < face.vertices.length; i++) {
          const currentIndex = face.vertices[i];
          const nextIndex = face.vertices[(i + 1) % face.vertices.length];
          
          const currentVertex = model2D.vertices[currentIndex];
          const nextVertex = model2D.vertices[nextIndex];
          
          if (!currentVertex || !nextVertex) continue;
          
          // 使用坐标创建边的唯一标识符（四舍五入到小数点后3位）
          const v1x = Math.round(currentVertex.x * 1000) / 1000;
          const v1y = Math.round(currentVertex.y * 1000) / 1000;
          const v2x = Math.round(nextVertex.x * 1000) / 1000;
          const v2y = Math.round(nextVertex.y * 1000) / 1000;
          
          // 创建边的唯一标识符（按坐标排序）
          const edgeKey = v1x < v2x || (v1x === v2x && v1y < v2y) 
            ? `${v1x},${v1y}-${v2x},${v2y}`
            : `${v2x},${v2y}-${v1x},${v1y}`;
          
          // 计算边的世界坐标长度（米）
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
      
      // 第二步：只标注外边界的长边（出现次数为1的边，且长度大于1米）
      for (const [edgeKey, edge] of Array.from(processedEdges.entries())) {
        // 只标注外边界（出现次数为1）且长度大于1米的边
        if (edge.count === 1 && edge.length > 1) {
          // 计算边的中点位置
          const midX = (edge.v1.x + edge.v2.x) / 2 * scale + offsetX;
          const midY = (edge.v1.y + edge.v2.y) / 2 * scale + offsetY;
          
          // 创建标注文本
          const labelText = `${edge.length.toFixed(1)}m`;
          const label = new PIXI.Text(labelText, {
            fontSize: 12,
            fill: 0xffffff,
            fontWeight: 'bold',
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 2
          });
          
          label.anchor.set(0.5);
          label.x = midX;
          label.y = midY - 8; // 稍微向上偏移，避免遮挡边线
          
          edgeLabels.push(label);
          layer.addChild(label as unknown as PIXI.DisplayObject);
        }
      }
      
      console.log('OBJ模型已渲染:', { 
        面数: model2D.faces.length, 
        顶点数: model2D.vertices.length, 
        尺寸: { width: modelWidth, height: modelHeight },
        总边数: processedEdges.size,
        外边界边数: Array.from(processedEdges.values()).filter(edge => edge.count === 1).length,
        标注数量: edgeLabels.length
      });
    } else {
      console.log('OBJ模型未渲染:', { model2D: !!model2D, modelRenderOptions: !!modelRenderOptions, visible: modelRenderOptions?.visible });
    }
    
    // 新增：渲染原点信息
    if (originInfo) {
      // 原点位置（世界坐标）
      const originX = originInfo.x * scale + offsetX;
      const originY = originInfo.y * scale + offsetY;
      
      // 绘制原点标记（红色十字）
      const originCrossLen = 40;
      const originCrossColor = 0xff0000; // 红色
      const originCrossThickness = 6;
      
      const originCross = new PIXI.Graphics();
      originCross.lineStyle(originCrossThickness, originCrossColor, 1)
        .moveTo(originX - originCrossLen, originY)
        .lineTo(originX + originCrossLen, originY)
        .moveTo(originX, originY - originCrossLen)
        .lineTo(originX, originY + originCrossLen);
      layer.addChild(originCross as unknown as PIXI.DisplayObject);
      
      // 绘制原点圆圈
      const originCircle = new PIXI.Graphics();
      originCircle.lineStyle(4, originCrossColor, 1)
        .beginFill(originCrossColor, 0.3)
        .drawCircle(originX, originY, 20)
        .endFill();
      layer.addChild(originCircle as unknown as PIXI.DisplayObject);
      
      // 绘制原点标签
      const originText = new PIXI.Text('原点', {
        fontSize: 24,
        fill: originCrossColor,
        fontWeight: 'bold',
        align: 'center',
        stroke: 0x000000,
        strokeThickness: 4
      });
      originText.anchor.set(0.5);
      originText.x = originX;
      originText.y = originY - originCrossLen - 25;
      layer.addChild(originText as unknown as PIXI.DisplayObject);
      
      // 绘制原点坐标信息
      const coordText = new PIXI.Text(`(${originInfo.x.toFixed(2)}, ${originInfo.y.toFixed(2)}, ${originInfo.z.toFixed(2)})`, {
        fontSize: 16,
        fill: originCrossColor,
        fontWeight: 'bold',
        align: 'center',
        stroke: 0x000000,
        strokeThickness: 2
      });
      coordText.anchor.set(0.5);
      coordText.x = originX;
      coordText.y = originY + originCrossLen + 25;
      layer.addChild(coordText as unknown as PIXI.DisplayObject);
      
      // 绘制旋转信息（如果旋转不为0）
      if (originInfo.rx !== 0 || originInfo.ry !== 0 || originInfo.rz !== 0) {
        const euler = quaternionToEuler(originInfo);
        const eulerDegrees = {
          x: radiansToDegrees(euler.x),
          y: radiansToDegrees(euler.y),
          z: radiansToDegrees(euler.z)
        };
        
        const rotationText = new PIXI.Text(`旋转: (${eulerDegrees.x.toFixed(1)}°, ${eulerDegrees.y.toFixed(1)}°, ${eulerDegrees.z.toFixed(1)}°)`, {
          fontSize: 14,
          fill: originCrossColor,
          fontWeight: 'bold',
          align: 'center',
          stroke: 0x000000,
          strokeThickness: 2
        });
        rotationText.anchor.set(0.5);
        rotationText.x = originX;
        rotationText.y = originY + originCrossLen + 45;
        layer.addChild(rotationText as unknown as PIXI.DisplayObject);
      }
      
      console.log('原点信息已渲染:', { 
        位置: { x: originInfo.x, y: originInfo.y, z: originInfo.z },
        旋转: { rx: originInfo.rx, ry: originInfo.ry, rz: originInfo.rz, rw: originInfo.rw },
        画布坐标: { x: originX, y: originY }
      });
    }
    
    // 新增：渲染场地参考图
    if (backgroundImage && backgroundImage.texture) {
      const sprite = new PIXI.Sprite(backgroundImage.texture);
      sprite.anchor.set(0.5);
      // 检查图片渲染，确保scale叠加viewTransform
      sprite.x = backgroundImage.x * scale + offsetX;
      sprite.y = backgroundImage.y * scale + offsetY;
      sprite.scale.set(backgroundImage.scale * scale, backgroundImage.scale * scale);
      sprite.rotation = backgroundImage.rotation;
      sprite.alpha = enableBgImgPoint ? 0.3 : 0.05;
      // 判断点位是否闭合
      let isClosed = false;
      if (bgImgPoints.length > 1) {
        const first = bgImgPoints[0];
        const last = bgImgPoints[bgImgPoints.length - 1];
        if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
          isClosed = true;
        }
      }
      sprite.interactive = !!enableBgImgPoint;
      sprite.cursor = enableBgImgPoint ? (bgImgSelected ? 'move' : 'pointer') : 'default';
      if (enableBgImgPoint) {
        sprite.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
          if (!isClosed && enableBgImgPoint && event.button === 0) {
            // 允许直接打点（不需要bgImgSelected为true）
            const globalX = (event.global.x - offsetX) / scale;
            const globalY = (event.global.y - offsetY) / scale;
            const dx = globalX - backgroundImage.x;
            const dy = globalY - backgroundImage.y;
            const r = -backgroundImage.rotation;
            const sx = 1 / backgroundImage.scale;
            const localX = (dx * Math.cos(r) - dy * Math.sin(r)) * sx;
            const localY = (dx * Math.sin(r) + dy * Math.cos(r)) * sx;
            setBgImgPoints(prev => {
              if (prev.length > 1) {
                const first = prev[0];
                const last = prev[prev.length - 1];
                if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
                  return prev;
                }
              }
              if (prev.length > 0) {
                const first = prev[0];
                const dist = Math.sqrt(Math.pow(localX - first.x, 2) + Math.pow(localY - first.y, 2));
                if (dist < 10) {
                  return [...prev, { x: first.x, y: first.y }];
                }
              }
              return [...prev, { x: localX, y: localY }];
            });
          } else if (isClosed && event.button === 0) {
            // 已闭合，允许选中并拖拽图片
            setBgImgSelected(true);
            setBgImgDragging(true);
            // 修正：统一pointerdown和pointermove的坐标系
            const container = pixiContainer.current;
            const rect = container?.getBoundingClientRect();
            const origEvt = event.data && (event.data.originalEvent as unknown as MouseEvent | PointerEvent);
            const mx = (origEvt ? origEvt.clientX : 0) - (rect?.left ?? 0) - offsetX;
            const my = (origEvt ? origEvt.clientY : 0) - (rect?.top ?? 0) - offsetY;
            const mxWorld = mx / scale;
            const myWorld = my / scale;
            setBgImgDragOffset({
              x: mxWorld - backgroundImage.x,
              y: myWorld - backgroundImage.y,
            });
          }
        });
      }
      layer.addChild(sprite as unknown as PIXI.DisplayObject);
      // 高亮描边：选中且已闭合时
      if (bgImgSelected && isClosed) {
        // 计算图片四个角的画布坐标
        const w = backgroundImage.texture.width * backgroundImage.scale;
        const h = backgroundImage.texture.height * backgroundImage.scale;
        const corners = [
          { x: -w / 2, y: -h / 2 },
          { x:  w / 2, y: -h / 2 },
          { x:  w / 2, y:  h / 2 },
          { x: -w / 2, y:  h / 2 }
        ];
        const pts = corners.map(pt => {
          // 图片自身旋转
          const rx = pt.x * Math.cos(backgroundImage.rotation) - pt.y * Math.sin(backgroundImage.rotation);
          const ry = pt.x * Math.sin(backgroundImage.rotation) + pt.y * Math.cos(backgroundImage.rotation);
          // 图片自身平移
          const wx = backgroundImage.x + rx;
          const wy = backgroundImage.y + ry;
          // 画布viewTransform
          return {
            x: wx * scale + offsetX,
            y: wy * scale + offsetY
          };
        });
        const border = new PIXI.Graphics();
        border.lineStyle(6, 0xffeb3b, 0.8)
          .moveTo(pts[0].x, pts[0].y)
          .lineTo(pts[1].x, pts[1].y)
          .lineTo(pts[2].x, pts[2].y)
          .lineTo(pts[3].x, pts[3].y)
          .closePath();
        layer.addChild(border as unknown as PIXI.DisplayObject);
      }
      // 渲染打点和连线
      if (bgImgPoints.length > 0) {
        // 画线
        for (let i = 1; i < bgImgPoints.length; i++) {
          const p1 = bgImgPoints[i - 1];
          const p2 = bgImgPoints[i];
          // 变换到图片世界坐标（只受图片自身scale/rotation/position影响，不含viewTransform）
          const toWorld = (pt: {x: number, y: number}) => {
            const sx = pt.x * backgroundImage.scale;
            const sy = pt.y * backgroundImage.scale;
            const rx = sx * Math.cos(backgroundImage.rotation) - sy * Math.sin(backgroundImage.rotation);
            const ry = sx * Math.sin(backgroundImage.rotation) + sy * Math.cos(backgroundImage.rotation);
            return {
              x: backgroundImage.x + rx,
              y: backgroundImage.y + ry,
            };
          };
          // 画布坐标（叠加viewTransform）
          const toCanvas = (pt: {x: number, y: number}) => ({
            x: pt.x * scale + offsetX,
            y: pt.y * scale + offsetY,
          });
          const w1 = toWorld(p1);
          const w2 = toWorld(p2);
          const c1 = toCanvas(w1);
          const c2 = toCanvas(w2);
          const line = new PIXI.Graphics();
          line.lineStyle(3, 0x00bcd4, 0.8)
            .moveTo(c1.x, c1.y)
            .lineTo(c2.x, c2.y);
          layer.addChild(line as unknown as PIXI.DisplayObject);
          // 距离（只用图片世界坐标，不含viewTransform）
          const dist = Math.sqrt(Math.pow(w2.x - w1.x, 2) + Math.pow(w2.y - w1.y, 2));
          const mid = { x: (w1.x + w2.x) / 2, y: (w1.y + w2.y) / 2 };
          const cmid = toCanvas(mid);
          const distText = new PIXI.Text(dist.toFixed(2), {
            fontSize: 18,
            fill: 0xffeb3b,
            fontWeight: 'bold',
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 4
          });
          distText.anchor.set(0.5, 1);
          distText.x = cmid.x;
          distText.y = cmid.y - 10;
          layer.addChild(distText as unknown as PIXI.DisplayObject);
        }
        // 画点
        for (let i = 0; i < bgImgPoints.length; i++) {
          const pt = bgImgPoints[i];
          // 变换到图片世界坐标
          const sx = pt.x * backgroundImage.scale;
          const sy = pt.y * backgroundImage.scale;
          const rx = sx * Math.cos(backgroundImage.rotation) - sy * Math.sin(backgroundImage.rotation);
          const ry = sx * Math.sin(backgroundImage.rotation) + sy * Math.cos(backgroundImage.rotation);
          const wx = backgroundImage.x + rx;
          const wy = backgroundImage.y + ry;
          // 画布坐标
          const cx = wx * scale + offsetX;
          const cy = wy * scale + offsetY;
          const g = new PIXI.Graphics();
          g.beginFill(0xff1744, 1).drawCircle(cx, cy, 8).endFill();
          // 新增：第一个点可点击闭合
          if (i === 0 && !isClosed && enableBgImgPoint) {
            g.interactive = true;
            (g as any).buttonMode = true;
            g.on('pointerdown', () => {
              if (bgImgPoints.length > 2) {
                setBgImgPoints(prev => {
                  const first = prev[0];
                  const last = prev[prev.length - 1];
                  if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) return prev;
                  return [...prev, { x: first.x, y: first.y }];
                });
              }
            });
          }
          layer.addChild(g as unknown as PIXI.DisplayObject);
        }
      }
    }
    // 计算所有动块的幕号到颜色的映射，并校验Name格式
    const sceneColorMap: Record<string, number> = {};
    let sceneList: string[] = [];
    jsonData.forEach(block => {
      const nameParts = (block.Name || '').split('-');
      // 允许Name为任意字符串，首段用于分组
      const scene = nameParts[0];
      if (!sceneList.includes(scene)) sceneList.push(scene);
    });
    sceneList.forEach((scene, idx) => {
      sceneColorMap[scene] = COLORS[idx % COLORS.length];
    });
    // 新增：如果当前选中的是同一幕的所有动块，则在这些动块的中心点绘制幕名
    if (selectedIndices.length > 0) {
      // 获取选中动块的幕号
      const selectedBlocks = jsonData.filter(b => selectedIndices.includes(b.Index));
      const selectedScene = selectedBlocks.length > 0 ? (selectedBlocks[0].Name || '').split('-')[0] : null;
      const allSameScene = selectedBlocks.every(b => (b.Name || '').split('-')[0] === selectedScene);
      // 幕内所有动块都被选中才显示
      const allSceneIndices = jsonData.filter(b => (b.Name || '').split('-')[0] === selectedScene).map(b => b.Index);
      const allSceneSelected = allSceneIndices.length > 0 && allSceneIndices.every(idx => selectedIndices.includes(idx)) && selectedIndices.length === allSceneIndices.length;
      if (allSameScene && allSceneSelected) {
        // 计算所有选中动块所有点的中心点
        let allPoints: { x: number, y: number }[] = [];
        selectedBlocks.forEach((b: any) => {
          b.Points.forEach((p: any) => allPoints.push({ x: p.Point.X, y: p.Point.Y }));
        });
        if (allPoints.length > 0) {
          const centerX = allPoints.reduce((sum: number, p: any) => sum + p.x, 0) / allPoints.length;
          const centerY = allPoints.reduce((sum: number, p: any) => sum + p.y, 0) / allPoints.length;
          const sceneText = new PIXI.Text(selectedScene || '', {
            fontSize: 96,
            fill: 0xffeb3b,
            fontWeight: 'bold',
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 6
          });
          sceneText.anchor.set(0.5);
          sceneText.x = centerX * scale + offsetX;
          sceneText.y = centerY * scale + offsetY;
          layer.addChild(sceneText as unknown as PIXI.DisplayObject);
        }
        // 新增：为每个动块中心点上方绘制该动块的名字
        selectedBlocks.forEach((b: any) => {
          // 计算动块中心点
          const points = b.Points.map((p: any) => [p.Point.X, p.Point.Y]).flat();
          let centerX = 0, centerY = 0;
          points.forEach((v: any, idx: any) => {
            if (idx % 2 === 0) centerX += v;
            else centerY += v;
          });
          centerX /= b.Points.length;
          centerY /= b.Points.length;
          const nameText = new PIXI.Text(b.Name || '', {
            fontSize: 32,
            fill: 0xffffff,
            fontWeight: 'bold',
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 4
          });
          nameText.anchor.set(0.5, 1);
          nameText.x = centerX * scale + offsetX;
          nameText.y = centerY * scale + offsetY - 40; // 上方偏移
          layer.addChild(nameText as unknown as PIXI.DisplayObject);
        });
      }
    }
    jsonData.forEach((block, i) => {
      const points = block.Points.map((p: any) => [p.Point.X, p.Point.Y]).flat();
      let centerX = 0, centerY = 0;
      points.forEach((v: any, idx: any) => {
        if (idx % 2 === 0) centerX += v;
        else centerY += v;
      });
      centerX /= block.Points.length;
      centerY /= block.Points.length;
      // 移除DeltaYaw旋转逻辑，直接使用原始点
      const rotated = block.Points.map((p: any) => ({
        x: p.Point.X * scale + offsetX,
        y: p.Point.Y * scale + offsetY,
      }));
      const poly = new PIXI.Graphics();
      const isSelected = selectedIndices.includes(block.Index);
      poly.interactive = true;
      (poly as any).buttonMode = true;
      const scene = (block.Name || '').split('-')[0];
      const color = sceneColorMap[scene] || COLORS[i % COLORS.length];
      poly.lineStyle(isSelected ? 5 : 2, isSelected ? 0xffeb3b : 0xffffff, 0.9)
        .beginFill(color, isSelected ? 0.35 : 0.2)
        .moveTo(rotated[0].x, rotated[0].y);
      rotated.forEach((pt: any, idx: any) => {
        if (idx > 0) poly.lineTo(pt.x, pt.y);
      });
      poly.closePath().endFill();
      poly.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        // 记录初始坐标和blockIndex
        const mx = (event.global.x - offsetX) / scale;
        const my = (event.global.y - offsetY) / scale;
        dragStartRef.current = { x: event.global.x, y: event.global.y, blockIndex: block.Index };
        dragStartedRef.current = false;
        // 只在pointerup时处理选中
      });
      // 新增：hover显示tooltip
      poly.on('pointerover', (event: PIXI.FederatedPointerEvent) => {
        setHoveredBlockIndex(block.Index);
        const container = pixiContainer.current;
        const rect = container?.getBoundingClientRect();
        const clientX = rect ? rect.left + event.data.global.x : event.data.global.x;
        const clientY = rect ? rect.top + event.data.global.y : event.data.global.y;
        setBlockTooltip(prev => ({ ...prev, x: clientX, y: clientY }));
      });
      poly.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
        if (blockTooltip.visible && blockTooltip.block?.Index === block.Index) {
          const container = pixiContainer.current;
          const rect = container?.getBoundingClientRect();
          const clientX = rect ? rect.left + event.data.global.x : event.data.global.x;
          const clientY = rect ? rect.top + event.data.global.y : event.data.global.y;
          setBlockTooltip(prev => ({ ...prev, x: clientX, y: clientY }));
        }
      });
      poly.on('pointerout', () => {
        setHoveredBlockIndex(null);
        if (blockTooltipTimer.current) {
          clearTimeout(blockTooltipTimer.current);
          blockTooltipTimer.current = null;
        }
        setBlockTooltip({ visible: false, x: 0, y: 0, block: null });
      });
      layer.addChild(poly as unknown as PIXI.DisplayObject);
      const drawPoint = (pt: Point, color: number, label: string) => {
        const g = new PIXI.Graphics();
        g.beginFill(color, 1).drawCircle(pt.X * scale + offsetX, pt.Y * scale + offsetY, 10).endFill();
        layer.addChild(g as unknown as PIXI.DisplayObject);
        const t = new PIXI.Text(label, { fontSize: 14, fill: color, fontWeight: 'bold', align: 'center' });
        t.anchor.set(0.5);
        t.x = pt.X * scale + offsetX;
        t.y = pt.Y * scale + offsetY - 18;
        layer.addChild(t as unknown as PIXI.DisplayObject);
      };
      if (showEntrance) drawPoint(block.Entrance.Point, 0x00e676, '入口');
      if (showExit) drawPoint(block.Exit.Point, 0xff1744, '出口');
      // 在动块中心点显示BlockRotateZAxisValue
      if (block.BlockRotateZAxisValue !== undefined) {
        const valueText = new PIXI.Text(String(block.BlockRotateZAxisValue), {
          fontSize: 18,
          fill: 0xffffff,
          fontWeight: 'bold',
          align: 'center',
          stroke: 0x000000,
          strokeThickness: 4
        });
        valueText.anchor.set(0.5);
        valueText.x = centerX * scale + offsetX;
        valueText.y = centerY * scale + offsetY;
        layer.addChild(valueText as unknown as PIXI.DisplayObject);
      }
    });
    // 在画布中心(0,0)绘制十字和标签，确保在最上层
    const crossLen = 15; // 从30缩小到15
    const crossColor = 0xff1744; // 红色
    const crossThickness = 3; // 从5缩小到3
    const zeroX = 0 * scale + offsetX;
    const zeroY = 0 * scale + offsetY;
    const cross = new PIXI.Graphics();
    cross.lineStyle(crossThickness, crossColor, 1)
      .moveTo(zeroX - crossLen, zeroY)
      .lineTo(zeroX + crossLen, zeroY)
      .moveTo(zeroX, zeroY - crossLen)
      .lineTo(zeroX, zeroY + crossLen);
    layer.addChild(cross as unknown as PIXI.DisplayObject);
    
    // 在十字下方绘制箭头表示场地正方向
    const arrowSize = 8; // 从15缩小到8
    const arrowY = zeroY + crossLen + 5; // 从10缩小到5
    const arrow = new PIXI.Graphics();
    arrow.lineStyle(crossThickness, crossColor, 1)
      .beginFill(crossColor, 1)
      .moveTo(zeroX, arrowY + arrowSize) // 箭头尖端（朝下）
      .lineTo(zeroX - arrowSize/2, arrowY) // 箭头左翼
      .lineTo(zeroX + arrowSize/2, arrowY) // 箭头右翼
      .closePath()
      .endFill();
    layer.addChild(arrow as unknown as PIXI.DisplayObject);
    
    const centerText = new PIXI.Text('场地锚点', {
      fontSize: 20,
      fill: crossColor,
      fontWeight: 'bold',
      align: 'center',
      stroke: 0x000000,
      strokeThickness: 4
    });
    centerText.anchor.set(0.5);
    centerText.x = zeroX;
    centerText.y = zeroY - crossLen - 18;
    layer.addChild(centerText as unknown as PIXI.DisplayObject);
    // 先绘制网格（在所有动块和锚点下方）
    const grid = new PIXI.Graphics();
    const gridSpacing = 100; // 100cm
    const gridColor = 0x888888;
    const gridAlpha = 0.3;
    const mainAxisColor = 0xaaaaaa;
    const mainAxisThickness = 2;
    const gridThickness = 1;
    // 画布像素范围
    const container = pixiContainer.current;
    const canvas = appRef.current?.view as HTMLCanvasElement;
    const canvasWidth = container?.clientWidth || 1200;
    const canvasHeight = container?.clientHeight || 800;
    // 画布世界坐标范围
    const worldLeft = (-offsetX) / scale;
    const worldRight = (canvasWidth - offsetX) / scale;
    const worldTop = (-offsetY) / scale;
    const worldBottom = (canvasHeight - offsetY) / scale;
    // 以0为中心，向两侧画格线
    const minX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
    const maxX = Math.ceil(worldRight / gridSpacing) * gridSpacing;
    const minY = Math.floor(worldTop / gridSpacing) * gridSpacing;
    const maxY = Math.ceil(worldBottom / gridSpacing) * gridSpacing;
    // 竖线
    for (let x = minX; x <= maxX; x += gridSpacing) {
      const px = x * scale + offsetX;
      grid.lineStyle(x === 0 ? mainAxisThickness : gridThickness, x === 0 ? mainAxisColor : gridColor, gridAlpha)
        .moveTo(px, 0)
        .lineTo(px, canvasHeight);
    }
    // 横线
    for (let y = minY; y <= maxY; y += gridSpacing) {
      const py = y * scale + offsetY;
      grid.lineStyle(y === 0 ? mainAxisThickness : gridThickness, y === 0 ? mainAxisColor : gridColor, gridAlpha)
        .moveTo(0, py)
        .lineTo(canvasWidth, py);
    }
    layer.addChild(grid as unknown as PIXI.DisplayObject);
    const app = appRef.current;
    if (!app) return;
    const handlePointerMove = (event: PIXI.FederatedPointerEvent) => {
      // 拖动阈值判断
      if (dragStartRef.current.blockIndex !== null && !dragStartedRef.current) {
        const dx = event.global.x - dragStartRef.current.x;
        const dy = event.global.y - dragStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          dragStartedRef.current = true;
          // 只在拖拽真正开始时 pushUndo 一次
          pushUndo();
          const mx = (event.global.x - offsetX) / scale;
          const my = (event.global.y - offsetY) / scale;
          dragInfo.current = {
            blockIndex: dragStartRef.current.blockIndex,
            offset: { x: mx, y: my }
          };
          
        }
      }
      if (!dragInfo.current) return;
      const { blockIndex, offset } = dragInfo.current;
      // 多选拖拽：所有选中动块一起移动
      const indices = selectedIndices.length > 0 ? selectedIndices : [blockIndex];
      const mx = (event.global.x - offsetX) / scale;
      const my = (event.global.y - offsetY) / scale;
      const dx = mx - offset.x;
      const dy = my - offset.y;
      // 日志：多选拖拽
      // console.log('多选拖拽 pushUndo 前 jsonData:', JSON.stringify(jsonData));
      // pushUndo(); // <-- 删除这行
      setJsonData(prev => prev.map(b => {
        if (!indices.includes(b.Index)) return b;
        if (!Array.isArray(b.Points) || b.Points.length === 0 || !b.Points.every((p: any) => p && p.Point && typeof p.Point.X === 'number' && typeof p.Point.Y === 'number')) {
          return b;
        }
        return {
          ...b,
          Points: b.Points.map((p: any) => ({
            Point: {
              X: p.Point.X + dx,
              Y: p.Point.Y + dy
            }
          })),
          Entrance: { Point: { X: b.Entrance.Point.X + dx, Y: b.Entrance.Point.Y + dy } },
          Exit: { Point: { X: b.Exit.Point.X + dx, Y: b.Exit.Point.Y + dy } }
        };
      }));
      dragInfo.current = {
        blockIndex,
        offset: {
          x: mx,
          y: my,
        },
      };
    };
    const handlePointerUp = (event: PIXI.FederatedPointerEvent) => {
      // 如果未发生拖拽，仅选中
      if (!dragStartedRef.current && dragStartRef.current.blockIndex !== null) {
        handleCanvasSelect(dragStartRef.current.blockIndex);
      }
      dragInfo.current = null;
      dragStartRef.current = { x: 0, y: 0, blockIndex: null };
      dragStartedRef.current = false;
    };
    app.stage.on('pointermove', handlePointerMove);
    app.stage.on('pointerup', handlePointerUp);
    app.stage.on('pointerupoutside', handlePointerUp);
    return () => {
      if (app && app.stage) {
        app.stage.off('pointermove', handlePointerMove);
        app.stage.off('pointerup', handlePointerUp);
        app.stage.off('pointerupoutside', handlePointerUp);
      }
    };
  }, [jsonData, selectedIndices, pixiReady, viewTransform, showEntrance, showExit, backgroundImage, bgImgSelected, bgImgPoints, enableBgImgPoint, model2D, modelRenderOptions]);

  // 监听打点功能开关，关闭时自动取消图片选中
  useEffect(() => {
    if (!enableBgImgPoint) {
      setBgImgSelected(false);
    }
  }, [enableBgImgPoint]);

  // 鼠标滚轮缩放和右键平移（用ref保证状态同步）
  useEffect(() => {
    const container = pixiContainer.current;
    if (!container) return;
    const app = appRef.current;
    if (!app) return;
    const canvas = app.view as HTMLCanvasElement;
    const isPanningRef = { current: false };
    const panStartRef = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
    // 滚轮缩放
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      let scale = viewTransform.scale;
      const minScale = 0.05, maxScale = 10;
      const zoomFactor = 1.1;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;
      let newScale = scale;
      if (e.deltaY < 0) {
        newScale = Math.min(scale * zoomFactor, maxScale);
      } else {
        newScale = Math.max(scale / zoomFactor, minScale);
      }
      const worldX = (mouseX - viewTransform.offsetX) / scale;
      const worldY = (mouseY - viewTransform.offsetY) / scale;
      const newOffsetX = mouseX - worldX * newScale;
      const newOffsetY = mouseY - worldY * newScale;
      setViewTransform(vt => ({ ...vt, scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }));
    };
    // 右键平移（Pointer Events）
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.x = e.clientX;
        panStartRef.y = e.clientY;
        panStartRef.offsetX = viewTransform.offsetX;
        panStartRef.offsetY = viewTransform.offsetY;
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        canvas.style.cursor = 'grabbing';
        return false;
      }
    };
    // pointermove和pointerup移到window级别
    const handlePointerMove = (e: PointerEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.x;
        const dy = e.clientY - panStartRef.y;
        setViewTransform(vt => {
          const newOffsetX = panStartRef.offsetX + dx;
          const newOffsetY = panStartRef.offsetY + dy;
          console.log('画布平移调试 offsetX:', newOffsetX, 'offsetY:', newOffsetY);
          return { ...vt, offsetX: newOffsetX, offsetY: newOffsetY };
        });
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
        return false;
      }
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (isPanningRef.current && e.button === 2) {
        isPanningRef.current = false;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        canvas.style.cursor = '';
        e.preventDefault();
        return false;
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    // pointermove和pointerup监听去掉canvas级别
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        // pointermove和pointerup监听去掉canvas级别
        canvas.removeEventListener('contextmenu', handleContextMenu);
        canvas.style.cursor = '';
      }
    };
  }, [viewTransform]);

  // antd文件上传props
  const uploadProps: UploadProps = {
    accept: 'application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          setJsonData(data);
          setSelectedIndices([]); // 导入时清空多选
          fitViewToBlocks(data);
          message.success('JSON文件加载成功');
        } catch (err) {
          message.error('JSON解析失败');
        }
      };
      reader.readAsText(file);
      return false;
    },
  };

  // playarea.json导入props
  const uploadPlayAreaProps: UploadProps = {
    accept: 'application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          setRawBlockData(data);
          // 合并数据
          mergeBlockData(data, blockDetailData);
          setSelectedIndices([]);
          fitViewToBlocks(data);
          message.success('playarea.json加载成功');
        } catch (err) {
          message.error('playarea.json解析失败');
        }
      };
      reader.readAsText(file);
      return false;
    },
  };
  // PlayAreaBlockData_0.json导入props
  const uploadBlockDetailProps: UploadProps = {
    accept: 'application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          setBlockDetailData(data);
          // 只添加 BlockRotateZAxisValue 字段
          addBlockRotateZAxisValue(rawBlockData, data);
          message.success('PlayAreaBlockData_0.json加载成功');
        } catch (err) {
          message.error('PlayAreaBlockData_0.json解析失败');
        }
      };
      reader.readAsText(file);
      return false;
    },
  };

  // 只添加 BlockRotateZAxisValue 字段
  function addBlockRotateZAxisValue(playarea: any[], detail: any[]) {
    if (!Array.isArray(playarea) || !Array.isArray(detail)) return;
    const updated = playarea.map(block => {
      const detailBlock = detail.find((d: any) => d.GlobalIndex === block.Index);
      let newBlock = { ...block };
      if (detailBlock) {
        if (detailBlock.BlockRotateZAxisValue !== undefined) {
          newBlock.BlockRotateZAxisValue = detailBlock.BlockRotateZAxisValue;
        }
        if (detailBlock.bShouldRotate !== undefined) {
          newBlock.bShouldRotate = detailBlock.bShouldRotate;
        }
      }
      return newBlock;
    });
    setJsonData(updated);
  }
  // 合并逻辑
  function mergeBlockData(playarea: any[], detail: any[]) {
    if (!Array.isArray(playarea) || !Array.isArray(detail)) return;
    setJsonData(playarea);
  }

  // 参考图上传props
  const bgImgUploadProps: UploadProps = {
    accept: 'image/png',
    showUploadList: false,
    beforeUpload: (file) => {
      setBgImgFileName(file.name.replace(/\.[^.]+$/, '.json'));
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const texture = PIXI.Texture.from(url);
        // 居中显示，初始缩放适配画布宽度
        const container = pixiContainer.current;
        const canvasWidth = container?.clientWidth || 1200;
        const canvasHeight = container?.clientHeight || 800;
        const img = new window.Image();
        img.onload = () => {
          const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.8;
          setBackgroundImage({ texture, x: 0, y: 0, scale, rotation: 0 });
          // 弹窗选择同名json
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/json';
          input.style.display = 'none';
          input.onchange = (e) => {
            const jsonFile = (e.target as HTMLInputElement).files?.[0];
            if (jsonFile) {
              const jsonReader = new FileReader();
              jsonReader.onload = (evt) => {
                try {
                  const obj = JSON.parse(evt.target?.result as string);
                  // 兼容老格式（数组）和新格式（带scale和points）
                  if (Array.isArray(obj)) {
                    setBgImgPoints(obj);
                    message.success('场地图点位已自动导入');
                  } else if (obj && Array.isArray(obj.points)) {
                    setBgImgPoints(obj.points);
                    // 自动设置scale
                    setBackgroundImage(prev => prev ? { ...prev, scale: typeof obj.scale === 'number' ? obj.scale : prev.scale } : prev);
                    message.success('场地图点位及缩放已自动导入');
                  } else {
                    message.error('点位JSON格式不正确');
                  }
                } catch {
                  message.error('点位JSON解析失败');
                }
              };
              jsonReader.readAsText(jsonFile);
            }
          };
          document.body.appendChild(input);
          input.click();
          setTimeout(() => document.body.removeChild(input), 1000);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
      return false;
    },
  };

  // OBJ文件上传props
  const objUploadProps: UploadProps = {
    accept: '.obj',
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        await loadObjFile(file);
        return false;
      } catch (error) {
        message.error('OBJ文件加载失败');
        return false;
      }
    },
  };

  // 原点信息文件上传props
  const originUploadProps: UploadProps = {
    accept: '.txt,.json',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const originData = parseOriginFile(text);
          setOriginInfo(originData);
          
          // 显示原点信息
          const euler = quaternionToEuler(originData);
          const eulerDegrees = {
            x: radiansToDegrees(euler.x),
            y: radiansToDegrees(euler.y),
            z: radiansToDegrees(euler.z)
          };
          
          message.success(`原点信息加载成功！位置: (${originData.x.toFixed(2)}, ${originData.y.toFixed(2)}, ${originData.z.toFixed(2)}) 旋转: (${eulerDegrees.x.toFixed(1)}°, ${eulerDegrees.y.toFixed(1)}°, ${eulerDegrees.z.toFixed(1)}°)`);
        } catch (err) {
          message.error('原点信息文件解析失败');
        }
      };
      reader.readAsText(file);
      return false;
    },
  };

  // 导出JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PlayArea_export.json';
    a.click();
    URL.revokeObjectURL(url);
    message.success('JSON已导出');
  };

  // 批量旋转按钮
  const handleRotate = () => {
    console.log('handleRotate 被调用');
    if(selectedIndices.length > 0) {
      // 1. 计算所有选中动块所有点的整体中心点
      let allPoints: { x: number, y: number, blockIdx: number, type: 'vertex'|'entrance'|'exit', pointIdx?: number }[] = [];
      jsonData.forEach((b) => {
        if (selectedIndices.includes(b.Index)) {
          b.Points.forEach((p: any, pi: any) => allPoints.push({ x: p.Point.X, y: p.Point.Y, blockIdx: b.Index, type: 'vertex', pointIdx: pi }));
          allPoints.push({ x: b.Entrance.Point.X, y: b.Entrance.Point.Y, blockIdx: b.Index, type: 'entrance' });
          allPoints.push({ x: b.Exit.Point.X, y: b.Exit.Point.Y, blockIdx: b.Index, type: 'exit' });
        }
      });
      if (allPoints.length === 0) return;
      const centerX = allPoints.reduce((sum: number, p: any) => sum + p.x, 0) / allPoints.length;
      const centerY = allPoints.reduce((sum: number, p: any) => sum + p.y, 0) / allPoints.length;
      // 2. 旋转角度（15度）
      const angle = 15 * Math.PI / 180;
      // 3. 旋转所有点
      console.log('pushUndo 前 jsonData:', JSON.stringify(jsonData));
      pushUndo(); // 先快照
      setJsonData(prev => prev.map(b => {
        if (!selectedIndices.includes(b.Index)) return b;
        // 旋转所有点（以整体中心点为圆心）
        const newPoints = b.Points.map((p: any, idx: any) => {
          const x = p.Point.X - centerX;
          const y = p.Point.Y - centerY;
          return { Point: {
            X: centerX + (x * Math.cos(angle) - y * Math.sin(angle)),
            Y: centerY + (x * Math.sin(angle) + y * Math.cos(angle)),
          }};
        });
        // 旋转入口
        const ex = b.Entrance.Point.X - centerX;
        const ey = b.Entrance.Point.Y - centerY;
        const newEntrance = { Point: {
          X: centerX + (ex * Math.cos(angle) - ey * Math.sin(angle)),
          Y: centerY + (ex * Math.sin(angle) + ey * Math.cos(angle)),
        }};
        // 旋转出口
        const ox = b.Exit.Point.X - centerX;
        const oy = b.Exit.Point.Y - centerY;
        const newExit = { Point: {
          X: centerX + (ox * Math.cos(angle) - oy * Math.sin(angle)),
          Y: centerY + (ox * Math.sin(angle) + oy * Math.cos(angle)),
        }};
        if (enableBlockRotateRef.current) {
          let newBlockRotateZAxisValue = b.BlockRotateZAxisValue;
          // 只更新"需要更新的动块"（用ref保证最新）
          if (needUpdateIndicesRef.current.includes(b.Index)) {
            newBlockRotateZAxisValue = (b.BlockRotateZAxisValue || 0) - 15;
          }
          // 多选时DeltaYaw不变，单选时才加15°
          const newDeltaYaw = selectedIndices.length === 1 ? (b.DeltaYaw + 15) % 360 : b.DeltaYaw;
          return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit, DeltaYaw: newDeltaYaw, BlockRotateZAxisValue: newBlockRotateZAxisValue };
        } else {
          // 不更新BlockRotateZAxisValue
          const newDeltaYaw = selectedIndices.length === 1 ? (b.DeltaYaw + 15) % 360 : b.DeltaYaw;
          return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit, DeltaYaw: newDeltaYaw };
        }
      }));
      setTimeout(() => {
        console.log('pushUndo 后 jsonData:', JSON.stringify(jsonData));
      }, 100);
    }
  };

  // 缩放按钮功能
  const handleZoom = (type: 'in' | 'out' | 'reset') => {
    setViewTransform(prev => {
      if (type === 'in') return { ...prev, scale: prev.scale * 1.2 };
      if (type === 'out') return { ...prev, scale: prev.scale / 1.2 };
      if (type === 'reset') return { ...prev, scale: 1 };
      return prev;
    });
  };

  const rotateSelectedBlocks = (angleDeg: number) => {
    console.log('rotateSelectedBlocks 被调用，angleDeg:', angleDeg, 'selectedIndices:', selectedIndices);
    const indices = selectedIndices;
    const data = jsonData;
    if(indices.length > 0) {
      // 计算所有选中动块所有点的整体中心点
      let allPoints: { x: number, y: number }[] = [];
      data.forEach((b) => {
        if (indices.includes(b.Index)) {
          b.Points.forEach((p: any) => allPoints.push({ x: p.Point.X, y: p.Point.Y }));
          allPoints.push({ x: b.Entrance.Point.X, y: b.Entrance.Point.Y });
          allPoints.push({ x: b.Exit.Point.X, y: b.Exit.Point.Y });
        }
      });
      if (allPoints.length === 0) return;
      const centerX = allPoints.reduce((sum: number, p: any) => sum + p.x, 0) / allPoints.length;
      const centerY = allPoints.reduce((sum: number, p: any) => sum + p.y, 0) / allPoints.length;
      const angle = angleDeg * Math.PI / 180;
      pushUndo();
      setJsonData(prev => prev.map(b => {
        if (!indices.includes(b.Index)) return b;
        const newPoints = b.Points.map((p: any, idx: any) => {
          const x = p.Point.X - centerX;
          const y = p.Point.Y - centerY;
          return { Point: {
            X: centerX + (x * Math.cos(angle) - y * Math.sin(angle)),
            Y: centerY + (x * Math.sin(angle) + y * Math.cos(angle)),
          }};
        });
        const ex = b.Entrance.Point.X - centerX;
        const ey = b.Entrance.Point.Y - centerY;
        const newEntrance = { Point: {
          X: centerX + (ex * Math.cos(angle) - ey * Math.sin(angle)),
          Y: centerY + (ex * Math.sin(angle) + ey * Math.cos(angle)),
        }};
        const ox = b.Exit.Point.X - centerX;
        const oy = b.Exit.Point.Y - centerY;
        const newExit = { Point: {
          X: centerX + (ox * Math.cos(angle) - oy * Math.sin(angle)),
          Y: centerY + (ox * Math.sin(angle) + oy * Math.cos(angle)),
        }};
        if (enableBlockRotateRef.current) {
          let newBlockRotateZAxisValue = b.BlockRotateZAxisValue;
          // 只更新"需要更新的动块"（用ref保证最新）
          if (needUpdateIndicesRef.current.includes(b.Index)) {
            newBlockRotateZAxisValue = (b.BlockRotateZAxisValue || 0) - angleDeg;
          }
          return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit, BlockRotateZAxisValue: newBlockRotateZAxisValue };
        } else {
          return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit };
        }
      }));
    }
  };

  // Q/E键旋转控制
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('handleKeyDown 触发', e.key);
      if ((e.key === 'q' || e.key === 'Q') && !isRDownRef.current) {
        console.log('Q 被按下');
      }
      if ((e.key === 'e' || e.key === 'E') && !isRDownRef.current) {
        console.log('E 被按下');
      }
      if (e.key === 'Shift') setIsShiftDown(true);
      if (e.key === 'q' || e.key === 'Q') {
        if (!isRDownRef.current) {
          isRDownRef.current = true;
          rotateSelectedBlocks(-15);
          // 启动1秒延迟，1秒后如仍按住Q键则开始持续旋转
          if (!rotateDelayTimeoutRef.current) {
            rotateDelayTimeoutRef.current = setTimeout(() => {
              if (isRDownRef.current && !rotateTimerRef.current) {
                rotateTimerRef.current = setInterval(() => {
                  rotateSelectedBlocks(-4);
                }, 100);
              }
              rotateDelayTimeoutRef.current = null;
            }, 1000);
          }
        }
      }
      if (e.key === 'e' || e.key === 'E') {
        if (!isRDownRef.current) {
          isRDownRef.current = true;
          rotateSelectedBlocks(15);
          // 启动1秒延迟，1秒后如仍按住E键则开始持续旋转
          if (!rotateDelayTimeoutRef.current) {
            rotateDelayTimeoutRef.current = setTimeout(() => {
              if (isRDownRef.current && !rotateTimerRef.current) {
                rotateTimerRef.current = setInterval(() => {
                  rotateSelectedBlocks(4);
                }, 100);
              }
              rotateDelayTimeoutRef.current = null;
            }, 1000);
          }
        }
      }
      // 新增：按下Esc时取消所有动块选中
      if (e.key === 'Escape') {
        setSelectedIndices([]);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        isRDownRef.current = false;
        if (rotateDelayTimeoutRef.current) {
          clearTimeout(rotateDelayTimeoutRef.current);
          rotateDelayTimeoutRef.current = null;
        }
        if (rotateTimerRef.current) {
          clearInterval(rotateTimerRef.current);
          rotateTimerRef.current = null;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    window.addEventListener('blur', () => {
      isRDownRef.current = false;
      if (rotateDelayTimeoutRef.current) {
        clearTimeout(rotateDelayTimeoutRef.current);
        rotateDelayTimeoutRef.current = null;
      }
      if (rotateTimerRef.current) {
        clearInterval(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }
    });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', () => {});
      if (rotateDelayTimeoutRef.current) clearTimeout(rotateDelayTimeoutRef.current);
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    };
  }, [selectedIndices, jsonData, undoStack, redoStack]);

  // 交互：拖拽/缩放/旋转图片
  useEffect(() => {
    if (!pixiReady || !backgroundImage || !bgImgSelected) return;
    const container = pixiContainer.current;
    if (!container) return;
    const app = appRef.current;
    if (!app) return;
    const canvas = app.view as HTMLCanvasElement;
    // 拖拽
    const handlePointerMove = (e: PointerEvent) => {
      if (bgImgDragging && bgImgDragOffset) {
        // 统一用 viewTransform 计算（与动块一致）
        const mx = (e.clientX - container.getBoundingClientRect().left - viewTransform.offsetX) / viewTransform.scale;
        const my = (e.clientY - container.getBoundingClientRect().top - viewTransform.offsetY) / viewTransform.scale;
        setBackgroundImage(prev => prev ? { ...prev, x: mx - bgImgDragOffset.x, y: my - bgImgDragOffset.y } : prev);
      }
    };
    const handlePointerUp = () => {
      setBgImgDragging(false);
      setBgImgDragOffset(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    // 缩放快捷键Q/E
    let scaleTimer: NodeJS.Timeout | null = null;
    let scaleDirection: 'in' | 'out' | null = null;
    const startScale = (dir: 'in' | 'out') => {
      if (scaleTimer) return;
      scaleDirection = dir;
      scaleTimer = setInterval(() => {
        setBackgroundImage(prev => {
          if (!prev) return prev;
          let newScale = prev.scale;
          if (dir === 'in') newScale = newScale * 1.01;
          if (dir === 'out') newScale = newScale / 1.01;
          return { ...prev, scale: Math.max(0.05, Math.min(10, newScale)) };
        });
      }, 100);
    };
    const stopScale = () => {
      if (scaleTimer) clearInterval(scaleTimer);
      scaleTimer = null;
      scaleDirection = null;
    };
    // 缩放
    const handleWheel = (e: WheelEvent) => {
      if (bgImgSelected) {
        e.preventDefault();
        let newScale = backgroundImage.scale;
        const zoomFactor = 1.1;
        if (e.deltaY < 0) newScale = newScale * zoomFactor;
        else newScale = newScale / zoomFactor;
        setBackgroundImage(prev => prev ? { ...prev, scale: Math.max(0.05, Math.min(10, newScale)) } : prev);
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    // 旋转和缩放快捷键
    const handleKeyDown = (e: KeyboardEvent) => {
      if (bgImgSelected && (e.key === 'q' || e.key === 'Q')) {
        setBackgroundImage(prev => prev ? { ...prev, rotation: prev.rotation - Math.PI / 12 } : prev); // 逆时针15度
      }
      if (bgImgSelected && (e.key === 'e' || e.key === 'E')) {
        setBackgroundImage(prev => prev ? { ...prev, rotation: prev.rotation + Math.PI / 12 } : prev); // 顺时针15度
      }
      if (bgImgSelected && (e.key === 'a' || e.key === 'A')) {
        startScale('in');
      }
      if (bgImgSelected && (e.key === 'd' || e.key === 'D')) {
        startScale('out');
      }
      if (e.key === 'Escape') setBgImgSelected(false);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
        stopScale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (canvas) canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopScale();
    };
  }, [pixiReady, backgroundImage, bgImgSelected, bgImgDragging, bgImgDragOffset, viewTransform]);

  // 导出场地图点位
  const handleExportBgImgPoints = () => {
    // 导出时包含scale字段
    const exportObj = {
      scale: backgroundImage?.scale ?? 1,
      points: bgImgPoints
    };
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bgImgFileName || '场地图点位.json';
    a.click();
    URL.revokeObjectURL(url);
    message.success('场地图点位已导出');
  };

  // 导出playarea.json
  const handleExportPlayArea = () => {
    const dataStr = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PlayArea.json';
    a.click();
    URL.revokeObjectURL(url);
    message.success('playarea.json已导出');
  };
  // 导出PlayAreaBlockData_0.json
  const handleExportBlockDetail = () => {
    // 保持导入 PlayAreaBlockData_0.json 的源文件格式，仅同步 BlockRotateZAxisValue 字段
    const updated = blockDetailData.map((item: any) => {
      const block = jsonData.find((b: any) => b.Index === item.GlobalIndex);
      if (block && block.BlockRotateZAxisValue !== undefined) {
        return { ...item, BlockRotateZAxisValue: block.BlockRotateZAxisValue };
      }
      return { ...item };
    });
    const dataStr = JSON.stringify(updated, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PlayAreaBlockData.json';
    a.click();
    URL.revokeObjectURL(url);
    message.success('PlayAreaBlockData.json已导出');
  };

  // 监听选中动块变化，计算需要更新的动块
  useEffect(() => {
    if (!enableBlockRotateRef.current || selectedIndices.length === 0) {
      setNeedUpdateIndices([]);
      return;
    }
    // 找到所有选中动块
    let selectedBlocks = jsonData.filter(b => selectedIndices.includes(b.Index));
    // 找到Index最小的动块
    const minIdx = Math.min(...selectedIndices);
    // 标记Index最小的动块bShouldRotate为true
    selectedBlocks = selectedBlocks.map(b =>
      b.Index === minIdx ? { ...b, bShouldRotate: true } : b
    );
    // needUpdateIndices = bShouldRotate为true的 + Index最小的
    let updateList = selectedBlocks.filter(b => b.bShouldRotate).map(b => b.Index);
    if (!updateList.includes(minIdx)) updateList.push(minIdx);
    setNeedUpdateIndices(updateList);
  }, [selectedIndices, enableBlockRotate]);

  // 4. handleUndo/handleRedo
  function setJsonDataWithClone(newData: any[]) {
    const cloned = deepClone(newData);
    setJsonData(cloned);
    setTimeout(() => {
      console.log('setJsonDataWithClone 后 jsonData:', JSON.stringify(cloned));
    }, 100);
  }
  function handleUndo() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      let idx = prev.length - 1;
      let last = prev[idx];
      while (idx >= 0 && JSON.stringify(last.jsonData) === JSON.stringify(jsonData)) {
        idx--;
        last = prev[idx];
      }
      if (!last || !Array.isArray(last.jsonData) || last.jsonData.length === 0) {
        console.error('撤销快照内容非法，未更新', last?.jsonData);
        return prev.slice(0, idx + 1);
      }
      setRedoStack(r => [...r, { jsonData, bgImgPoints, backgroundImage: backgroundImage ? {
        x: backgroundImage.x,
        y: backgroundImage.y,
        scale: backgroundImage.scale,
        rotation: backgroundImage.rotation,
      } : null }]);
      setJsonDataWithClone(last.jsonData);
      setBgImgPoints(last.bgImgPoints);
      // 恢复 backgroundImage 的 x/y/scale/rotation，保留原有 texture
      setBackgroundImage(prev => prev && last.backgroundImage ? {
        ...prev,
        ...last.backgroundImage
      } : last.backgroundImage ? { ...last.backgroundImage, texture: null } : null);
      setSelectedIndices([]); // 撤销后清空选中
      return prev.slice(0, idx);
    });
  }
  function handleRedo() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (!Array.isArray(last.jsonData) || last.jsonData.length === 0) {
        console.error('重做快照内容非法，未更新', last.jsonData);
        return prev.slice(0, -1);
      }
      setUndoStack(u => [...u, { jsonData, bgImgPoints, backgroundImage: backgroundImage ? {
        x: backgroundImage.x,
        y: backgroundImage.y,
        scale: backgroundImage.scale,
        rotation: backgroundImage.rotation,
      } : null }]);
      setJsonDataWithClone(last.jsonData);
      setBgImgPoints(last.bgImgPoints);
      // 恢复 backgroundImage 的 x/y/scale/rotation，保留原有 texture
      setBackgroundImage(prev => prev && last.backgroundImage ? {
        ...prev,
        ...last.backgroundImage
      } : last.backgroundImage ? { ...last.backgroundImage, texture: null } : null);
      setSelectedIndices([]); // 重做后清空选中
      return prev.slice(0, -1);
    });
  }

  // 7. 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jsonData, undoStack, redoStack]);

  // 新增：监听selectedIndices和hoveredBlockIndex变化，自动启动tooltip计时器
  useEffect(() => {
    if (selectedIndices.length === 1 && hoveredBlockIndex === selectedIndices[0]) {
      const block = jsonData.find(b => b.Index === hoveredBlockIndex);
      if (!block) return;
      if (blockTooltipTimer.current) clearTimeout(blockTooltipTimer.current);
      blockTooltipTimer.current = setTimeout(() => {
        setBlockTooltip(prev => ({ ...prev, visible: true, block }));
      }, 2000);
    } else {
      if (blockTooltipTimer.current) {
        clearTimeout(blockTooltipTimer.current);
        blockTooltipTimer.current = null;
      }
      setBlockTooltip(prev => ({ ...prev, visible: false, block: null }));
    }
  }, [selectedIndices, hoveredBlockIndex]);

  console.log('App 组件已加载');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#fff', boxShadow: '2px 0 8px #f0f1f2', height: '100vh', overflow: 'auto' }}>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Sidebar
              selectedIndices={selectedIndices}
              jsonData={jsonData}
              handleSelectBlock={handleSelectBlock}
              blockDetailData={blockDetailData}
            />
          </div>
        </div>
      </Sider>
      
      <Content style={{ background: '#222', height: '100vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CanvasView 
          pixiContainer={pixiContainer} 
          style={{
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
      </Content>

      <Sider width={200} style={{ background: '#fff', boxShadow: '-2px 0 8px #f0f1f2', height: '100vh', overflow: 'auto' }}>
        <RightSider
          uploadPlayAreaProps={uploadPlayAreaProps}
          uploadBlockDetailProps={uploadBlockDetailProps}
          bgImgUploadProps={bgImgUploadProps}
          objUploadProps={objUploadProps}
          originUploadProps={originUploadProps}
          originInfo={originInfo}
          handleExportBgImgPoints={handleExportBgImgPoints}
          handleExportPlayArea={handleExportPlayArea}
          handleExportBlockDetail={handleExportBlockDetail}
          enableBlockRotate={enableBlockRotate}
          setEnableBlockRotate={setEnableBlockRotate}
          moveSingleBlock={moveSingleBlock}
          setMoveSingleBlock={setMoveSingleBlock}
          showEntrance={showEntrance}
          setShowEntrance={setShowEntrance}
          showExit={showExit}
          setShowExit={setShowExit}
          enableBgImgPoint={enableBgImgPoint}
          setEnableBgImgPoint={setEnableBgImgPoint}
          helpVisible={helpVisible}
          setHelpVisible={setHelpVisible}
          modelRenderOptions={modelRenderOptions}
          updateModelRenderOptions={updateModelRenderOptions}
          hasObjModel={!!model2D}
        />
      </Sider>
      {blockTooltip.visible && blockTooltip.block && (
        <div
          style={{
            position: 'fixed',
            left: blockTooltip.x + 16,
            top: blockTooltip.y + 16,
            zIndex: 9999,
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid #eee',
            borderRadius: 8,
            boxShadow: '0 2px 12px #0002',
            padding: 12,
            pointerEvents: 'none',
            minWidth: 260,
            maxWidth: 400
          }}
        >
          <BlockDetailContent block={blockTooltip.block} />
        </div>
      )}
    </Layout>
  );
};

export default App;
