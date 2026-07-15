## MODIFIED Requirements

### Requirement: BasicInfo 未完整时引导完善
若 BasicInfo 不完整，卡片 SHALL 在末尾显示「去完善你的信息」入口，点击后跳转基本信息设置页。完整性判定 SHALL 仅考察玩家 ID 与场景偏好；出生日期为纯可选彩蛋字段，SHALL NOT 计入完整性判定。

#### Scenario: 信息不完整时显示引导
- **WHEN** BasicInfo 中玩家 ID 或场景偏好为空
- **THEN** 卡片底部显示"去完善你的信息 →"，点击跳转基本信息设置

#### Scenario: 只缺出生日期不算不完整
- **WHEN** 玩家 ID 与场景偏好均已填写、仅出生日期为空
- **THEN** 卡片不显示"去完善你的信息"引导
