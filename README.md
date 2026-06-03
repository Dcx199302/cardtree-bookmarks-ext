# CardTree Bookmarks

<div align="center">

**用卡片树重新定义你的新标签页书签管理体验**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest_V3-green?logo=googlechrome)](https://developer.chrome.com/docs/extensions)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite 6](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)

</div>

## 功能特性

- **卡片树视图** — 书签文件夹以可展开/折叠的卡片形式呈现，层级清晰
- **拖拽排序** — 自定义指针事件拖拽系统，支持单选和批量拖拽、跨文件夹移动
- **橡皮筋选择** — 在空白区域拖拽即可框选多个书签
- **右键菜单** — 完整的新增、编辑、删除、移动操作
- **键盘导航** — 方向键浏览、Enter 打开、Delete 批量删除、`/` 或 Ctrl+F 聚焦搜索
- **搜索** — 实时防抖搜索，自动展开匹配的文件夹
- **回收站** — 删除的书签可在 30 天内恢复到原位置
- **左侧导航栏** — 快速跳转任意文件夹，支持拖拽调整顺序
- **主题切换** — 浅色 / 深色 / 跟随系统，毛玻璃质感 UI
- **访问追踪** — 记录书签使用频率和最近访问时间

## 安装

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Dcx199302/cardtree-bookmarks-ext.git
cd cardtree-bookmarks-ext

# 安装依赖
npm install

# 构建
npm run build
```

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `dist/` 目录

## 开发

```bash
npm run dev      # 启动 Vite 开发服务器
npm run build    # TypeScript 类型检查 + 构建
```

> **注意：** 本项目没有配置测试框架和 linter。

## 技术栈

| 技术 | 用途 |
|---|---|
| React 19 | UI 框架 |
| TypeScript 5.7 | 类型安全 |
| Vite 6 | 构建工具 |
| [@xuchengdong/cardtree-react](https://www.npmjs.com/package/@xuchengdong/cardtree-react) | 卡片树核心组件 |
| RxJS | 搜索防抖、拖拽会话管理 |

## 项目结构

```
src/
├── newtab.tsx              # 主入口组件（状态管理、拖拽、键盘导航）
├── newtab.css              # 全局样式
├── bookmarks.ts            # Chrome 书签树加载与格式转换
├── bookmarkActions.ts      # 书签 CRUD 操作
├── bookmarkTreeHelpers.ts  # 树操作纯函数（选择、过滤、增删改）
├── bookmarkDragDom.ts      # DOM 层拖拽命中测试与放置计算
├── bookmarkDragUI.tsx      # 拖拽视觉组件（幽灵、橡皮筋）
├── BookmarkDropZone.tsx    # 书签网格渲染与拖拽起始
├── BookmarkDialog.tsx      # 新增/编辑/移动对话框
├── ContextMenu.tsx         # 右键菜单
├── NavRail.tsx             # 左侧导航栏
├── SearchBar.tsx           # 搜索输入
├── FaviconImg.tsx          # 网站图标（含字母回退）
├── ConfirmDialog.tsx       # 确认对话框
├── trashStore.ts           # 回收站（chrome.storage.local）
├── visitTracker.ts         # 访问追踪（chrome.storage.local）
├── folderDisplaySettings.ts # 文件夹显示设置持久化
├── useTheme.ts             # 主题 hook
└── menuContextTypes.ts     # React Context 定义
```

## 隐私政策

本扩展不收集、传输或在外部存储任何个人数据。所有数据均通过 `chrome.storage.local` 保存在本地设备上。

完整隐私政策：[docs/privacy.html](docs/privacy.html)

## License

MIT
