import React from 'react';
import { Button, Switch, Modal, Divider } from 'antd';
import HelpModal from './HelpModal';
import BlockList from './BlockList';
import BlockDetail from './BlockDetail';

interface SidebarProps {
  selectedIndices: number[];
  jsonData: any[];
  handleSelectBlock: (index: number, checked: boolean) => void;
  blockDetailData: any[];
}

const Sidebar: React.FC<SidebarProps> = (props) => {
  const {
    selectedIndices, jsonData, handleSelectBlock, blockDetailData
  } = props;

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 只保留顶部的动块列表 */}
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>动块列表</div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <BlockList jsonData={jsonData} selectedIndices={selectedIndices} handleSelectBlock={handleSelectBlock} />
      </div>
      {/* Powered by 信息已移除 */}
    </div>
  );
};

export default Sidebar; 