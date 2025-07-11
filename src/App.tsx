import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Layout, Button, Upload, Card, Divider, Typography, message, List, Checkbox, Switch } from 'antd';
import { UploadOutlined, DownloadOutlined, RedoOutlined, PlusOutlined, MinusOutlined, ExpandOutlined } from '@ant-design/icons';
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
}

const COLORS = [
  0x4fc3f7, 0xffb74d, 0x81c784, 0xe57373, 0xba68c8, 0xa1887f, 0x90a4ae, 0xf06292, 0xffd54f, 0x64b5f6
];

const App: React.FC = () => {
  const pixiContainer = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [jsonData, setJsonData] = useState<BlockData[]>([]);
  const blocksLayer = useRef<PIXI.Container | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  const dragInfo = useRef<{ blockIndex: number; offset: { x: number; y: number } } | null>(null);
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
  const [moveSingleBlock, setMoveSingleBlock] = useState(true);

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
    // 计算所有动块的幕号到颜色的映射，并校验Name格式
    const sceneColorMap: Record<string, number> = {};
    let sceneList: string[] = [];
    let invalidBlockName: string | null = null;
    jsonData.forEach(block => {
      const nameParts = (block.Name || '').split('-');
      if (!block.Name || nameParts.length < 2 || !/^\d+$/.test(nameParts[0])) {
        invalidBlockName = block.Name;
      }
      const scene = nameParts[0];
      if (!sceneList.includes(scene)) sceneList.push(scene);
    });
    if (invalidBlockName) {
      setTimeout(() => {
        window.alert(`动块名称“${invalidBlockName}”无法解析出幕号（应为“数字-...”格式），请检查数据！`);
      }, 0);
      return;
    }
    sceneList.forEach((scene, idx) => {
      sceneColorMap[scene] = COLORS[idx % COLORS.length];
    });
    jsonData.forEach((block, i) => {
      const points = block.Points.map(p => [p.Point.X, p.Point.Y]).flat();
      let centerX = 0, centerY = 0;
      points.forEach((v, idx) => {
        if (idx % 2 === 0) centerX += v;
        else centerY += v;
      });
      centerX /= block.Points.length;
      centerY /= block.Points.length;
      const rad = (block.DeltaYaw || 0) * Math.PI / 180;
      const rotated = block.Points.map(p => {
        const x = p.Point.X - centerX;
        const y = p.Point.Y - centerY;
        const rx = centerX + (x * Math.cos(rad) - y * Math.sin(rad));
        const ry = centerY + (x * Math.sin(rad) + y * Math.cos(rad));
        return {
          x: rx * scale + offsetX,
          y: ry * scale + offsetY,
        };
      });
      const poly = new PIXI.Graphics();
      const isSelected = selectedIndices.includes(block.Index);
      poly.interactive = true;
      (poly as any).buttonMode = true;
      const scene = (block.Name || '').split('-')[0];
      const color = sceneColorMap[scene] || COLORS[i % COLORS.length];
      poly.lineStyle(isSelected ? 5 : 2, isSelected ? 0xffeb3b : 0xffffff, 0.9)
        .beginFill(color, isSelected ? 0.35 : 0.2)
        .moveTo(rotated[0].x, rotated[0].y);
      rotated.forEach((pt, idx) => {
        if (idx > 0) poly.lineTo(pt.x, pt.y);
      });
      poly.closePath().endFill();
      poly.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        handleCanvasSelect(block.Index);
        const mx = (event.global.x - offsetX) / scale;
        const my = (event.global.y - offsetY) / scale;
        dragInfo.current = {
          blockIndex: block.Index,
          offset: {
            x: mx,
            y: my,
          },
        };
      });
      layer.addChild(poly as unknown as PIXI.DisplayObject);
      const text = new PIXI.Text(block.Index.toString(), {
        fontSize: 22,
        fill: 0xffffff,
        fontWeight: 'bold',
        align: 'center',
        stroke: 0x000000,
      });
      text.anchor.set(0.5);
      text.x = centerX * scale + offsetX;
      text.y = centerY * scale + offsetY;
      layer.addChild(text as unknown as PIXI.DisplayObject);
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
      drawPoint(block.Entrance.Point, 0x00e676, '入口');
      drawPoint(block.Exit.Point, 0xff1744, '出口');
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
            b.Points = b.Points.map(p => ({ Point: { X: p.Point.X + dx, Y: p.Point.Y + dy } }));
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
    const handlePointerUp = () => {
      dragInfo.current = null;
    };
    app.stage.on('pointermove', handlePointerMove);
    app.stage.on('pointerup', handlePointerUp);
    app.stage.on('pointerupoutside', handlePointerUp);
    return () => {
      app.stage.off('pointermove', handlePointerMove);
      app.stage.off('pointerup', handlePointerUp);
      app.stage.off('pointerupoutside', handlePointerUp);
    };
  }, [jsonData, selectedIndices, pixiReady, viewTransform]);

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
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      // pointermove和pointerup监听去掉canvas级别
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.style.cursor = '';
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
          b.Points.forEach((p, pi) => allPoints.push({ x: p.Point.X, y: p.Point.Y, blockIdx: b.Index, type: 'vertex', pointIdx: pi }));
          allPoints.push({ x: b.Entrance.Point.X, y: b.Entrance.Point.Y, blockIdx: b.Index, type: 'entrance' });
          allPoints.push({ x: b.Exit.Point.X, y: b.Exit.Point.Y, blockIdx: b.Index, type: 'exit' });
        }
      });
      if (allPoints.length === 0) return;
      const centerX = allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length;
      const centerY = allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length;
      // 2. 旋转角度（15度）
      const angle = 15 * Math.PI / 180;
      // 3. 旋转所有点
      setJsonData(prev => prev.map(b => {
        if (!selectedIndices.includes(b.Index)) return b;
        // 旋转所有点（以整体中心点为圆心）
        const newPoints = b.Points.map(p => {
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
        // 多选时DeltaYaw不变，单选时才加15°
        const newDeltaYaw = selectedIndices.length === 1 ? (b.DeltaYaw + 15) % 360 : b.DeltaYaw;
        return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit, DeltaYaw: newDeltaYaw };
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
          b.Points.forEach((p) => allPoints.push({ x: p.Point.X, y: p.Point.Y }));
          allPoints.push({ x: b.Entrance.Point.X, y: b.Entrance.Point.Y });
          allPoints.push({ x: b.Exit.Point.X, y: b.Exit.Point.Y });
        }
      });
      if (allPoints.length === 0) return;
      const centerX = allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length;
      const centerY = allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length;
      const angle = angleDeg * Math.PI / 180;
      setJsonData(prev => prev.map(b => {
        if (!indices.includes(b.Index)) return b;
        const newPoints = b.Points.map(p => {
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
        return { ...b, Points: newPoints, Entrance: newEntrance, Exit: newExit };
      }));
    }
  };

  // R键旋转控制
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(true);
      if (e.key === 'r' || e.key === 'R') {
        if (!isRDownRef.current) {
          isRDownRef.current = true;
          rotateSelectedBlocks(15);
          // 启动1秒延迟，1秒后如仍按住R键则开始持续旋转
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
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
      if (e.key === 'r' || e.key === 'R') {
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={320} style={{ background: '#fff', boxShadow: '2px 0 8px #f0f1f2' }}>
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <Switch checked={moveSingleBlock} onChange={setMoveSingleBlock} style={{ marginRight: 8 }} />
            <span>可以移动单独动块</span>
          </div>
          <Title level={3} style={{ marginBottom: 24 }}>动块编辑器</Title>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} block type="primary" style={{ marginBottom: 16 }}>
              导入JSON
            </Button>
          </Upload>
          <Button icon={<DownloadOutlined />} block style={{ marginBottom: 16 }} onClick={handleExport}>
            导出JSON
          </Button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Button icon={<PlusOutlined />} onClick={() => handleZoom('in')} />
            <Button icon={<MinusOutlined />} onClick={() => handleZoom('out')} />
            <Button icon={<ExpandOutlined />} onClick={() => handleZoom('reset')} />
          </div>
          <Divider />
          {/* Hierarchy 视图 */}
          <Card title="动块层级（多选）" bordered={false} style={{ marginBottom: 16, maxHeight: 600, overflow: 'auto' }}>
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
          <Button icon={<RedoOutlined />} block style={{ marginBottom: 16 }} onClick={handleRotate} disabled={selectedIndices.length === 0}>
            批量旋转15°
          </Button>
          <Divider />
          {selectedIndices.length === 1 ? (
            (() => {
              const selectedBlock = jsonData.find(b => b.Index === selectedIndices[0]);
              return selectedBlock ? (
                <Card title={`动块信息 #${selectedBlock.Index}`} bordered={false} style={{ marginBottom: 16 }}>
                  <Text strong>名称：</Text>{selectedBlock.Name}<br />
                  <Text strong>旋转：</Text>{selectedBlock.DeltaYaw}°<br />
                  <Text strong>入口：</Text>({selectedBlock.Entrance.Point.X.toFixed(2)}, {selectedBlock.Entrance.Point.Y.toFixed(2)})<br />
                  <Text strong>出口：</Text>({selectedBlock.Exit.Point.X.toFixed(2)}, {selectedBlock.Exit.Point.Y.toFixed(2)})<br />
                  <Divider />
                  <Text strong>顶点坐标：</Text>
                  <ul style={{margin: 0, paddingLeft: 18}}>
                    {selectedBlock.Points.map((p, idx) => (
                      <li key={idx} style={{fontSize: 12}}>
                        {`[${idx}] (${p.Point.X.toFixed(2)}, ${p.Point.Y.toFixed(2)})`}
                      </li>
                    ))}
                  </ul>
                </Card>
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
