import React from 'react';
import { Card, List, Checkbox } from 'antd';

interface BlockListProps {
  jsonData: any[];
  selectedIndices: number[];
  handleSelectBlock: (index: number, checked: boolean) => void;
}

const BlockList: React.FC<BlockListProps> = ({ jsonData, selectedIndices, handleSelectBlock }) => {
  return (
    <Card bordered={false} style={{ height: '100%', minHeight: 0, overflow: 'auto', margin: 0 }}>
      <List
        style={{ height: '100%', minHeight: 0, overflow: 'auto' }}
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
  );
};

export default BlockList; 