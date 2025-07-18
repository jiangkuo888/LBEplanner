import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Layout, Button, Upload, Card, Divider, Typography, message, List, Checkbox, Switch, Modal } from 'antd';
import { UploadOutlined, DownloadOutlined, RedoOutlined, PlusOutlined, MinusOutlined, ExpandOutlined, PictureOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import 'antd/dist/reset.css';

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
  const selectedIndicesRef = useRef(selectedIndices);
  const jsonDataRef = useRef(jsonData);
  useEffect(() => { selectedIndicesRef.current = selectedIndices; }, [selectedIndices]);
  useEffect(() => { jsonDataRef.current = jsonData; }, [jsonData]);
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
    if (!pixiReady) return;
    const layer = blocksLayer.current;
    if (!layer) return;
    layer.removeChildren();
    const { scale, offsetX, offsetY } = viewTransform;
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
            const mx = (event.global.x - offsetX) / scale;
            const my = (event.global.y - offsetY) / scale;
            setBgImgDragOffset({
              x: mx - backgroundImage.x,
              y: my - backgroundImage.y,
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
          // 再变换到画布坐标
          const cx = wx * scale + offsetX;
          const cy = wy * scale + offsetY;
          const g = new PIXI.Graphics();
          g.beginFill(0xff1744, 1).drawCircle(cx, cy, 8).endFill();
          g.interactive = false;
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
    const crossLen = 30;
    const crossColor = 0xff1744; // 红色
    const crossThickness = 5;
    const zeroX = 0 * scale + offsetX;
    const zeroY = 0 * scale + offsetY;
    const cross = new PIXI.Graphics();
    cross.lineStyle(crossThickness, crossColor, 1)
      .moveTo(zeroX - crossLen, zeroY)
      .lineTo(zeroX + crossLen, zeroY)
      .moveTo(zeroX, zeroY - crossLen)
      .lineTo(zeroX, zeroY + crossLen);
    layer.addChild(cross as unknown as PIXI.DisplayObject);
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
          // 超过阈值，开始拖拽
          dragStartedRef.current = true;
          const mx = (event.global.x - offsetX) / scale;
          const my = (event.global.y - offsetY) / scale;
          dragInfo.current = {
            blockIndex: dragStartRef.current.blockIndex,
            offset: { x: mx, y: my },
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
      setJsonData(prev => {
        const newArr = [...prev];
        indices.forEach(idx => {
          const bIdx = newArr.findIndex(b => b.Index === idx);
          if (bIdx !== -1) {
            const b = { ...newArr[bIdx] };
            b.Points = b.Points.map((p: any) => ({ Point: { X: p.Point.X + dx, Y: p.Point.Y + dy } }));
            b.Entrance = { Point: { X: b.Entrance.Point.X + dx, Y: b.Entrance.Point.Y + dy } };
            b.Exit = { Point: { X: b.Exit.Point.X + dx, Y: b.Exit.Point.Y + dy } };
            newArr[bIdx] = b;
          }
        });
        return newArr;
      });
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
  }, [jsonData, selectedIndices, pixiReady, viewTransform, showEntrance, showExit, backgroundImage, bgImgSelected, bgImgPoints, enableBgImgPoint]);

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
      if (detailBlock && detailBlock.BlockRotateZAxisValue !== undefined) {
        return { ...block, BlockRotateZAxisValue: detailBlock.BlockRotateZAxisValue };
      }
      return { ...block };
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
          const minIdx = Math.min(...selectedIndices);
          if ((b.BlockRotateZAxisValue !== undefined && b.BlockRotateZAxisValue !== 0) || b.Index === minIdx) {
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
    const indices = selectedIndicesRef.current;
    const data = jsonDataRef.current;
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
          const minIdx = Math.min(...indices);
          if ((b.BlockRotateZAxisValue !== undefined && b.BlockRotateZAxisValue !== 0) || b.Index === minIdx) {
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
  }, []);

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
    a.download = 'playarea_export.json';
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
    a.download = 'PlayAreaBlockData_0_export.json';
    a.click();
    URL.revokeObjectURL(url);
    message.success('PlayAreaBlockData_0.json已导出');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={320} style={{ background: '#fff', boxShadow: '2px 0 8px #f0f1f2' }}>
        <div style={{ padding: 24 }}>
          {/* 新增：调节内容转向toggle按钮 */}
          <div style={{ marginBottom: 16 }}>
            <Switch checked={enableBlockRotate} onChange={setEnableBlockRotate} style={{ marginRight: 8 }} />
            <span style={{ fontWeight: 600 }}>调节内容转向</span>
          </div>
          {/* 帮助按钮 */}
          <Button type="link" style={{ float: 'right', marginBottom: 8 }} onClick={() => setHelpVisible(true)}>
            帮助
          </Button>
          <Modal
            title="操作说明"
            open={helpVisible}
            onCancel={() => setHelpVisible(false)}
            footer={null}
            width={600}
            bodyStyle={{ maxHeight: 600, overflowY: 'auto' }}
          >
            <div style={{ fontSize: 16, lineHeight: 1.8 }}>
              <ol style={{ paddingLeft: 20 }}>
                <li style={{ marginBottom: 12 }}><b>动块操作</b>
                  <ul style={{ marginTop: 6, marginBottom: 6 }}>
                    <li><b>选择动块：</b> 单击动块（默认选中同一幕所有动块）；按住 <b>Shift</b> 键单击可多选/取消多选；侧边栏复选框也可多选/单选。</li>
                    <li><b>拖拽动块：</b> 鼠标左键拖动选中动块移动。开启"可以移动单独动块"时，单选动块可独立拖动。</li>
                    <li><b>旋转动块：</b> 选中动块后，按 <b>Q</b> 键动块逆时针旋转15°，长按1秒后持续旋转（每100ms旋转4°）；按 <b>E</b> 键动块顺时针旋转15°，长按1秒后持续旋转（每100ms旋转4°）。</li>
                    <li><b>缩放视图：</b> 鼠标滚轮以鼠标位置为中心缩放画布。</li>
                    <li><b>平移视图：</b> 鼠标右键按住画布拖动，实现无限平移。</li>
                  </ul>
                </li>
                <li style={{ marginBottom: 12 }}><b>场地图片与打点</b>
                  <ul style={{ marginTop: 6, marginBottom: 6 }}>
                    <li><b>导入场地参考图：</b> 侧边栏"导入场地参考图"按钮，支持CAD或手绘PNG图片。</li>
                    <li><b>打点模式：</b> 开启"场地图打点"后：
                      <ul style={{ marginTop: 4, marginBottom: 4 }}>
                        <li>鼠标左键点击图片依次打点，闭合后形成路径。</li>
                        <li>闭合后，点击图片并拖动可移动图片。</li>
                        <li>鼠标滚轮缩放图片。</li>
                        <li><b>Q</b>键：图片逆时针旋转15°。</li>
                        <li><b>E</b>键：图片顺时针旋转15°。</li>
                        <li><b>A</b>键：按住持续放大图片。</li>
                        <li><b>D</b>键：按住持续缩小图片。</li>
                        <li><b>Esc</b>键：取消图片选中。</li>
                      </ul>
                    </li>
                    <li><b>导入/导出点位：</b> 导入图片后自动弹窗选择同名点位JSON（支持新旧格式）；侧边栏"导出场地图点位"按钮可导出当前点位和图片缩放信息。</li>
                  </ul>
                </li>
                <li style={{ marginBottom: 12 }}><b>其它辅助操作</b>
                  <ul style={{ marginTop: 6, marginBottom: 6 }}>
                    <li><b>数据导入导出：</b> 侧边栏"导入JSON"按钮导入动块数据，"导出JSON"按钮导出当前动块数据。</li>
                    <li><b>入口/出口显示：</b> 侧边栏可切换"显示入口""显示出口"开关。</li>
                    <li><b>辅助信息：</b> 画布中心始终显示红色锚点和坐标标签，辅助网格便于空间定位。</li>
                  </ul>
                </li>
              </ol>
            </div>
          </Modal>
          {/* 功能开关区 */}
          <div style={{ marginBottom: 24, padding: '8px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>显示与操作</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <Switch checked={moveSingleBlock} onChange={setMoveSingleBlock} style={{ marginRight: 8 }} />
                <span>可以移动单独动块</span>
              </div>
              <div>
                <Switch checked={showEntrance} onChange={setShowEntrance} style={{ marginRight: 8 }} />
                <span>显示入口</span>
              </div>
              <div>
                <Switch checked={showExit} onChange={setShowExit} style={{ marginRight: 8 }} />
                <span>显示出口</span>
              </div>
              <div>
                <Switch checked={enableBgImgPoint} onChange={setEnableBgImgPoint} style={{ marginRight: 8 }} />
                <span>场地图打点</span>
              </div>
            </div>
          </div>
          {/* 数据导入导出区 */}
          <div style={{ marginBottom: 32 }}>
            <Card bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 2px 8px #f0f1f2' }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>数据导入</div>
              <Upload {...uploadPlayAreaProps} style={{ width: '100%' }}>
                <Button icon={<UploadOutlined />} type="primary" block size="large" style={{ marginBottom: 10, borderRadius: 8 }}>
                  导入playarea.json
                </Button>
              </Upload>
              <Upload {...uploadBlockDetailProps} style={{ width: '100%' }}>
                <Button icon={<UploadOutlined />} type="dashed" block size="large" style={{ borderRadius: 8 }}>
                  导入PlayAreaBlockData.json
                </Button>
              </Upload>
            </Card>
            <Card bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 2px 8px #f0f1f2' }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>场地图片与点位</div>
              <Upload {...bgImgUploadProps} style={{ width: '100%' }}>
                <Button icon={<PictureOutlined />} block size="large" style={{ marginBottom: 10, borderRadius: 8 }}>
                  导入场地参考图
                </Button>
              </Upload>
              <Button block size="large" style={{ borderRadius: 8 }} onClick={handleExportBgImgPoints}>
                导出场地图点位
              </Button>
            </Card>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px #f0f1f2' }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>数据导出</div>
              <Button icon={<DownloadOutlined />} block size="large" style={{ marginBottom: 10, borderRadius: 8 }} onClick={handleExportPlayArea}>
                导出playarea.json
              </Button>
              <Button icon={<DownloadOutlined />} type="dashed" block size="large" style={{ borderRadius: 8 }} onClick={handleExportBlockDetail}>
                导出PlayAreaBlockData.json
              </Button>
            </Card>
          </div>
          <Divider />
          {/* Hierarchy 视图 */}
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>动块层级（多选）</div>
          <Card bordered={false} style={{ marginBottom: 16, maxHeight: 600, overflow: 'auto' }}>
            <List
              dataSource={jsonData}
              renderItem={item => (
                <List.Item>
                  <Checkbox
                    checked={selectedIndices.includes(item.Index)}
                    onChange={e => handleSelectBlock(item.Index, e.target.checked)}
                  >
                    <span style={{ fontWeight: selectedIndices.includes(item.Index) ? 'bold' : undefined }}>
                      #{item.Index} {item.Name}
                    </span>
                  </Checkbox>
                </List.Item>
              )}
            />
          </Card>
          <Divider />
          {selectedIndices.length === 1 ? (
            (() => {
              const selectedBlock = jsonData.find(b => b.Index === selectedIndices[0]);
              return selectedBlock ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{`动块信息 #${selectedBlock.Index}`}</div>
                  <Card bordered={false}>
                    <ul style={{margin: 0, paddingLeft: 18}}>
                      {Object.entries(selectedBlock).map(([key, value]) => (
                        <li key={key} style={{fontSize: 13, marginBottom: 2}}>
                          <b>{key}：</b>{typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              ) : null;
            })()
          ) : (
            <Card bordered={false} style={{ marginBottom: 16, textAlign: 'center', color: '#aaa' }}>
              {selectedIndices.length === 0 ? '暂未选中动块' : `已选中${selectedIndices.length}个动块`}
            </Card>
          )}
          <Divider />
          <div style={{ color: '#888', fontSize: 12, textAlign: 'center' }}>
            Powered by React + PixiJS + Ant Design
          </div>
        </div>
      </Sider>
      <Content style={{ background: '#222', height: '100vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          ref={pixiContainer}
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
    </Layout>
  );
};

export default App;
