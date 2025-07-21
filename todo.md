# LBEplanner 项目重构方案与任务清单

## 目标
将所有核心功能从单一的 App.tsx 拆分为结构清晰、易维护、易扩展的多模块项目。

---

## 1. 组件分层与拆分
- [ ] App.tsx 只保留顶层布局和全局状态管理，移除具体渲染和业务逻辑。
- [ ] 新建 components/ 目录，拆分如下组件：
  - [ ] Sidebar.tsx：侧边栏（功能区、导入导出、开关等）
  - [ ] CanvasView.tsx：PixiJS画布容器，负责渲染和交互
  - [ ] BlockList.tsx：动块层级/列表视图
  - [ ] BlockDetail.tsx：动块属性面板
  - [ ] HelpModal.tsx：帮助说明弹窗

## 2. PixiJS 渲染与逻辑抽离
- [ ] 新建 pixi/ 目录，拆分 PixiJS 相关逻辑：
  - [ ] drawBlocks.ts：动块渲染
  - [ ] drawGrid.ts：网格渲染
  - [ ] pixiUtils.ts：通用PixiJS工具函数

## 3. hooks 与工具函数
- [ ] 新建 hooks/ 目录，封装常用业务逻辑：
  - [ ] useBlocks.ts：动块数据与操作
  - [ ] useBackgroundImage.ts：场地图与打点逻辑
  - [ ] useUndoRedo.ts：撤销/重做逻辑
- [ ] 新建 utils/ 目录，抽离通用工具：
  - [ ] deepClone.ts
  - [ ] fileUtils.ts

## 4. 类型定义
- [ ] 新建 types/ 目录，集中管理 TypeScript 类型：
  - [ ] BlockData.ts
  - [ ] Point.ts

## 5. 状态管理优化
- [ ] 评估是否引入 React Context 或 Redux 进行全局状态管理，解耦组件间数据流。
- [ ] 将撤销/重做、动块数据、选中状态等全局状态迁移到 Context/Redux。

## 6. 逐步重构建议
- [ ] 先拆分 UI 组件（Sidebar、BlockList、HelpModal 等），让 App.tsx 只负责顶层状态。
- [ ] PixiJS 相关逻辑抽到 CanvasView 组件和 pixi/ 目录。
- [ ] 工具函数、类型定义逐步抽离到 utils/ 和 types/。
- [ ] 逐步引入 Context 或 Redux 做全局状态管理。
- [ ] 每次重构只做一小步，保证功能不变，便于回滚和测试。

---

> 建议每完成一项，及时 commit 并测试，确保重构过程安全可控。 