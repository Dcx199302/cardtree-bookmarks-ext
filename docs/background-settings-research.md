# 背景设置设计调研

调研日期：2026-11-03。

## 竞品观察

### Tabliss

- 官网明确将背景分为 Unsplash / GIPHY / 纯色 / 渐变 / 自己的图片：<https://tabliss.io/>
- 源码中的本地图设置支持多选上传、缩略图网格、单图删除，并提示大图可能影响性能：<https://github.com/joelshepherd/tabliss/blob/main/src/plugins/backgrounds/image/ImageSettings.tsx>
- 背景显示设置提供模糊与明暗度调节：<https://github.com/joelshepherd/tabliss/blob/main/src/views/settings/Background.tsx>
- 其本地图设置明确提示“不同步到其他设备”。

### nightTab

nightTab 将背景抽象为主题色、强调色、纯色、渐变、图片与视频，并为图片提供 URL、模糊、灰度、缩放、透明度与晕影等高级控制：<https://github.com/zombieFox/nightTab/blob/main/src/component/menuContent/themeSetting/index.js>。

## 设计结论

主流产品的共性不是暴露所有滤镜，而是先保证完整基础链路：

1. 内置图与自定义图进入同一个预览选择模型。
2. 上传后立即生成缩略图并可直接应用。
3. 本地图需要可删除、可管理，并控制数量。
4. 大图必须限制尺寸或压缩，避免拖慢新标签页。
5. 壁纸必须与主题文字解耦，控件应有独立表面。
6. 明暗度 / 模糊等可读性控制保留为少量通用参数。

## CardTree 的实现取舍

- 采用“内置图片 + 本机图片上传”，暂不做远程 URL 与视频背景：避免 CSP、网络权限、热链接失效和性能问题。
- 静态本地图经 Canvas 统一压缩为 WebP，最长边不超过 3200px，单张存储不超过 4MB，来源文件不超过 20MB。
- 动态 GIF / WebP / APNG 保留原始帧数据，不做破坏动画的 Canvas 转码；单张不超过 10MB、最长边不超过 3200px。
- 自定义图片保存在 IndexedDB，偏好设置仍保存在 `chrome.storage.local`。
- 最多保留 12 张自定义背景，上传后自动选中新图，删除当前图时自动回退。
- Header 将品牌、搜索与操作区收进同一块玻璃面板，背景与面包屑保持一致，适配默认背景与任意亮度的自定义壁纸。
- 保留遮罩与模糊两个通用可读性参数；灰度、缩放、晕影等高级滤镜暂不实现，避免设置界面过度膨胀。
