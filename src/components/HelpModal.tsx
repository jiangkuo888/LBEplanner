import React from 'react';
import { Modal } from 'antd';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      title="操作说明"
      open={open}
      onCancel={onClose}
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
  );
};

export default HelpModal; 