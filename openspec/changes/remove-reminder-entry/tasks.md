# Tasks: remove-reminder-entry

## 1. 代码移除

- [x] 1.1 `NavBar.vue`：删除「主动提醒（去开启提醒）」列表项
- [x] 1.2 `NavBar.vue`：删除 `requestReminder` 方法及相关注释（产品内不再引用 `VITE_WX_SUBSCRIBE_TEMPLATE_ID` / `uni.requestSubscribeMessage`）

## 2. 文档同步

- [x] 2.1 `manual_acceptance_checklist_v2.md` §6：6.1 改为两项，删除 6.3 主动提醒验收项（后续项顺延）
- [x] 2.2 `product_handoff.md`：上线前清单移除模板 ID 配置项，标注 2026-07-10 决策（提醒移出产品，公众号/服务号方向承接）

## 3. 验证

- [ ] 3.1 H5 + mp-weixin：⚙ 弹层只显示 基本信息 / 隐私政策 两项，功能正常
