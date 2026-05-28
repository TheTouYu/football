# Agent 共享知识库

> **用途**：所有开发 Agent 启动时必读此文件。遇到问题或学到新东西时，追加到对应章节。
> **规则**：只追加，不删除他人内容。标注日期和署名。

---

## 参考文档索引

详细 API、常量、ID 等参考内容已拆分到独立文档：

| 文档 | 内容 | 何时读 |
|------|------|--------|
| [REFERENCE_HELPERS.md](./REFERENCE_HELPERS.md) | 全局 Helper、类型映射、编译错误速查 | 写代码时 |
| [REFERENCE_API.md](./REFERENCE_API.md) | 核心 API 速查、可复用函数 | 写代码时 |
| [REFERENCE_CONSTANTS.md](./REFERENCE_CONSTANTS.md) | 关键常量（球半径、重力、摩擦等） | 需要数值时 |
| [REFERENCE_IDS.md](./REFERENCE_IDS.md) | 实体 ID / 节点图 ID 分配表 | 新增节点图时 |
| [REFERENCE_LOGGING.md](./REFERENCE_LOGGING.md) | 信号日志系统用法 | 加日志时 |
| [MENU_SYSTEM.md](./MENU_SYSTEM.md) | 交互式菜单系统架构文档 | 修改菜单时 |

---

## 1. 项目环境

### 1.1 编译器
- 编译器：`genshin-ts-touyu`，位于 `node_modules/genshin-ts-touyu`
- 编译流程：`npm run typecheck` → `npm run lint` → `npm run build`
- 检查 `dist/src/main.gs.ts` 确认代码正确展开为节点函数调用

### 1.2 语言设置
- 项目配置 `lang: 'zh'`，使用中文事件名和中文函数别名
- 所有 node graph 函数都是 `f` 的方法（`f.启动定时器`、`f.获取自定义变量` 等）
- 全局 helper：`self`、`bool()`、`vec3()`、`setInterval` 等

### 1.3 硬约束
- `number` = float，`bigint` = int。整数运算用 `bigint`
- 条件判断必须是 `boolean`，需要时用 `bool(...)` 包裹
- 列表/字典必须同质类型
- `gstsServer` 函数必须是顶层函数，参数只能是普通标识符
- `gstsServer` 函数只能有一个尾部的 `return <expr>`
- 在 `gstsServer` 内部直接用 `gsts.f`，不需要 `f` 参数

### 1.4 类型映射与编译错误速查

> 完整版见 [REFERENCE_HELPERS.md](./REFERENCE_HELPERS.md)

#### 最常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `invalid value type` | 不支持的值类型 | 检查 entity 来源，list 元素用 `getCorrespondingValueFromList` |
| `switch case expression must be an integer literal` | case 不能用变量 | `case 123n:` 而非 `case MY_CONST:` |
| `block is not supported` | switch case 里用了 `{}` 块 | 去掉花括号，let 变量提到 switch 外 |
| `switch fallthrough with body is not supported` | case 没加 break | 加 `break` |
| handler 内调函数返回值是默认值 | 没加 `gstsServer` 前缀 | 加前缀 + 单一 return 表达式 |

---

## 2. 架构约束

### 2.1 状态机设计
- 足球状态转移逻辑集中在 `src/stateMachine.ts`
- 守卫函数是纯布尔函数，无副作用
- 碰撞只修改速度向量，不直接改状态
- 实体间通过读取对方上下文变量通信

### 2.2 Node Graph 挂载规则

- **每个源文件指定一个 Node Graph ID**，通过 `g.server({ id: <ID>, name: '<名称>', ... })` 配置
- **`name` 字段必填**：在编辑器中通过名称识别节点图，否则无法区分。
- **ID 可以不断累加** — 新增 node graph 时用新的 ID 即可，ID 不冲突
- **足球实体**：1 个，手动放置。Ball FSM 挂在此实体上，运行 1 次
- **角色实体**：N 个，框架自动生成。挂载在角色实体上的代码会运行 N 次
- **Agent 编写代码时**：声明挂载目标（足球/角色/关卡/元件），ID 从现有最大值递增

> ID 分配表见 [REFERENCE_IDS.md](./REFERENCE_IDS.md)

### 2.3 性能拆分规则

- **游戏引擎限制**：单个节点图写太多逻辑会触发性能限制。需将功能拆分到多个节点图。
- **拆分方式**：创建多个 `g.server({ id: 不同ID, ... })`，全部挂载到同一个实体上。
- **效果**：逻辑分布在多个节点图上执行，实现负载均衡。

### 2.4 解耦模式：定时器扫描 + 变量变化响应

- **方案**：独立定时器周期扫描 → 写入自定义变量 → 其他逻辑通过 `自定义变量变化时` 事件监听
- **优势**：解耦、降低负载、可扩展

### 2.5 事件转发解耦

- **场景**：按键事件只有角色实体能收到，但处理逻辑应放在目标实体上
- **方案**：角色实体上放转发图 → `f.转发事件(目标实体)` → 目标实体的图处理
- **优势**：每个实体的图只处理自己的职责，调试时只看目标实体的日志

### 2.6 文件结构
```
src/
├── stateMachine.ts     ← 状态枚举 + BallContext + 守卫 + nextState + entry/exit
├── ball_physics.ts     ← 各状态 do() 物理计算
├── collision.ts        ← 碰撞检测 + 碰撞响应
├── player_fsm.ts       ← 球员基础状态机
├── player_modifier.ts  ← 技能叠加层
├── menu_system.ts      ← 二级菜单系统（导航+渲染）
├── menu_bridge.ts      ← 菜单命令桥接（解码→写 _debugFlash）
├── debug_controller.ts ← 创建元件7 + 按键转发
├── kick_weights.ts     ← 权重计算
└── main2.ts            ← 主控+物理+扫描+Player FSM+Debug视觉
```

---

## 3. 不可复用的部分（避免踩坑）

| 旧代码 | 原因 |
|--------|------|
| `gstsServer状态定时器开关` | 旧架构：每个状态独立 node graph。新架构：单一 tick + 守卫分派 |
| `gstsServer切换至静止/滚动/滑动/空中` | 旧架构分散的函数。新架构：stateMachine 的 onEnter/onExit |
| `slide.ts` / `roll.ts` / `air.ts` | 旧架构 5 个独立 node graph。新架构：统一 Ball FSM |
| `main.ts` 8 个固定索引遍历玩家 | 旧 main.ts 整体架构废弃 |
| `f.设置自定义变量(..., true)` 触发事件做状态切换 | 新架构不再用这个模式 |
| `f.停止并删除基础运动器(self, '', true)` | 空字符串无法匹配，name 必须和添加时一致 |

---

## 4. 已知避坑经验

> 来源：首次实现和后续重构中总结。**每次 coding 前必读。**

### 4.1 节点图函数全是 `f` 的方法
所有 node graph 函数（如 `获取实体位置与旋转`、`三维向量减法` 等）都是 `f` 的方法，不是全局函数。

### 4.2 创建三维向量用 `f.创建三维向量(x, y, z)`
`vec3()` 全局函数只接受 `Vec3Value` 字面量，不接受运行时 float 变量。

### 4.3 角色朝向
`f.获取实体向前向量(e)` 返回世界空间前向，不一定是角色实际面朝方向。
正确做法：`f.三维向量旋转(欧拉角, f.创建三维向量(0.0, 0.0, 1.0))` — Z 轴正方向是默认前向。

### 4.4 角速度单位
`f.addUniformBasicRotationBasedMotionDevice` 的 angularSpeed 参数单位是**度/秒**，不是弧度/秒。

### 4.5 运动器 duration
运动器 duration 设为 `0.24`（= 2 × tick 间隔），每个 tick 重新施加，避免到期。

### 4.6 lockedBy 用 entity 类型 + `canEnterLock` 不再做 entity 比较
`BallContext.lockedBy` 使用 `entity` 类型。纯 TS 守卫函数中 `entity === entity` 编译为 JS 引用比较，**永远 false**。
当前方案：仅依赖状态机优先级防止重复进入 S_LOCK。<!-- Agent Touyu 2026-05-27 -->

### 4.7 `f.停止并删除基础运动器` 的第三个参数
`true` = 删除该实体上所有基础运动器，第二参数无关。

### 4.8 entry/exit 函数参数用 `f: any`
genshin-ts 中文函数名无 TS 类型声明，需要 ESLint 禁用。

### 4.9 守卫函数是纯 TypeScript 函数，不是 node graph entry point
纯 TS 函数中的运算符不会生成 GIA 节点。handler 内的 `a < b` 编译为 `gsts.f.lessThan`，但纯函数内的 `===` 编译为 JS 引用比较。

### 4.10 角色实体有 `.pos` 属性
角色实体（`获取指定玩家所有角色实体` 返回）自带 `.pos`，不需要 `getEntityLocationAndRotation`。

### 4.11 列表元素用 `getCorrespondingValueFromList`
`chars[0]` 不产生有效 entity pin，显式调用 `gsts.f.getCorrespondingValueFromList(chars, 0)`。

### 4.12 enterLock / exitLock 内联 + doLock 签名变更
entity 类型不能存 custom var 后中转给 `getEntityLocationAndRotation`，必须参数传。

### 4.13 gstsServer 回调函数内用 gsts.f 英文 API
中文 API 名只能在 `f`（`any` 类型）上使用。

### 4.14 读取自定义变量用 `.asType()` 
`f.获取自定义变量(self, 'x').asType('float')` — 简短清晰。

### 4.15 跨文件函数调用必须加 `gstsServer` 前缀 + 原始参数（不能传对象）⚠️ 最重要

非 gstsServer 的跨文件函数接收对象参数时，编译器**静默丢弃**调用，返回值替换为零值，**不报错**！
- `nextState(ballCtx)` → JSON 里硬编码 `0` → 球永远不动
- 修复：`gstsServerNextState(state, xzSpeed, ballVy, ...)` + 单一 return 三元链

### 4.16 gstsServer 返回值类型限制
- `bigint` / `string` ✅ — 三元链式 return
- `string[]` / 复杂类型 ❌ — 引擎不支持返回数组，必须内联或通过变量输出

### 4.17 二级菜单渲染：双列表实现前缀+内容拼接
字段 1/3 = 前缀（`*`/` `），字段 2/4 = 内容。文本框并排 = `*运行控制`。光标移动只改前缀。

### 4.18 调试变量变化事件过于频繁
Graph 5 监听 `自定义变量变化时`，每次 `setCustomVariable(..., true)` 都触发。用变量名快速过滤，不匹配立即 return。

### 4.19 字符串不支持 `+` 拼接
用 `list('str', [...])` 拼装列表 + 文本框并排渲染替代。

### 4.20 col=0 上下移动时同步更新 mainIdx
否则子菜单不会跟随主菜单光标联动预览。

---

## 5. 当前进度

| 文件 | 状态 | 备注 |
|------|------|------|
| `stateMachine.ts` | 已完成 | 状态枚举+BallContext+7守卫+nextState+gstsServerNextState+entry/exit |
| `ball_physics.ts` | 已完成 | doStill/doRoll/doSlide/doAir/doLock |
| `collision.ts` | 已完成 | 地面碰撞 + 球员碰撞 |
| `player_fsm.ts` | 已完成 | 骨架：状态枚举+PlayerContext+playerNextState |
| `player_modifier.ts` | 已完成 | 骨架：叠层枚举+allowModifier+applyModifier |
| `kick_weights.ts` | 可复用 | 从 src_old/ 复制 |
| `kick.ts` | 待开始 | 踢球力学 |
| `main2.ts` | 已完成 | Ball_主控+物理+扫描+Player FSM+Debug视觉 |
| `main3.ts` | 已完成 | Ball FSM（8索引+内联碰撞）+ Player FSM |
| `menu_system.ts` | 已完成 | 二级菜单：导航+渲染到 stage |
| `menu_bridge.ts` | 已完成 | 菜单命令桥接：_menuConfirm→_debugFlash |
| `debug_controller.ts` | 已完成 | 创建元件7 + 按键转发 |

---

## 6. 菜单系统架构

```
角色实体(按键转发)          元件7(菜单系统)           元件7(命令桥接)          球(Debug执行)
┌──────────────┐  转发   ┌──────────────┐  _menuConfirm ┌──────────────┐  _debugFlash ┌──────────┐
│ ID 1073742448│ ──────→ │ ID 1073742447│ ───────────→ │ ID 1073742449│ ──────────→ │ID 1073742444│
│ 过滤5按钮    │         │ 导航+渲染    │              │ switch解码   │            │ 执行命令  │
└──────────────┘         └──────────────┘              └──────────────┘            └──────────┘
```

详细架构文档见 [MENU_SYSTEM.md](./MENU_SYSTEM.md)
