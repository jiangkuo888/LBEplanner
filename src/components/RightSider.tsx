import React from 'react';
import { Button, Upload, Typography, Tooltip, Switch, Divider, Card, Space } from 'antd';
import { UploadOutlined, DownloadOutlined, PictureOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import HelpModal from './HelpModal';

const { Text, Title } = Typography;

const btnStyle = { width: 40, height: 40, fontSize: 22, borderRadius: 8, margin: '0 4px' };

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card
    style={{
      width: '100%',
      marginBottom: 18,
      borderRadius: 12,
      boxShadow: '0 2px 8px #f0f1f2',
      border: 'none',
      padding: 0,
    }}
    bodyStyle={{ padding: 18, paddingBottom: 10 }}
  >
    <Title level={5} style={{ marginBottom: 14, fontWeight: 700 }}>{title}</Title>
    {children}
  </Card>
);

interface RightSiderProps {
  uploadPlayAreaProps: UploadProps;
  uploadBlockDetailProps: UploadProps;
  bgImgUploadProps: UploadProps;
  handleExportBgImgPoints: () => void;
  handleExportPlayArea: () => void;
  handleExportBlockDetail: () => void;
  enableBlockRotate: boolean;
  setEnableBlockRotate: (v: boolean) => void;
  moveSingleBlock: boolean;
  setMoveSingleBlock: (v: boolean) => void;
  showEntrance: boolean;
  setShowEntrance: (v: boolean) => void;
  showExit: boolean;
  setShowExit: (v: boolean) => void;
  enableBgImgPoint: boolean;
  setEnableBgImgPoint: (v: boolean) => void;
  helpVisible: boolean;
  setHelpVisible: (v: boolean) => void;
}

const RightSider: React.FC<RightSiderProps> = (props) => {
  const {
    uploadPlayAreaProps, uploadBlockDetailProps, bgImgUploadProps,
    handleExportBgImgPoints, handleExportPlayArea, handleExportBlockDetail,
    enableBlockRotate, setEnableBlockRotate,
    moveSingleBlock, setMoveSingleBlock,
    showEntrance, setShowEntrance,
    showExit, setShowExit,
    enableBgImgPoint, setEnableBgImgPoint,
    helpVisible, setHelpVisible,
  } = props;

  return (
    <div style={{ padding: 18, height: '100%', overflowY: 'auto', position: 'relative', background: '#fafbfc' }}>
      {/* 帮助按钮悬浮右上角 */}
      <Button
        type="link"
        style={{ position: 'absolute', right: 18, top: 10, zIndex: 10, fontSize: 16 }}
        onClick={() => setHelpVisible(true)}
      >
        帮助
      </Button>
      <HelpModal open={helpVisible} onClose={() => setHelpVisible(false)} />

      {/* 场地图相关 */}
      <SectionCard title="场地图相关">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Switch checked={enableBgImgPoint} onChange={setEnableBgImgPoint} style={{ marginRight: 10 }} />
            <span>场地图打点</span>
          </div>
          <Space style={{ width: '100%', justifyContent: 'center' }}>
            <Tooltip title="导入场地图">
              <Upload {...bgImgUploadProps} showUploadList={false}>
                <Button icon={<PictureOutlined />} style={btnStyle} type="text" />
              </Upload>
            </Tooltip>
            <Tooltip title="导出场地图点位">
              <Button icon={<DownloadOutlined />} style={btnStyle} type="text" onClick={handleExportBgImgPoints} />
            </Tooltip>
          </Space>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 2, textAlign: 'center', display: 'block' }}>支持图片导入与点位导出</Text>
        </Space>
      </SectionCard>

      {/* 动块编辑相关 */}
      <SectionCard title="动块编辑相关">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Switch checked={enableBlockRotate} onChange={setEnableBlockRotate} style={{ marginRight: 10 }} />
            <span>调节内容转向</span>
          </div>
          <div>
            <Switch checked={moveSingleBlock} onChange={setMoveSingleBlock} style={{ marginRight: 10 }} />
            <span>可以移动单独动块</span>
          </div>
          <div>
            <Switch checked={showEntrance} onChange={setShowEntrance} style={{ marginRight: 10 }} />
            <span>显示入口</span>
          </div>
          <div>
            <Switch checked={showExit} onChange={setShowExit} style={{ marginRight: 10 }} />
            <span>显示出口</span>
          </div>
          <Divider style={{ margin: '10px 0' }} />
          <Text type="secondary" style={{ fontSize: 13, textAlign: 'center', display: 'block' }}>配置文件导入</Text>
          <Space style={{ width: '100%', justifyContent: 'center' }}>
            <Tooltip title="导入 PlayArea.json">
              <Upload {...props.uploadPlayAreaProps} showUploadList={false}>
                <Button icon={<UploadOutlined />} style={btnStyle} type="text" />
              </Upload>
            </Tooltip>
            <Tooltip title="导入 PlayAreaBlockData.json">
              <Upload {...props.uploadBlockDetailProps} showUploadList={false}>
                <Button icon={<UploadOutlined />} style={btnStyle} type="text" />
              </Upload>
            </Tooltip>
          </Space>
        </Space>
      </SectionCard>

      {/* 动块配置文件导出 */}
      <SectionCard title="动块配置文件导出">
        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Tooltip title="导出 PlayArea.json">
            <Button icon={<DownloadOutlined />} style={btnStyle} type="text" onClick={handleExportPlayArea} />
          </Tooltip>
          <Tooltip title="导出 PlayAreaBlockData.json">
            <Button icon={<DownloadOutlined />} style={btnStyle} type="text" onClick={handleExportBlockDetail} />
          </Tooltip>
        </Space>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 2, display: 'block', marginTop: 8, textAlign: 'center' }}>一键导出动块配置</Text>
      </SectionCard>
    </div>
  );
};

export default RightSider; 