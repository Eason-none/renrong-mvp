# settings Delta

## MODIFIED Requirements

### Requirement: 设置弹层列表项
设置弹层 SHALL 展示两个列表项（按显示顺序）：「基本信息」、「隐私政策」。点击「基本信息」进入基本信息编辑页（见 basic-info-settings spec）；「隐私政策」行为不变。产品内 SHALL NOT 存在任何主动提醒入口或订阅消息调用（提醒由产品外渠道承接，见 remove-reminder-entry proposal）。

#### Scenario: 设置弹层展示两个列表项
- **WHEN** 用户点击 ⚙ 打开设置弹层
- **THEN** 弹层显示两个列表项：「基本信息」排在最上方，下方为「隐私政策」，无「主动提醒」项

#### Scenario: 点击基本信息
- **WHEN** 用户在设置弹层点击「基本信息」
- **THEN** 关闭设置弹层，打开基本信息编辑页

#### Scenario: 点击隐私政策（行为不变）
- **WHEN** 用户点击「隐私政策」
- **THEN** 行为与当前一致（弹层内切换为隐私政策占位文本）
