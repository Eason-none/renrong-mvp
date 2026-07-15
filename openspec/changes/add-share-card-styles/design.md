# add-share-card-styles — Design

## Context

ShareCardPreview.vue 现状：单遍 layout(ctx, draw) 两跑（量高/落笔），mp 走同层 2d canvas + legacyCtxAdapter，H5 走旧 createCanvasContext。样机定稿 3 版式 × 5 纸样。

## Goals / Non-Goals

**Goals:** 版式/纸样轻选择即换即渲染；信笺线逐行对齐正文；压花叶与 CompletionBeat 同源；红线（无计数、model 字段不变）保持。

**Non-Goals:** 贴纸、自由拖拽、自定义颜色（第二档）；回顾信纸卡的版式变化（信纸形态固定，只换纸样）。

## Decisions

1. **选择为组件态**（layoutStyle/paper 两个 data 字段），切换后 saved 状态失效重渲染——与"节选/全文"完全同构，不落库不上报。
2. **纸样在背景阶段绘制**（paper 底色替换 C.paper + 图案在卡面 roundRect clip 内平铺）；信笺线例外——随正文文字行内联绘制（先线后字），天然对齐每一行（含摘句大字距）。
3. **压花叶用程序绘制**（bezier 轮廓+中轴+四侧脉，40×100 坐标系缩放/旋转复用），adapter 补 translate/rotate/scale/bezierCurveTo（H5 旧接口原生支持这四个方法）。叶影每 120px 瓦片两片，各倾斜 -24°/+31°。
4. **照片开窗只取首图、cover 裁切**：这是用户看样机后选择的版式语义，"只缩不裁"约束仍适用于标本页拼贴，不适用于开窗（开窗即取景框）。无照片时不出现该选项；照片解析失败自动回落标本页。
5. **胶带移到内容之后绘制**：开窗版式照片顶到卡沿，胶带需压在照片上（物理隐喻本来如此）；其余版式内容不与胶带重叠，z 序调整无视觉差异。
6. **水彩晕用径向渐变**：2d 端 createRadialGradient、旧接口端 createCircularGradient，加能力探测，都没有就退化为纯色底（水彩晕仅在极老基础库缺失，可接受）。

## Risks / Trade-offs

- [瓦片图案循环绘制的性能] → 一次性绘制、非动画路径；苔点/宣纸点阵每卡约数千次 1px fillRect，实测同层 canvas 毫秒级。
- [归档顺序] → share-card 主 spec 属 add-share-cards（未归档），本变更须在其后归档，否则 delta 无宿主。
