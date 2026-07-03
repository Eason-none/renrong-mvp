# Spec: 丰容（Enrichment）MVP — v1

> 源文档：`product_handoff.md` v5、`content_library_draft_v1.json`。
> 本文件把 PRD 叙事文档里已敲定的决策，转成可直接用于实现的数据模型 + 验收标准。
> 第九节里仍标记"待讨论"的事项（视觉风格/产品命名/设置UI形式/后端代理形态/主题候选池产出）不在本版范围内，见文末 Open Questions。

---

## 1. Objective

**产品名**：人类丰荣指北

**做什么**：一个反焦虑/丰容类小程序（MVP 阶段为本地 H5）。用户被外部信息引发焦虑时，打开它，走"呼吸引导 → 选场景 → 接收一件通用小事 → 去做 → 回来确认完成 → 可选与AI聊聊"的主线流程；同时有一个独立的"图鉴"收集系统，用户可主动解锁、完成更深度的内容，积累到 100% 时获得一段 AI 生成的回顾叙事。

**用户**：16–26岁，被信息流触发焦虑、缺乏内在坐标系的学生/职场新人。

**MVP 成功标准**（不是上线标准，是"设计是否经得起实跑"的标准）：开发者本人能在本地 H5 跑通主线流程 + 图鉴解锁/完成/回顾全链路，且所有跨时间状态（名额、解锁状态、完成度、归档对话、回顾快照）在刷新/关闭重开后保持一致。

---

## 2. Domain Model

以下实体与状态机是本文档的核心产出——product_handoff.md 用叙事描述了规则，这里给出可直接落地的结构。

### 2.1 实体定义

```
PushContentItem（推送层内容，全局共享池，不属于任何图鉴）
  id: string
  title: string
  time: string                      // 展示用，不参与逻辑
  scene: ("室内短" | "室内久" | "室外")[]   // 可多选
  sensory_tag: string                // 仅展示/管理用，不参与过滤逻辑
  instructions: string
  gentle_note?: string

CollectionItem（图鉴条目）
  id: string
  collection_id: string
  title: string
  time: string
  condition: string                  // 仅展示给用户，不参与过滤/判定
  instructions: string
  starter_cue?: string               // 字段保留，MVP不使用
  gentle_note?: string

Collection（图鉴）
  id: string
  name: string
  intro: string
  items: CollectionItem[]

CompletionEvent（完成事件 —— "做完啦"按钮产生）
  id: string
  content_id: string                 // 指向 PushContentItem 或 CollectionItem
  content_type: "push" | "collection_item"
  collection_id?: string             // content_type == "collection_item" 时必填
  completed_at: timestamp

Conversation（对话 —— 每个 CompletionEvent 最多一个，且互相隔离）
  id: string
  completion_event_id: string        // 1:1，绑定到具体一次完成事件
  messages: { role: "user"|"assistant", content: string, image?: string }[]
  archived: boolean
  archived_at?: timestamp
  user_message_count: number         // 用于"每满5轮弹一次温和确认"的计数

CompletionSummary（完成摘要 —— 对话归档时生成，可为空）
  id: string
  content_id: string
  completed_at: timestamp            // 与对应 CompletionEvent 一致，用于排序/匹配
  summary_text: string | null        // null = 该次完成没有对话可总结

UnlockSlotBalance（解锁名额余额 —— 全局单一计数器，不分来源）
  count: number                      // 只增不因放弃图鉴而减少为负；锁回去时 +1

CollectionUnlockState（每个图鉴的解锁状态机，见 2.2）
  collection_id: string
  status: "locked" | "unlocked_not_started" | "in_progress" | "completed"
  unlocked_at?: timestamp
  granted_slot_at_50pct: boolean     // 棘轮标记：是否已发过50%名额
  triggered_review_at_100pct: boolean // 棘轮标记：是否已触发过首次回顾

ReviewSnapshot（回顾快照）
  id: string
  collection_id: string
  sequence: 1 | 2                    // 最多两次
  generated_at: timestamp
  text: string
  source_summary_ids: string[]       // 本次回顾实际引用到的完成摘要
  first_review_text_ref?: string     // sequence==2 时引用 sequence==1 的 text
```

### 2.2 图鉴状态机（核心，product_handoff.md §5.3 / §5.3.0 / §5.3.1 的结构化版本）

```
                 [首次自选3个 / 消耗1名额+二次确认]
locked  ────────────────────────────────────────▶ unlocked_not_started
                                                        │   │
                                "锁回去"(退还1名额) ◀─────┘   │ 完成该图鉴下任意1个条目
                                                            ▼
                                                      in_progress
                                                            │ distinct_done / total == 100%
                                                            ▼
                                                       completed
                                                  （无法再退回任何状态）
```

- **完成度公式**：`completion_pct(collection) = count(distinct content_id in CompletionEvent where collection_id == X) / count(items in collection X)`。重做同一 `content_id` 不增加分子。
- **"进行中"占位规则（§5.3.0）**：`status ∈ {unlocked_not_started, in_progress}` 的图鉴数量任何时刻 ≤ 4。解锁新图鉴前，若已达4个，必须先让某个图鉴变成 `completed` 或被"锁回去"。
- **棘轮规则（§5.3.1 / §5.4.2）**：
  - `granted_slot_at_50pct` 一旦置 true 永不复位；即使后续内容库扩容导致 `completion_pct` 回落到50%以下，也不收回已发的名额。
  - `triggered_review_at_100pct` 同理，首次回顾一旦生成不可撤销。
  - 但**界面展示的 `completion_pct` 永远按当前真实分母计算**，不因棘轮已触发而封顶或隐藏。
- **可放弃性**：仅 `unlocked_not_started` 状态可"锁回去"（退1个名额，状态回到 `locked`）。`in_progress` 状态没有任何退出路径，唯一出口是做到100%。

### 2.3 推送层去重（product_handoff.md §5.1.1 + content_library_draft_v1.json `_说明` 澄清）

> **关键澄清**：`content_library_draft_v1.json` 的 `_说明` 字段明确写了"推送层去重按 content_id **全局**记录（跨场景共享）"——这比 §5.1.1 正文字面"该场景下"更精确，本 spec 以 json 的澄清为准：去重状态是 `Set<content_id>`，不分场景维护。

```
GetPushCandidate(scene):
  pool = PushContentItem where scene ∈ item.scene
  available = pool - GlobalDoneSet           // 全局已做过集合，不分场景
  if available is empty:
    GlobalDoneSet = GlobalDoneSet - pool      // 仅重置"这个场景池子覆盖到的条目"，无提示
    available = pool
  return random_pick(available)
```

- "换一个"刷新：从 `available` 中重新随机抽取，不写入 `GlobalDoneSet`，同一推送实例内最多刷新3次；第4次起前端展示固定语气文案，不再刷新。
- 点击"做完啦"才把该 `content_id` 写入 `GlobalDoneSet`（生成 `CompletionEvent`，`content_type: "push"`）。

### 2.4 归档与摘要生成时序（product_handoff.md §5.4 / §6.5.2 / §6.5.3）

```
CompletionEvent 创建
  → 前端弹出固定文案邀请聊天（可跳过）
  → [可选] 创建 Conversation（completion_event_id 绑定）
       → 每条用户消息 user_message_count += 1
       → user_message_count % 5 == 0 时弹一次温和确认窗（非阻断，打字即关闭）
       → 用户点"归档" → 触发归档流程
  → 归档流程（无论主动/被动触发）：
       conversation.archived = true; archived_at = now
       if conversation.messages 非空:
         调用轻量模型(DeepSeek等) 生成 ≤100字摘要 → 写入 CompletionSummary
       else:
         CompletionSummary.summary_text = null

图鉴100%触发（CollectionUnlockState.status → completed，且 triggered_review_at_100pct == false）：
  1. 先用当前已存在的 CompletionSummary（仅来自已归档对话）生成 ReviewSnapshot(sequence=1)
  2. 生成完成后，再把该图鉴下当时仍 archived==false 的 Conversation 统一被动归档
  3. triggered_review_at_100pct = true
```

**验证重点**：第1步必须在第2步之前执行——否则"被动归档刚好补全的摘要"会错误地混进首次回顾素材，导致首次回顾内容不可复现（影响"快照定格"语义）。

---

## 3. Functional Specs（按功能点，含验收标准）

### 3.1 推送层抽取与去重

- **AC1**：Given 用户选择场景"室内短"，When 请求推送，Then 返回的内容必须满足 `"室内短" ∈ item.scene`，且 `content_id ∉ GlobalDoneSet`。
- **AC2**：Given 某场景下所有内容都已做过一轮，When 再次请求推送，Then 系统静默重置该场景覆盖到的 `GlobalDoneSet` 子集并正常返回一条内容，前端不展示任何"已重置"提示。
- **AC3**：Given 用户已对当前推送内容点击"换一个"3次，When 再次点击"换一个"，Then 不再刷新，展示固定的"建议休息"语气文案。
- **AC4**：Given 用户点击"换一个"，When 刷新发生，Then 不修改 `GlobalDoneSet`（即同一条内容理论上可能被刷新到第4次又刷回第1次出现的内容）。

### 3.2 完成判定 + 聊聊邀请

- **AC1**：Given 用户点击"做完啦"，When 处理该点击，Then 立即创建 `CompletionEvent`（无需任何验证/评分），且不依赖是否随后聊天。
- **AC2**：Given `CompletionEvent` 创建成功，Then 立即展示统一固定邀请文案（全产品一句，不区分内容类型），用户可跳过。
- **AC3**：Given 用户跳过聊天，Then 不创建 `Conversation`，对应 `CompletionSummary.summary_text` 视为 null（回顾素材里标记为"只知道完成了这件事"）。

### 3.3 对话归档

- **AC1**：Given 一个未归档的 `Conversation`，When 用户消息数达到5的倍数，Then 弹出温和确认窗；用户继续打字而不理会时，窗口让位，状态不变（不能阻断输入）。
- **AC2**：Given 用户点击"归档"按钮（无论是否触发了确认窗），Then `Conversation.archived = true`，且若 `messages` 非空则触发摘要生成调用。
- **AC3**：Given 一个 `Conversation` 始终未被用户主动归档，When 没有任何图鉴100%事件发生，Then 该对话保持未归档状态，系统不做超时/被动清理。

### 3.4 图鉴解锁与名额

- **AC1**：Given 用户首次进入产品（无任何解锁记录），When 进入图鉴选择，Then 允许自主选择恰好3个图鉴进入 `unlocked_not_started`，不消耗名额。
- **AC2**：Given 某起始图鉴仍处于 `unlocked_not_started`（completion_pct == 0），When 用户选择换选，Then 该图鉴回到 `locked`，且可立即重新任选一个其他图鉴，此过程不读写 `UnlockSlotBalance`。
- **AC3**：Given 某图鉴 completion_pct 首次 ≥ 50%（`granted_slot_at_50pct == false`），When 系统检测到该跨越，Then `UnlockSlotBalance.count += 1` 且 `granted_slot_at_50pct = true`；此后即使 completion_pct 因分母变化回落到50%以下，不触发任何回收逻辑。
- **AC4**：Given `UnlockSlotBalance.count ≥ 1` 且当前"进行中"图鉴数 < 4，When 用户点开一个 `locked` 图鉴并二次确认解锁，Then `count -= 1`，该图鉴状态 → `unlocked_not_started`。
- **AC5**：Given 当前"进行中"图鉴数已达4，When 用户尝试消耗名额解锁新图鉴，Then 阻止该操作，要求先腾出位置（锁回去一个 `unlocked_not_started` 图鉴，或把某个 `in_progress` 图鉴做到100%）。
- **AC6**：Given 一个图鉴处于 `in_progress`（已开始，completion_pct ∈ (0,100)），Then 不提供任何"放弃/退还名额"入口。

### 3.5 回顾生成

- **AC1**：Given 图鉴 completion_pct 首次达到100%（`triggered_review_at_100pct == false`），When 触发检测，Then 异步生成 `ReviewSnapshot(sequence=1)`，输入仅为当前已归档对话产生的 `CompletionSummary` 集合；生成完成后才将该图鉴下仍未归档的对话统一被动归档。
- **AC2**：Given 某图鉴下所有完成事件均无摘要（用户全部跳过聊天），When 生成回顾，Then 使用 §5.4.2 给定的固定兜底文案模板，不调用模型生成自由文本。
- **AC3**：Given 用户点进"丰荣探索"图鉴卡片提示但回顾仍在生成中，Then 展示邀请式加载文案（非系统进度条语气）。

### 3.6 内容评判（Gate 0 / Gate 1，运营产出新内容时使用，非运行时逻辑）

- **AC1**：新增任意内容条目前，必须人工核对 Gate 0 三条（具体可执行 / 不说教 / A类或B类陌生感）与 Gate 1（推送层三条全满足 或 图鉴层至少一条加分项），并在内容库文件的描述字段标注判定结果。
- 这是**内容生产流程的检查清单**，不需要写成运行时代码校验（产品决策：内容质量由人工把关，不做自动化关键词审查，避免误杀合理表达）。
- **核对 Gate1 时的具体顺序（2026-06-23 doubt-driven复核新增约束，避免重犯同一个错）**：
  1. 先给条目一个真实合理的时长估计，检查是否满足①（时长明显更长/持续过程）——已批准的 color_004/006/008 都是靠①过关，不是靠②，不要默认"短=必须靠产出补救"
  2. 仅当①不成立时才考虑②（转化产出/结构性重组）；②指的是**用户自己生成的觉察记录**（写下来/录下来/给感受配画面），不包括"动作在外部世界留下某种痕迹"（如发出一条消息、宠物有了反应）——这类痕迹不算①②任一项，是范畴误判
  3. 若涉及②且要用"录下"，仅限**用户自己的独白**；条目若涉及同住人/陌生人/动物，"录下"选项禁用（隐私同意问题），只能走"写下"或放弃②
  4. 若①②都不成立（如纯瞬时性动作：对视、单次发消息、瞬间猜测），不要用"拉长时长"硬套——拉长时长对这类动作经常在物理/语义上不成立，应直接判定该条目不适合当前图鉴，搁置或改写动作本身
  5. 若加②的"写下/录下"步骤，必须配上想法图鉴 idea_004/005 式的免责语气（"不用回看""不用说得好"），否则会把无表演压力的覺察动作变成任务感的自我记录，反而撞上 Gate0 不说教/原则二无表演压力的红线

---

## 4. Tech Stack（已敲定部分，照抄 product_handoff.md §8 + 本轮新增前端选型决策）

| 项 | MVP 阶段 | 生产阶段（小程序） |
|---|---|---|
| 前端框架 | **uni-app（Vue3 语法）+ Vite**（本轮新增决策，见§5） | 同一份代码，编译为 `mp-weixin` 产物 |
| 持久化 | `uni.setStorageSync`/`uni.getStorageSync`（编译到H5时底层走localStorage，编译到小程序时底层走`wx.setStorageSync`，业务代码不直接碰这两个原生API，统一走uni-app的存储抽象） | 同（同一套调用） |
| 主对话模型 | Qwen 系列（具备视觉理解），文字与图片走同一模型，不做路由 | 同 |
| 摘要生成模型 | DeepSeek 等轻量模型，与主对话模型解耦 | 同 |
| 后端 | 无代理，前端直连模型 API | 自建代理 / 微信云函数（待评估，§9.7） |
| 图片输入 | 前端转 base64，建议压缩至1MB内，jpg/png/gif/webp | 同 |
| 语音输入 | 提示用户用系统语音转文字后粘贴 | 同（可后续接入ASR API） |

---

## 5. Project Structure / Code Style / Commands

**前端框架决策（本轮新增，原 Open Question #6 已解决）**：

- **选型**：uni-app（Vue3语法）+ Vite。原因：用户最终要同时部署到 GitHub（H5网页）和微信小程序，uni-app 是"一份Vue代码、编译出两份产物"的框架，避免两端各写一套UI；若选原生WXML手写小程序，则GitHub那份网页需要完全独立的另一套实现，工作量翻倍且两边逻辑容易不一致。
- **开发方式**：全程通过 Claude Code 在终端驱动，不依赖 HBuilderX 图形IDE。微信开发者工具**只在"编译产物预览+提交审核"这一个环节使用**，不用于日常写代码。
- **Commands**（标准 uni-app CLI 项目）：
  ```
  开发预览H5：    npm run dev:h5
  构建H5产物：    npm run build:h5        → 产物部署到 GitHub Pages
  构建小程序产物： npm run build:mp-weixin → 产物在微信开发者工具里预览/提交审核
  ```
- **存储调用约束**：业务代码统一使用 `uni.setStorageSync` / `uni.getStorageSync`，**不直接调用** `localStorage` 或 `wx.setStorageSync`——这是 2.1 节 `UnlockSlotBalance`/`CollectionUnlockState` 等实体持久化时必须遵守的实现细节，确保同一套读写逻辑在H5和小程序产物里都成立。
- **Project Structure / Code Style 细节**（具体目录划分、组件命名规范等）：留待 `planning-and-task-breakdown` 阶段、真正开始写第一个任务时再补——框架已定，但还没有任何代码产出，此刻写更细的目录规范仍是无依据的猜测。

---

## 6. Testing / Verification Strategy（MVP 无自动化测试框架，人工验收清单）

MVP 阶段目标是"验证设计而非验证代码"，所以验证手段是**人工走查场景**，覆盖本文档第3节每条 AC，重点是跨时间状态的正确性（因为这是 localStorage 持久化要专门验证的部分，普通单次会话测试不出来）：

1. **棘轮验证**：手动让某图鉴内容库新增条目（修改 JSON），确认已发名额/已生成回顾不被撤销，但展示的完成度按新分母重新计算。
2. **刷新关闭验证**：在图鉴 in_progress / 名额余额非零 / 有未归档对话 的状态下刷新浏览器，确认三者都从 localStorage 正确恢复。
3. **并发上限验证**：手动累积≥2个名额，依次解锁到第4个图鉴后尝试解锁第5个，确认被阻止；锁回去一个未开始的图鉴后立即可解锁第5个。
4. **回顾顺序验证**：构造"图鉴100%触发时仍有未归档对话"的场景，确认回顾生成使用的摘要不包含触发后才补全的摘要（验证2.4节时序）。
5. **摘要为空验证**：完整走完一个图鉴但全程跳过聊天，确认回顾使用固定兜底文案而非模型生成内容。

---

## 7. Boundaries

- **Always**：任何涉及完成度/名额/进度的新功能，落地前对照"数值不可见原则"（§十）和"功能服务于什么优先于怎么做"原则（§十，已写入用户全局 CLAUDE.md）；任何状态机变更需要先更新本 spec 再改实现。
- **Ask first**：要往 `CollectionUnlockState`/`ReviewSnapshot` 等核心数据结构加新字段或新状态分支；要改变棘轮（一旦触发不可逆）这条不变量；要给内容评判 Gate 0/1 加自动化校验逻辑（目前是人工把关，自动化会引入误杀风险，需要先确认）。
- **Never**：把"完成度"以具体数字/百分比/进度条形式暴露给用户界面；让"归档"或"聊天与否"影响完成度计算或解锁判定（两者必须保持解耦，这是产品立场而非技术细节）；做被动/超时自动归档对话。

---

## 8. Success Criteria（本 spec 范围内）

- [ ] 3.1–3.6 全部 AC 在本地 H5 + localStorage 环境下手动验证通过
- [ ] 图鉴状态机（2.2节）四个状态间的所有合法转移均可触发，非法转移（如 in_progress 放弃）均被阻止
- [ ] 棘轮规则在内容库扩容场景下表现正确（见第6节验证1）
- [ ] 三段 System Prompt（product_handoff.md §11）接入主对话/摘要/回顾三处调用点，注入变量与文档定义一致

---

## 9. Open Questions（不在本版范围，待后续处理）

1. **视觉风格**（product_handoff.md §9.2）——尚未设计，作者计划自行对比竞品后再讨论
2. ~~产品命名~~（已解决）：**人类丰荣指北**
3. ~~"设置"角标UI呈现形式~~（已解决，2026-06-23）：**弹层列表**（内容只有2条：主动提醒入口+隐私政策，独立页面的扩展性优势不成立——文档已明确不再扩展更多设置项）
4. ~~小程序后端代理技术形态~~（已解决，2026-06-23）：**微信云函数**（单人开发+Claude Code驱动，零运维，天然在小程序域名白名单内；自建Node服务的可移植性优势在当前无脱离微信生态意图的前提下不成立）
5. **内容库尾巴（范围已缩小，结论已修正）**——~~"连接/陪伴""物件/旧物"两个待验证主题可行性~~主题级可行性已验证（2026-06-23：可生成性/差异化均通过），均转入已确认候选，候选池现共24个主题。但经 doubt-driven 复核（同日）发现：当时写的17条试写样例本身约80%只满足Gate0、未满足Gate1（深度不够，更接近推送层量级却又因依赖condition进不了推送层），**不能当作已验证质量达标的定稿内容**，已撤回过于乐观的"验证通过"措辞，改为在 `content_library_draft_v1.json` 里记录一套具体的生产约束（见§3.6新增的Gate1核对顺序）。**仍未完成**：24个主题的正式条目产出，留到内容运营阶段批量生产时按新约束执行
6. ~~MVP 前端技术选型~~（本轮已解决，见§4、§5）：uni-app（Vue3）+ Vite，全程 Claude Code 终端开发，构建产物分别部署 GitHub Pages（H5）和微信开发者工具（小程序审核发布）；存储统一走 `uni.setStorageSync`/`getStorageSync` 抽象

---

## 10. Implementation Plan（Phase 2，本轮新增）

视觉风格仍未定，但不阻塞实现顺序——下面的P0-P11都不依赖视觉风格，UI阶段先用无样式的默认布局搭功能，样式确定后再统一套皮肤。

### 10.1 构建顺序

```
P0  项目脚手架
P1  存储抽象层
P2  内容库加载
P3  核心状态机（推送去重/图鉴状态机/完成度/棘轮/名额）   ← 风险最高，优先打磨
P4  对话与归档状态层（CompletionEvent/Conversation/归档时序）
P5  UI shell（两tab+角标导航骨架，先接mock数据）         ← 可与P3/P4并行
P6  接入真实API（Qwen主对话+DeepSeek摘要+三段system prompt注入）
P7  主线流程串联（呼吸引导→场景→推送→做完啦→聊聊→归档）
P8  图鉴系统UI（探索网格/解锁二次确认/锁回去/4个上限提示）
P9  回顾UI（卡片提示/加载态/回顾叙事/历史回顾角标）
P10 设置角标（弹层：主动提醒入口+隐私政策）              ← 随时可独立做，不依赖其他阶段
P11 端到端人工验收（走完§6五条验证清单，覆盖H5和mp-weixin两端产物）
```

**依赖关系**：P0→P1→P2→P3→P4 是严格顺序（每层依赖下一层的数据结构）；P5可在P3开始后立即并行（用mock数据搭壳，等P3/P4完成后再替换成真实状态）；P10任何时候插入都不影响其他阶段；P6必须等P3/P4的纯函数层稳定后才接，否则状态机bug和API调用bug会混在一起难以定位。

**每阶段的验证checkpoint**：P0验证两端产物都能跑空项目；P1验证"写入→读出"一致；P2验证能查到全部已知图鉴/推送条目；P3验证§6验证清单第1/3项（棘轮、并发上限）；P4验证§6验证清单第4项（回顾时序）；P6验证一次完整对话→归档→摘要生成链路跑通；P11是最终全量验收。

### 10.2 风险与对应处理

1. **Qwen/DeepSeek 浏览器直连的CORS风险（高，可能卡住P6）**
   MVP阶段决定"前端直连模型API，不搭代理"（§4），但这个决定还没验证过对应服务商是否允许浏览器跨域直接调用。如果不允许，P6会被完全卡住，且跟"生产阶段才需要代理"的既有决策冲突。
   **处理**：P6开工前先用一次最小化的真实API调用验证CORS行为，而不是按计划顺序走到P6才发现问题。**这件事现在就可以单独验证，不用等前面的阶段做完——建议作为P0之后立刻插入的一个独立验证步骤。**

   **验证结论（2026-06-24，Task2，已执行）**：**可行**。用真实key对两家服务分别发OPTIONS预检+实际POST（带`Origin: http://localhost:5173`），响应头里都正确返回了匹配的`Access-Control-Allow-Origin`，浏览器不会拦截：
   - Qwen（阿里云百炼 compatible-mode endpoint）：预检200，`access-control-allow-origin`回显请求Origin；CORS层面无拦截（注：当时用`qwen3.7-plus`调用时业务层返回404"Not support"，排查后发现是base_url路径多带了`/api/v2/apps/protocols`前缀，不是model id问题——Task12实现时已把base_url改为`https://ws-rkauubejgaf12hp4.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，`qwen3.7-plus`本身就是有效model id，调用恢复200，且GET `/models`可枚举出该key下全部可用模型）。
   - DeepSeek（`deepseek-v4-flash`）：预检200，实际POST 200，正常返回`chat.completion`内容，CORS和业务调用均通过。
   - Task12额外验证：该endpoint接受OpenAI兼容的`image_url`多模态content格式（文字+图片）；`stream:true`返回标准SSE分片，但`qwen3.7-plus`是带"思考过程"的推理模型，`delta.reasoning_content`（思考文字）和`delta.content`（真正答案）是分开两个字段流式输出的，UI侧必须只采集`content`、丢弃`reasoning_content`，否则会把模型内心戏展示给用户。
   - 结论："MVP无后端代理、前端直连"的架构假设成立，不需要升级给用户重新决策架构，Task12/P6可以按原计划推进。

2. **核心状态机无自动化测试兜底（中）——已决定：写轻量断言脚本**
   §6定的是人工验收清单，不是自动化测试套件，但P3/P4（棘轮、归档时序）恰恰是最容易在后续改动里被悄悄破坏、人工测试覆盖不到的部分。
   **处理**：P3/P4开发时，额外写几个能单文件直接运行、跑完核心场景后失败即报错退出的轻量断言脚本（非测试框架、无CI依赖），把§6人工验收清单里"跨时间状态"类的验证脚本化。**范围限定在P3/P4这两层纯函数**，不延伸到UI或API集成，避免越界变成一套完整测试体系，跟"MVP不上自动化测试框架"的决定不冲突。

3. **uni-app的H5与mp-weixin产物行为差异（低，但容易被忽略）**
   P11如果只在H5端走一遍验收清单，mp-weixin端的`wx.setStorageSync`等API细节差异可能没被覆盖到。
   **处理**：P11明确要求两端各跑一遍§6的五条验证，不能只验证H5就算完成。

### 10.3 下一步

Plan 阶段已确认（2026-06-23）：构建顺序按10.1采用；风险2采纳轻量断言脚本方案，范围限定P3/P4。下一步进入 Phase 3（Tasks）——用 `planning-and-task-breakdown` 把 P0-P11 切成具体的、单次可完成的任务条目。

---

*本文件由 product_handoff.md v5 + content_library_draft_v1.json 转写生成，是 product_handoff.md 决策的工程向投影，不替代它作为PRD叙事的角色。后续决策变更应先更新 product_handoff.md（或在此文件追加版本号），再回写本 spec。*
