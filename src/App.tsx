import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Layout, Button, Upload, Card, Divider, Typography, message } from 'antd';
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
    const width = container?.clientWidth || 1200;
    const height = container?.clientHeight || 800;
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
    return () => {
      if (app) {
        app.destroy(true, { children: true });
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  useEffect(() => {
    if (!pixiReady) return;
    const layer = blocksLayer.current;
    if (!layer) return;
    layer.removeChildren();
    const { scale, offsetX, offsetY } = viewTransform;
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
      const isSelected = selectedIndex === block.Index;
      poly.interactive = true;
      (poly as any).buttonMode = true;
      poly.lineStyle(isSelected ? 5 : 2, isSelected ? 0xffeb3b : 0xffffff, 0.9)
        .beginFill(COLORS[i % COLORS.length], isSelected ? 0.7 : 0.4)
        .moveTo(rotated[0].x, rotated[0].y);
      rotated.forEach((pt, idx) => {
        if (idx > 0) poly.lineTo(pt.x, pt.y);
      });
      poly.closePath().endFill();
      poly.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        setSelectedIndex(block.Index);
        setSelectedBlock(block);
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
    const app = appRef.current;
    if (!app) return;
    const handlePointerMove = (event: PIXI.FederatedPointerEvent) => {
      if (!dragInfo.current) return;
      const { blockIndex, offset } = dragInfo.current;
      const blockIdx = jsonData.findIndex(b => b.Index === blockIndex);
      if (blockIdx === -1) return;
      const mx = (event.global.x - offsetX) / scale;
      const my = (event.global.y - offsetY) / scale;
      const dx = mx - offset.x;
      const dy = my - offset.y;
      setJsonData(prev => {
        const newArr = [...prev];
        const b = { ...newArr[blockIdx] };
        b.Points = b.Points.map(p => ({ Point: { X: p.Point.X + dx, Y: p.Point.Y + dy } }));
        b.Entrance = { Point: { X: b.Entrance.Point.X + dx, Y: b.Entrance.Point.Y + dy } };
        b.Exit = { Point: { X: b.Exit.Point.X + dx, Y: b.Exit.Point.Y + dy } };
        newArr[blockIdx] = b;
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
  }, [jsonData, selectedIndex, pixiReady, viewTransform]);

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
          setSelectedIndex(null);
          setSelectedBlock(null);
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

  // 旋转按钮
  const handleRotate = () => {
    if(selectedBlock) {
      setJsonData(prev => prev.map(b =>
        b.Index === selectedBlock.Index
          ? { ...b, DeltaYaw: (b.DeltaYaw + 15) % 360 }
          : b
      ));
      setSelectedBlock(b => b ? { ...b, DeltaYaw: (b.DeltaYaw + 15) % 360 } : b);
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={320} style={{ background: '#fff', boxShadow: '2px 0 8px #f0f1f2' }}>
        <div style={{ padding: 24 }}>
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
          {selectedBlock ? (
            <Card title={`动块信息 #${selectedBlock.Index}`} bordered={false} style={{ marginBottom: 16 }}>
              <Text strong>名称：</Text>{selectedBlock.Name}<br />
              <Text strong>旋转：</Text>{selectedBlock.DeltaYaw}°<br />
              <Text strong>入口：</Text>({selectedBlock.Entrance.Point.X.toFixed(2)}, {selectedBlock.Entrance.Point.Y.toFixed(2)})<br />
              <Text strong>出口：</Text>({selectedBlock.Exit.Point.X.toFixed(2)}, {selectedBlock.Exit.Point.Y.toFixed(2)})<br />
              <Button icon={<RedoOutlined />} block style={{ marginTop: 16 }} onClick={handleRotate}>
                旋转15°
              </Button>
            </Card>
          ) : (
            <Card bordered={false} style={{ marginBottom: 16, textAlign: 'center', color: '#aaa' }}>
              暂未选中动块
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
