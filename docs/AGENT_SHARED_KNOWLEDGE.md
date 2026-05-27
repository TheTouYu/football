# Agent 共享知识库

> **用途**：所有开发 Agent 启动时必读此文件。遇到问题或学到新东西时，追加到对应章节。
> **规则**：只追加，不删除他人内容。标注日期和署名。

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

---

## 2. 架构约束

### 2.1 状态机设计
- 足球状态转移逻辑集中在 `src/stateMachine.ts`
- 守卫函数是纯布尔函数，无副作用
- 碰撞只修改速度向量，不直接改状态
- 实体间通过读取对方上下文变量通信

### 2.2 Node Graph 挂载规则

- **每个源文件指定一个 Node Graph ID**，通过 `g.server({ id: <ID>, name: '<名称>', ... })` 配置
- **`name` 字段必填**：在编辑器中通过名称识别节点图，否则无法区分。命名建议：`'Ball_FSM_主控'`、`'Ball_FSM_物理'`、`'Player_FSM'` 等
- **ID 可以不断累加** — 新增 node graph 时用新的 ID 即可，ID 不冲突
- **足球实体**：1 个，手动放置。Ball FSM 挂在此实体上，运行 1 次
- **角色实体**：N 个，框架自动生成（每个玩家加入时自动创建）。挂载在角色实体上的代码会运行 N 次（每个玩家实例独立运行），每个实例拥有独立的图变量副本
- **角色实体是最特殊的**：同一份代码只挂载一次，但运行时因为多个玩家各自有角色实体，所以会执行多次
- **Agent 编写代码时**：只需声明 node graph 挂载到「足球实体」还是「角色实体」，ID 从旧代码最大值（1073742437）继续递增即可，具体 ID 由用户去游戏引擎中配置

### 2.3 实体 ID 速查

| ID | 类型 | 说明 |
|----|------|------|
| `1077936262` | **元件 ID (prefabId)** | 足球的预制体 ID。用途：① `f.获取场上指定元件ID的实体(prefabId(1077936262))` 查找场上足球；② 在编辑器中创建足球实例 |
| `1073742432` | **节点图 ID** (旧) | main.ts 旧架构用的角色实体图 |
| `1073742434` | **节点图 ID** (旧) | roll.ts 旧架构用的足球实体图 |
| `1073742435` | **节点图 ID** (旧) | slide.ts 旧架构用的足球实体图 |
| `1073742436` | **节点图 ID** (旧) | air.ts 旧架构用的足球实体图 |
| `1073742437` | **节点图 ID** (旧) | kick.ts 旧架构用的角色实体图 |
| `1073742438` | **节点图 ID** | main2.ts Ball_主控 — 状态转移 + tick 协调 |
| `1073742439` | **节点图 ID** | main2.ts Ball_物理 — 各状态 do() 物理计算 |
| `1073742440` | **节点图 ID** | main2.ts Ball_玩家扫描 — 0.5s 间隔扫描最近球员 |
| `1073742441` | **节点图 ID** | main2.ts Player_FSM — 球员基础状态机 |
| `1073742442` | **节点图 ID** | main3.ts Ball FSM — 完整足球物理（扫描+碰撞+转移+物理） |
| `1073742443` | **节点图 ID** | main3.ts Player FSM — 球员基础状态机 |
| `1073742444+` | **节点图 ID** (新) | 后续新增从 1073742444 开始递增分配 |

> **关键区别**：`prefabId` ≠ 节点图 ID。prefabId 是编辑器中元件的标识，节点图 ID 是代码逻辑挂载的标识。用 `prefabId()` 查找实体时用元件 ID，用 `g.server({ id: ... })` 配置时用节点图 ID。

### 2.4 性能拆分规则

- **游戏引擎限制**：单个节点图写太多逻辑会触发性能限制。需将功能拆分到多个节点图。
- **拆分方式**：创建多个 `g.server({ id: 不同ID, ... })`，全部挂载到**同一个足球实体**上。`self` 在所有这些图中都指向足球。
- **效果**：逻辑分布在多个节点图上执行，实现负载均衡，但对外表现为同一个实体的完整功能。
- **Agent 编写代码时**：足球功能应拆分到多个 `g.server()` 调用中。例如一个图负责状态转移 + tick 协调，另一个图负责物理计算，再一个负责碰撞检测。通过自定义变量在节点图之间共享数据（同一个实体上的不同节点图可以读写同一套自定义变量）。

### 2.5 解耦模式：定时器扫描 + 变量变化响应

- **问题**：每 tick 遍历所有玩家找最近球员 → tick 负载高、逻辑耦合在主循环里
- **方案**：
  1. 用独立定时器周期性扫描（频率可以比主 tick 低，如 0.5s 一次）
  2. 使用 `f.列表遍历循环(list, 回调)` 进行遍历（不展开固定索引）
  3. 扫描到符合条件的玩家 → 写入自定义变量（如 `nearestPlayerId`）→ 清除扫描定时器
  4. 其他逻辑通过 `自定义变量变化时` 事件监听结果，触发后续动作
- **优势**：解耦（扫描逻辑与主 tick 独立）、降低负载（不需要每 tick 都扫）、可扩展（后续条件变化只需修改扫描回调）

### 2.6 文件结构
```
src/
├── stateMachine.ts     ← 状态枚举 + BallContext + 守卫 + nextState + entry/exit
├── ball_physics.ts     ← 各状态 do() 物理计算
├── collision.ts        ← 碰撞检测 + 碰撞响应
├── player_fsm.ts       ← 球员基础状态机
├── player_modifier.ts  ← 技能叠加层
├── kick.ts             ← 踢球方向/权重
├── kick_weights.ts     ← 权重计算
└── main.ts             ← node graph 组装入口
```

---

## 3. 核心 API 速查（从旧代码提炼）

### 3.1 实体查询与操作

```typescript
// 获取足球实体（通过元件ID查找）
let balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
let ball = balls[0]  // 足球只有一个

// 获取所有玩家
let players = f.获取在场玩家实体列表()
let p0Chars = f.获取指定玩家所有角色实体(players[0])
let char = p0Chars[0]

// 获取实体位置与旋转
let locRot = f.获取实体位置与旋转(entity)
let pos = locRot.location   // Vec3
let rot = locRot.rotate     // 欧拉角 Vec3

// 获取角色移动速度
let speedInfo = f.查询角色当前移动速度(char)
let currentSpeed = speedInfo.currentSpeed  // float

// 列表遍历循环 — 替代硬编码的固定索引展开
// iterationList: 要遍历的列表，loopBody: 每次迭代的回调
f.列表遍历循环(iterationList, loopBody)
```

> **不要使用原生 TS 循环（for/while）** — genshin-ts 节点图不支持。用 `f.列表遍历循环` 替代。
> **不要展开固定索引**（如 `players[0]`、`players[1]` 写 8 遍）— 用列表遍历循环，代码更简洁且支持动态玩家数量。

### 3.2 自定义变量读写

```typescript
// 读取（需类型转换）
let ballVx = f.数据类型转换(f.获取自定义变量(entity, 'ballVx'), 'float')

// 写入（第三个参数 true = 触发「自定义变量变化时」事件）
f.设置自定义变量(entity, '状态', 0n, true)
f.设置自定义变量(entity, 'ballVx', 0.0)  // 不触发事件

// 节点图变量（g.server({ variables: {...} }) 中声明的）
let _init = f.获取节点图变量自动类型推断('_init')
f.设置节点图变量自动类型推断('_init', true)
```

### 3.3 定时器

```typescript
// 启动循环定时器（120ms 间隔）
f.启动定时器(self, 'motionTick', true, [0.12])

// 启动一次性定时器
f.启动定时器(self, 'lockTimeout', false, [0.5])

// 停止定时器
f.停止定时器(self, 'motionTick')

// 在别的实体上启动定时器
f.启动定时器(otherEntity, 'kickProcess', false, [0.01])
```

### 3.4 三维向量操作

```typescript
f.创建三维向量(x, y, z)         // 创建 Vec3
f.拆分三维向量(v)               // 返回 {xComponent, yComponent, zComponent}
f.三维向量模运算(v)             // 求模（长度）
f.三维向量归一化(v)             // 归一化
f.三维向量缩放(v, s)           // 标量乘
f.三维向量加法(a, b)           // 加法
f.三维向量减法(a, b)           // 减法
f.三维向量内积(a, b)           // 点积
f._3dVectorCrossProduct(a, b)  // 叉积（注意：用的是英文名）
f._3dVectorRotation(euler, v)  // 用欧拉角旋转向量
f._3dVectorZoom(v, scale)      // 缩放（另一种命名）
```

### 3.5 运动器

```typescript
// 直线运动器
f.addUniformBasicLinearMotionDevice(entity, 'name', duration, velocityVec3)

// 旋转运动器 — 角速度单位是 度/秒（不是弧度）
f.addUniformBasicRotationBasedMotionDevice(entity, 'name', duration, angularSpeedDegPerSec, axisVec3)

// 停止并删除运动器 — 第三个参数 true = 删除该实体上所有运动器
f.停止并删除基础运动器(entity, 'anyName', true)
```

> - 添加运动器时 `name` 可自定义（如 `'ballLinear'`、`'ballRotate'`）
> - 第三个参数 `true` 时会忽略 `name`，直接清除该实体所有基础运动器
> - 本项目约定：直线运动器用 `'ballLinear'`，旋转运动器用 `'ballRotate'`

---

## 4. 可直接复用的函数（从 src_old/ 提取）

### 4.1 踢球权重计算（src_old/kick_weights.ts）

**完全复用，无需修改。** 三个分段查表函数：

```typescript
// 计算踢球方向权重 — 返回 forward 权重（toBallDir 权重 = 1.0 - forward权重）
export function gstsServer计算踢球方向权重(dot: number): number {
  // dot > 0.7 → 0.7,  0 < dot <= 0.7 → 0.45,  dot <= 0 → 0.25
}

// 计算对齐权重 — 对齐度越高权重越大
export function gstsServer计算对齐权重(dot: number): number {
  // dot > 0.9 → 1.2,  0.5~0.9 → 1.0,  0~0.5 → 0.5,  -0.5~0 → 0.2,  else 0.1
}

// 计算力系数
export function gstsServer计算力系数(dot: number): number {
  // dot > 0.9 → 0.8,  0~0.9 → 1.2,  else 0.3
}
```

### 4.2 旋转轴计算（src_old/motion.ts）

```typescript
// 计算滚动旋转轴方向
// 原理：cross(up, velDir) 归一化 → 加上球的旋转偏移（YXZ 顺序）
export function gstsServer计算旋转轴方向(velDir: any, ballRotate: any) {
  const up = gsts.f.create3dVector(0.0, 1.0, 0.0)
  let axis = gsts.f._3dVectorCrossProduct(up, velDir)
  let result = gsts.f._3dVectorNormalization(axis)

  // 对旋转轴加上球的旋转偏移（逆旋转，YXZ 顺序）
  let rotComps = gsts.f.split3dVector(gsts.f._3dVectorZoom(ballRotate, -1))
  let yRot = gsts.f.create3dVector(0.0, rotComps.yComponent, 0.0)
  result = gsts.f._3dVectorRotation(yRot, result)
  let xRot = gsts.f.create3dVector(rotComps.xComponent, 0.0, 0.0)
  result = gsts.f._3dVectorRotation(xRot, result)
  let zRot = gsts.f.create3dVector(0.0, 0.0, rotComps.zComponent)
  result = gsts.f._3dVectorRotation(zRot, result)
  return result
}
```

### 4.3 前向计算（src_old/motion.ts）

```typescript
// 从欧拉角计算前向向量 — Z 轴正方向是默认前向
export function gstsServer计算前向(rotate: any) {
  const fwd = gsts.f._3dVectorRotation(rotate, gsts.f.create3dVector(0.0, 0.0, 1.0))
  return fwd
}
```

### 4.4 运动器施加（src_old/motion.ts）— 需适配

旧版函数，**需要修改**：旧版对 SLIDE(状态2) 不施加旋转，新设计 SLIDE 也需要角速度。

```typescript
// 旧版签名（参考用，新实现要改动）
export function gstsServer施加基础运动(
  state: bigint, ballVx: any, ballVz: any, ballVy: any,
  ballRadius: any, rotationAxis: any
)
```

关键数值公式：
- 角速度（度/秒）= `(xzSpeed / ballRadius) * 180 / 3.1415926`
- 运动器 duration = `0.24`（覆盖 2 个 tick）
- tick 间隔 = `0.12` 秒

### 4.5 踢球力学（src_old/kick.ts）— 核心逻辑复用

踢球计算流程（新架构中作为「施加外力」的转移动作）：
1. 读角色位置/面朝/速度
2. 读球位置/速度
3. 计算踢球方向（面朝与球方向按权重混合）
4. 计算基础力 × 对齐权重 × 距离衰减
5. 冲量叠加到球当前速度
6. 首次踢球：随机弹跳初速度
7. 写回球速度 → 状态机自然判定下一状态

---

## 5. 关键常量

| 常量 | 值 | 来源 |
|------|-----|------|
| 足球元件 ID (prefabId) | `1077936262` | 游戏引擎配置 |
| 球半径 (ballRadius) | `0.45` | 足球元件规格 |
| 地面高度 | `0.45` (= ballRadius) | 球心触地时 ballY = 球半径 |
| 重力加速度 | `9.8` | 标准重力 |
| 摩擦衰减（旧） | `0.75` | 旧架构，新设计改用 `0.95` |
| 空气阻力 | `0.995` | 新设计 |
| 角速度衰减 | `0.90` | 新设计，SLIDE 中角速度独立衰减 |
| tick 间隔 | `0.12` 秒 (120ms) | 定时器周期 |
| 锁定距离 | `0.5` 米 | 触发球权锁定的接触距离 |
| 锁定退出距离 | `2` 米 | 球离锁定者超过此距离退出 LOCK |
| 反弹系数 | `0.5` | 地面/球员碰撞速度衰减 |

---

## 6. 不可复用的部分（避免踩坑）

| 旧代码 | 原因 |
|--------|------|
| `gstsServer状态定时器开关` | 旧架构：每个状态独立 node graph + 独立 timer。新架构：单一 tick + 守卫分派 |
| `gstsServer切换至静止/滚动/滑动/空中` | 旧架构：分散的状态切换函数。新架构：stateMachine 的 onEnter/onExit 替代 |
| `gstsServer切换至锁定/锁定超时归零` | 旧架构的锁机制。新架构：LOCK 状态含完整 entry/exit/do |
| `gstsServer判定目标状态` | 分散的落地分派。新架构：集中 dispatchGroundState + 转移表 |
| `slide.ts` / `roll.ts` / `air.ts` | 旧架构：5 个独立 node graph。新架构：统一 Ball FSM |
| `main.ts` 8 个固定索引遍历玩家 | 遍历模式本身可参考，但旧 main.ts 整体架构废弃 |
| `f.设置自定义变量(..., true)` 触发事件来做状态切换 | 旧架构用「变量变化事件」驱动跨图通信。新架构不再用这个模式 |
| `f.停止并删除基础运动器(self, '', true)` | **空字符串无法匹配任何运动器！** 添加和删除时 name 必须一模一样。本项目约定用 `'ballLinear'` 和 `'ballRotate'` 分别管理直线和旋转运动器。→ 已修正于 2026-05-27 |

---

## 7. 已知避坑经验

> 来源：首次实现和后续重构中总结

### 7.1 节点图函数全是 `f` 的方法
所有 node graph 函数（如 `获取实体位置与旋转`、`三维向量减法` 等）都是 `f` 的方法，不是全局函数。

### 7.2 创建三维向量用 `f.创建三维向量(x, y, z)`
`vec3()` 全局函数只接受 `Vec3Value` 字面量，不接受运行时 float 变量。
从 float 变量构建 vec3 必须用 `f.创建三维向量(x, y, z)`。

### 7.3 角色朝向
`f.获取实体向前向量(e)` 返回世界空间前向，不一定是角色实际面朝方向。
正确做法：`f.三维向量旋转(欧拉角, f.创建三维向量(0.0, 0.0, 1.0))` — Z 轴正方向是默认前向。

### 7.4 编译验证三件套
```bash
npm run typecheck  # 先过类型
npm run lint       # 再过 ESLint
npm run build      # 编译 + GIA + 注入
```
必须三项都通过才算编译成功。

### 7.5 角速度单位
`f.addUniformBasicRotationBasedMotionDevice` 的 angularSpeed 参数单位是**度/秒**，不是弧度/秒。

### 7.6 运动器 duration
运动器 duration 设为 `0.24`（= 2 × tick 间隔），因为每个 tick 都会重新施加运动器，确保运动器不会在两次 tick 之间到期。

### 7.7 lockedBy 用 entity 类型 + self 哨兵值表示「无锁定者」
`BallContext.lockedBy` 现在使用 `entity` 类型（`import { entity } from "genshin-ts-touyu/runtime/value"`），哨兵值为 `self`（球自身实体 = 自由）。守卫 `canEnterLock` 中比较 `ctx.lockedBy === new entity`（已在 stateMachine.ts 实现）。自定义变量读写用 `.asType("entity")` 显式转换。`exitLock`/`enterLock` 必须内联以直接操作 entity 引用。<!-- Agent Touyu 2026-05-27，更新于 2026-05-27 -->

### 7.8 `f.停止并删除基础运动器` 的第三个参数
`f.停止并删除基础运动器(self, '<任意名称>', true)` — 第三个参数 `true` 表示删除该实体上**所有**基础运动器，此时第二个参数（名称）无关紧要。exit 函数中可用此 API 一次性清理所有运动器。<!-- Agent A 2026-05-27 -->

### 7.9 entry/exit 函数参数用 `f: any`，配合 ESLint 禁用
genshin-ts 的中文函数名（`设置自定义变量`、`停止并删除基础运动器` 等）没有 TypeScript 类型声明，entry/exit 函数参数只能用 `f: any`。需在文件头添加 `/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */` 抑制由此产生的 ESLint 错误。`no-explicit-any` 在该项目中配置为 `warn` 级别，可接受。<!-- Agent A 2026-05-27 -->

### 7.10 守卫函数是纯 TypeScript 函数，不是 node graph entry point
守卫函数（`canExitLock`、`canEnterLock` 等）和 `nextState`、`dispatchGroundState` 是纯 TypeScript 函数，仅供 `main.ts` 在 tick 事件处理器中调用。它们不直接调用 `f` API，而是通过参数 `ctx: BallContext` 接收所有需要的数据。编译时 genshin-ts 会将它们展开为节点图调用。<!-- Agent A 2026-05-27 -->

### 7.11 player_fsm 和 player_modifier 的骨架模式
球员状态机（player_fsm.ts）目前只需要纯 TypeScript 骨架，不需要 `f` 参数。转移逻辑 `playerNextState` 暂时返回 `ctx.state` 保持状态不变，后续填充转移表时模式与 `stateMachine.ts` 的 `nextState` 一致：按优先级依次检查守卫条件，返回第一个命中的目标状态。<!-- Agent D 2026-05-27 -->

### 7.12 避免循环导入：内联常量而非跨文件 import
`player_modifier.ts` 需要引用 `player_fsm.ts` 中定义的基础状态枚举（P_IDLE、P_CHASE 等）。直接 `import` 可能形成循环依赖。解决方案是在文件中重新声明值相同的局部常量（`const P_IDLE = 0n` 等），并对依赖关系做明确注释。这种模式适用于任何需要在定义文件和使用文件之间共享 bigint 枚举值的情况。<!-- Agent D 2026-05-27 -->

### 7.13 碰撞函数需要禁用 `no-unsafe-assignment`
碰撞检测函数（`checkGroundCollision`、`checkPlayerCollision` 等）通过 `f` 调用 genshin-ts API，返回值类型都是 `any`。赋值给局部变量时会触发 `@typescript-eslint/no-unsafe-assignment`。文件头 ESLint 禁用需在 `no-unsafe-member-access, no-unsafe-call` 基础上额外加 `no-unsafe-assignment`。<!-- Agent C 2026-05-27 -->

### 7.14 碰撞函数内部变量统一用 `const`
`gsts/prefer-const-outside-server` 规则要求 node graph 函数内的变量如果用 `let` 声明但从未重新赋值，必须改为 `const`。碰撞检测函数中所有中间变量（读取值、计算结果）都是一次性赋值的，全部用 `const` 即可通过该规则。<!-- Agent C 2026-05-27 -->

### 7.15 速度反射公式的 genshin-ts 实现
球员碰撞的速度反射公式 `V - 2*dot(V,N)*N` 在 genshin-ts 节点图中实现需要以下步骤：
1. 距离向量：`f.三维向量减法(ballPos, playerPos)`
2. 法线方向：`f.三维向量归一化(diff)`（入射方向从球员指向球）
3. 点积：`f.三维向量内积(vel, incidentDir)`
4. 标量乘向量：`f.三维向量缩放(incidentDir, twoDot)`
5. 向量减法：`f.三维向量减法(vel, scaledIncident)`
6. 衰减缩放：`f.三维向量缩放(velReflected, 0.5)`
7. 提取分量：`f.拆分三维向量(velFinal)` → `{xComponent, yComponent, zComponent}`<!-- Agent C 2026-05-27 -->

### 7.16 ball_physics.ts do 函数需要完整 ESLint 禁用
do 函数中所有局部变量赋值来自 `f` API 返回值（`any` 类型），除了 `no-unsafe-member-access` 和 `no-unsafe-call`，还需额外禁用 `no-unsafe-assignment` 和 `no-unsafe-return`。文件头禁用指令应为：
```
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
```<!-- Agent B 2026-05-27 -->

### 7.17 旧 gstsServer 函数适配为普通函数时的 API 名称映射
将 `src_old/` 中以 `gsts.f.XXX` 形式调用 API 的函数适配为接收 `f` 参数的普通函数时，需注意以下 API 名称变化：
- `gsts.f.create3dVector` → `f.创建三维向量`（中文名）
- `gsts.f.split3dVector` → `f.拆分三维向量`（中文名）
- `gsts.f._3dVectorCrossProduct` → `f._3dVectorCrossProduct`（保持英文名，未汉化）
- `gsts.f._3dVectorNormalization` → `f.三维向量归一化`（中文名）
- `gsts.f._3dVectorZoom` → `f.三维向量缩放`（中文名）
- `gsts.f._3dVectorRotation` → `f.三维向量旋转`（中文名）
- `gsts.f.setCustomVariable` → `f.设置自定义变量`（中文名）
- `gsts.f.dataTypeConversion` → `f.数据类型转换`（中文名）<!-- Agent B 2026-05-27 -->

### 7.18 ROLL 与 SLIDE 的旋转轴计算方式不同
ROLL 的旋转轴由水平速度方向叉乘世界 up（= cross(up, velDir) 归一化）得出，角速度大小 = (xzSpeed / ballRadius) * 180 / PI（度/秒）。SLIDE 的旋转轴来自独立的角速度向量 normalize(ω)，角速度大小 = |ω|。两者不要混淆——ROLL 的角速度与线速度耦合，SLIDE 的角速度完全独立。<br/>
另外，`f._3dVectorCrossProduct` 使用英文名（注意下划线前缀），与 `f.创建三维向量`、`f.三维向量归一化` 等中文名不同。<!-- Agent B 2026-05-27 -->

### 7.19 doLock 两阶段模式
LOCK 状态的 do 函数分为两个阶段：第一帧（xzSpeed < 0.05）施加初始踢球速度 7.5，方向为锁定球员的面朝方向（通过 `f.三维向量旋转(欧拉角, f.创建三维向量(0, 0, 1))` 计算）；后续帧只做摩擦衰减并计算 distFromLocker。球速降到阈值后由 main.ts 调用 nextState 决定再踢或退出——doLock 内部不重复施加踢球力。<!-- Agent B 2026-05-27 -->

### 7.20 马格努斯偏移的简化实现
马格努斯效应的简化版为 cross(ω归一化, V) × 微小系数（0.005），将得到的偏移向量加到速度 V 上。这在节点图中需要 5 步：ω 归一化 → cross(ω_norm, V) → scale → 加回 V → 拆分。注意 cross product 使用 `f._3dVectorCrossProduct`（英文名）。<!-- Agent B 2026-05-27 -->

### 7.21 BallContext 和 PlayerContext 中锁定者字段用 entity 类型
`BallContext.lockedBy` 和 `PlayerContext.ballLockedBy` 现在使用 `entity` 类型（`import { entity } from "genshin-ts-touyu/runtime/value"`），而非 `bigint`。读取 lockedBy 自定义变量时用 `.asType("entity")` 显式转换：
```typescript
const lockedByEntity = f.获取自定义变量(self, 'lockedBy').asType("entity")
```
哨兵值：`self`（球自身）= 自由/未锁定，非 self = 被某玩家锁定。<!-- Agent Touyu 2026-05-27 -->

### 7.22 角色实体有 `.pos` 属性，不需要 `getEntityLocationAndRotation`
角色实体（从 `获取指定玩家所有角色实体` 返回）是特殊的 entity 类型，自带 `.pos` 属性直接返回位置（Vec3），不需要通过 `获取实体位置与旋转` 取 `.location`。这与普通实体（如足球）不同——普通实体必须用 `getEntityLocationAndRotation`。<!-- Agent Touyu 2026-05-27 -->

### 7.23 列表迭代循环 / gstsServer 内访问列表元素用 `getCorrespondingValueFromList`
在 `列表迭代循环` 回调或 `gstsServer` 函数内，`chars[0]` 直接索引不会产生有效的 entity pin，导致 GIA 报 `无效的值类型: entity`。
**正确做法**：显式调用 `gsts.f.getCorrespondingValueFromList(chars, 0)` 获取列表元素，这样 GIA 编译器能正确解析 entity 类型。
`.asType("entity")` 和 `.at(0)` 方法在 list element 上均不可用。<!-- Agent Touyu 2026-05-27 -->

### 7.24 enterLock / exitLock 内联 + doLock 签名变更
由于 `lockedBy` 升级为 entity 类型：
- **`exitLock`** 必须内联：`f.设置自定义变量(self, 'lockedBy', self, true)`（不能用 `0n`，那是 bigint）
- **`enterLock`** 必须内联：`f.设置自定义变量(self, 'lockedBy', nearestPlayerEntity, true)`（直接传 entity 引用）
- **`doLock`** 签名改为 `doLock(f: any, lockerEntity: any)`：locker entity 通过参数传入，不通过 custom var 中转（custom var 存 entity 后 GIA 无法解析给 `getEntityLocationAndRotation`）<!-- Agent Touyu 2026-05-27 -->

### 7.25 gstsServer 回调函数内用 gsts.f 英文 API
作为 `列表迭代循环` 回调的 `gstsServer` 函数内，必须使用 `gsts.f` + 英文 API 名（如 `gsts.f.getAllCharacterEntitiesOfSpecifiedPlayer`、`gsts.f.getCorrespondingValueFromList`、`gsts.f._3dVectorSubtraction` 等），因为 `gsts.f` 的 TypeScript 类型定义不含中文别名。中文 API 名只能在 `f`（`any` 类型）上使用。<!-- Agent Touyu 2026-05-27 -->

---

## 8. 当前进度

| 文件 | 状态 | 负责 Agent | 备注 |
|------|------|-----------|------|
| `stateMachine.ts` | 已完成 | Agent A | Phase 1，已完成状态枚举+BallContext+7守卫+nextState+entry/exit |<!-- Agent A 2026-05-27 -->
| `ball_physics.ts` | 已完成 | Agent B | doStill/doRoll/doSlide/doAir/doLock 全部实现，通过 typecheck + lint（仅含 any 警告） |<!-- Agent B 2026-05-27 -->
| `collision.ts` | 已完成 | Agent C | 地面碰撞 + 球员碰撞，反射公式实现，通过 typecheck + lint |<!-- Agent C 2026-05-27 -->
| `player_fsm.ts` | 已完成 | Agent D | Phase 5，骨架：状态枚举+PlayerContext+playerNextState（转移逻辑后续填充） |<!-- Agent D 2026-05-27 -->
| `player_modifier.ts` | 已完成 | Agent D | Phase 5，骨架：叠层枚举+allowModifier兼容矩阵+applyModifier（SPRINT效果后续实现） |<!-- Agent D 2026-05-27 -->
| `kick_weights.ts` | 可直接复用 | — | 从 src_old/ 复制 |
| `kick.ts` | 待开始 | — | 踢球力学，需适配新接口 |
| `main.ts` | 旧架构 | — | src_old/main.ts，仅作参考 |
| `main2.ts` | 已完成 | Agent Touyu | 4 Graph 架构：主控+物理+扫描+Player FSM，列表迭代循环扫描 |
| `main3.ts` | 已完成 | Agent Touyu | 2 Graph 架构：Ball FSM（8索引扫描+内联碰撞）+ Player FSM |

---

## 9. 信号日志系统

### 9.1 信号发送 API

```typescript
// 节点图函数（f 的方法）
f.sendSignal(signalName: StrValue, ...args: value[]): void

// 中文别名
f.发送信号(signalName: StrValue, ...args: value[]): void
```

- `signalName`：仅支持字面量字符串，须先在编辑器的信号管理器中注册
- `...args`：必须是 `value` 类型（`str`/`int`/`float`/`entity`/`vec3` 等 class 的实例）

### 9.2 类型陷阱：`str()` 返回 `string` 而非 `str value`

全局函数 `str(x)` 返回的是原生 JS `string` 类型，不是 `str` value class 的实例（来自 `server_globals.d.ts: str: (v: ...) => string`）。

而节点图函数 `f.拼装列表` 接受 `StrValue[]`（`StrValue = str | string`），所以 `str(x)` 的返回值可以用在拼装列表中。

### 9.3 日志信号的标准用法（V2 架构）

```typescript
// 模式：信号名 + 通道 + 字符串列表（as any 绕过 type 检查）
f.发送信号('日志操作', '物理' as any, f.拼装列表(['地面碰撞 Vy=', str(ballVy), '→', str(bouncedVy)]) as any)
f.发送信号('日志操作', '状态机' as any, f.拼装列表(['状态 ', str(currentState), '→', str(newState)]) as any)
f.发送信号('日志操作', '锁定' as any, f.拼装列表(['进入锁定 距离=', str(nearestPlayerDist)]) as any)
f.发送信号('日志操作', '锁定' as any, f.拼装列表(['LOCK踢球']) as any)
```

参数结构：

| 位置 | 说明 | 类型 |
|------|------|------|
| arg1 | 信号名，须编辑器注册 | `StrValue`（字面量） |
| arg2 | 通道名：`'物理'` / `'状态机'` / `'锁定'` | 传给 `value`，需 `as any` |
| arg3 | 日志内容字符串列表，用 `f.拼装列表` 构建 | `string[]`，需 `as any` |

### 9.4 为什么用 `f.拼装列表` 而非字符串拼接

GIA 节点图中不支持 `+` 运算符做字符串拼接（`addition` 只支持数值类型）。`str("a") + str("b")` 会报错：

```
Error: Generic parameter not matched: str type × addition numeric overload
```

正确做法是将所有日志片段用 `f.拼装列表` 组装为字符串列表，接收端收到后逐项解析拼成完整日志。

### 9.5 已接入日志的触发点（main2.ts V2 架构）

| 触发点 | 通道 | 列表内容 |
|--------|------|---------|
| 地面碰撞发生 | `'物理'` | `['地面碰撞 Vy=', oldVy, '→', newVy]` |
| 状态转移发生 | `'状态机'` | `['状态 ', oldState, '→', newState]` |
| 进入 LOCK 锁定 | `'锁定'` | `['进入锁定 距离=', nearestPlayerDist]` |
| 退出 LOCK 锁定 | `'锁定'` | `['退出锁定 距锁定者=', distFromLocker]` |

状态编号映射：`0=静止` `1=滚动` `2=滑动` `3=空中` `4=锁定`
