# Proposal: remove-reminder-entry

## Why

「主动提醒」自设计之初就受微信订阅消息的硬限制（一次性授权、每发一次耗一次、长期订阅类目不适用），要真正兑现"每天提醒"必须引入产品的第一个有状态后端（openid 登录、订阅表、定时发送），且只能触达"昨天来过的人"。2026-07-10 决策：**提醒不做进产品**——未来若要提醒用户，由产品外的公众号/服务号渠道承接（关注即用户主动选择被提醒，与"记忆不追人"红线天然一致），产品内不保留任何提醒入口与代码。

## What Changes

- 移除设置弹层的「主动提醒（去开启提醒）」列表项及 `requestReminder` 实现（`NavBar.vue`）
- `VITE_WX_SUBSCRIBE_TEMPLATE_ID` 不再是上线前配置项，从上线清单移除
- 人工验收清单 §6 相应删项

## Capabilities

### Modified Capabilities

- `settings`: 设置弹层从三项减为两项（基本信息 / 隐私政策）

## Impact

- **组件**: `src/components/NavBar.vue`（删除入口与方法）
- **文档**: `manual_acceptance_checklist_v2.md` §6、`product_handoff.md` 上线清单
- **不影响**: 其余设置项行为、隐私政策入口、基本信息编辑
