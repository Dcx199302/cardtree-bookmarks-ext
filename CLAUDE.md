# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CardTree Bookmarks Extension — 一个 Chrome 新标签页扩展（Manifest V3），使用卡片树形式展示和管理书签。UI 语言为中文（zh-CN）。

技术栈：React 19 + TypeScript + Vite 6，依赖核心组件库 `@xuchengdong/cardtree-react`。

## 常用命令

```bash
npm run dev      # 启动 Vite 开发服务器
npm run build    # tsc 类型检查 + Vite 构建，输出到 dist/
```

- 无测试框架、无 linter 配置
- 构建产物在 `dist/` 目录，可直接作为 Chrome 解压扩展加载
- Vite 构建后会执行自定义 post-build 步骤：移除 `type="module"` 并将 `manifest.json` 和 `icons/` 复制到 `dist/`

## 架构概览

### 数据流

Chrome Bookmarks API 是唯一数据源。`bookmarks.ts` 将 Chrome 书签树转换为 `CardTreeNode<BookmarkItem[]>[]` 格式。所有操作通过 `chrome.bookmarks` API 写入后，进行乐观本地状态更新。Chrome 书签变更事件（`onCreated`/`onRemoved`/`onChanged`/`onMoved`）触发防抖重载作为兜底同步。

### 状态管理

全部状态通过 `NewTab` 组件中的 React hooks 管理，无外部状态库。`MenuContext`（定义在 `menuContextTypes.ts`）通过 React Context 向子组件共享 API。

### 核心文件职责

| 文件 | 职责 |
|---|---|
| `src/newtab.tsx` | 主组件，~1400 行，包含所有状态、拖拽逻辑、键盘导航、书签事件监听 |
| `src/bookmarks.ts` | 加载 Chrome 书签树并转换为 CardTree 节点格式 |
| `src/bookmarkActions.ts` | `chrome.bookmarks` API 的薄封装（CRUD + 移动） |
| `src/bookmarkTreeHelpers.ts` | 纯函数：树的选择、范围选、过滤、增删改节点 |
| `src/bookmarkDragDom.ts` | DOM 层拖拽：命中测试、行检测、放置索引计算、回流动画 |
| `src/bookmarkDragUI.tsx` | 拖拽视觉组件：浮动幽灵、橡皮筋选择、批量菜单 |
| `src/BookmarkDropZone.tsx` | 渲染卡片内书签网格，处理拖拽起始事件 |
| `src/BookmarkDialog.tsx` | 新增/编辑/移动对话框 |
| `src/ContextMenu.tsx` | Portal 右键菜单 |
| `src/NavRail.tsx` | 左侧导航栏，支持拖拽排序（使用 RxJS） |

### 持久化存储

使用 `chrome.storage.local`，分散在三个模块中：
- `trashStore.ts` — 回收站（30天过期，上限200条）
- `visitTracker.ts` — 访问频率/最近使用追踪
- `folderDisplaySettings.ts` — 每个文件夹的显示大小、折叠状态、导航栏顺序

### 拖拽系统

自定义 pointer-event 实现（非 HTML5 Drag API），支持单选/批量拖拽、跨文件夹移动、自动滚动、橡皮筋选择。RxJS 用于搜索防抖（`Subject` + `debounceTime`）和拖拽会话管理（`fromEvent`）。

### Chrome 权限

`bookmarks`、`storage`、`favicon`、`sessions`、`tabs`

## 开发注意事项

- 扩展不能使用 ES module script，Vite post-build 会自动将 `type="module" crossorigin` 替换为 `defer`
- Favicon 使用 `chrome://favicon` API，非 Chrome 环境无法获取
- TypeScript strict 模式，目标 ES2020，JSX 使用 `react-jsx`
- `CardTree` 组件来自外部库，其样式需单独引入 `@xuchengdong/cardtree-react/styles/cascade.css`
