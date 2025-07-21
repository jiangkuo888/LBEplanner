import React from 'react';
import { Card, Divider } from 'antd';

interface BlockDetailProps {
  jsonData: any[];
  selectedIndices: number[];
}

const BlockDetail: React.FC<BlockDetailProps> = ({ jsonData, selectedIndices }) => {
  if (selectedIndices.length === 1) {
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
  }
  return (
    <Card bordered={false} style={{ marginBottom: 16, textAlign: 'center', color: '#aaa' }}>
      {selectedIndices.length === 0 ? '暂未选中动块' : `已选中${selectedIndices.length}个动块`}
    </Card>
  );
};

export const BlockDetailContent: React.FC<{ block: any }> = ({ block }) => {
  // 先取出常用字段
  const { Name, Index, BlockRotateZAxisValue, bShouldRotate, ...rest } = block;
  // 其余字段（Points等）
  const restEntries = Object.entries(rest).filter(([key]) => key !== 'DeltaYaw');
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{`动块信息 #${Index}`}</div>
      <Card bordered={false} style={{ margin: 0 }}>
        <ul style={{margin: 0, paddingLeft: 18}}>
          <li key="Name" style={{fontSize: 13, marginBottom: 2}}><b>Name：</b>{Name}</li>
          <li key="Index" style={{fontSize: 13, marginBottom: 2}}><b>Index：</b>{Index}</li>
          <li key="BlockRotateZAxisValue" style={{fontSize: 13, marginBottom: 2}}><b>BlockRotateZAxisValue：</b>{String(BlockRotateZAxisValue)}</li>
          <li key="bShouldRotate" style={{fontSize: 13, marginBottom: 2}}><b>bShouldRotate：</b>{String(bShouldRotate)}</li>
          {restEntries.map(([key, value]) => (
            <li key={key} style={{fontSize: 13, marginBottom: 2}}>
              <b>{key}：</b>{typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default BlockDetail; 