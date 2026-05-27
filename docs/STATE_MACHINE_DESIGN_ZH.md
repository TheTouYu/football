# 3D 物理足球游戏 — 状态机设计文档

> 最后更新：2026-05-26
> 状态：设计完成，待实现

---

## 1. 架构概览

### 1.1 实体模型

```
比赛世界
├── 足球 (1个实体，手动放置)
│   └── Ball FSM — 统一物理状态机
│       states: STILL / ROLL / SLIDE / AIR / LOCK
│       驱动: 120ms tick 定时器
│
└── 球员 (最多 N 个实体，框架自动生成)
    └── Player FSM — 双层状态机
        ├── 基础层 (互斥): IDLE / CHASE / DRIBBLE / SHOOT / PASS / SHIELD / RECEIVE
        └── 叠加层 (可共存): MOD_NONE / MOD_SPRINT
        驱动: 120ms tick 定时器
```

### 1.2 核心设计原则

1. **一个实体 = 一个 FSM（可含子层）**。足球只管物理，球员只管行为。
2. **转移逻辑集中在一个文件** (`stateMachine.ts`)。守卫是纯布尔函数，无副作用。
3. **碰撞响应只修改速度，不直接改状态**。状态机下一个 tick 自然读出正确结果。
4. **实体间通过读取对方上下文变量通信**，不互相调用函数。
5. **状态 = entry + do + exit**。entry 做初始化，do 做每帧更新，exit 做清理。

### 1.3 物理模型核心（区别于旧版）

足球拥有两个三维向量量，分别在 entry 中由运动器驱动：

| 量 | 含义 | 运动器类型 |
|---|------|-----------|
| 线速度 V = (Vx, Vy, Vz) | 球心的平动速度 | 直线运动器 |
| 角速度 ω = (ωx, ωy, ωz) | 球绕自身轴的旋转速度 | 旋转运动器 |

**滑动 vs 滚动** 的区别不在于「有没有旋转」，而在于**线速度与角速度是否耦合**：

| 状态 | 线速度 V | 角速度 ω | 关系 |
|------|---------|----------|------|
| 滚动 (ROLL) | 非零 | 非零 | ω = V / r，纯滚动无滑移 |
| 滑动 (SLIDE) | 非零 | 可非零 | V 和 ω 独立，各自衰减 |
| 空中 (AIR) | 非零 | 可非零 | V 和 ω 独立，ω 产生马格努斯偏移 |
| 静止 (STILL) | 零 | 零 | — |
| 锁定 (LOCK) | 受控 | 受控 | 由控球模组决定 |

---

## 2. 足球状态机 (Ball FSM)

### 2.1 状态编码

```
S_STILL  = 0   静止
S_ROLL   = 1   滚动（线速度与角速度耦合）
S_SLIDE  = 2   滑动（线速度与角速度独立）
S_AIR    = 3   空中
S_LOCK   = 4   被球员锁定
```

### 2.2 上下文 (BallContext)

```typescript
interface BallContext {
  state: bigint              // 当前状态
  xzSpeed: number            // 水平速率（从 Vx, Vz 计算）
  ballVx: number             // 线速度 X
  ballVy: number             // 线速度 Y
  ballVz: number             // 线速度 Z
  ballY: number              // 当前高度
  angularVx: number          // 角速度 X
  angularVy: number          // 角速度 Y
  angularVz: number          // 角速度 Z
  ballRadius: number         // 球半径
  lockedBy: bigint | null    // 锁定此球的球员实体 ID（null = 自由）
  nearestPlayerId: bigint    // 最近球员的实体 ID
  nearestPlayerDist: number  // 最近球员的距离
  distFromLocker: number     // 球离锁定者的距离（lockedBy 非空时有意义）
}
```

### 2.3 转移表

按 **优先级从高到低** 排列。每个 tick 执行 `nextState(ctx)`，返回第一个守卫命中的目标状态：

```
优先级  守卫函数              条件                                      目标状态
──────────────────────────────────────────────────────────────────────────────
 1     canExitLock          state==LOCK AND distFromLocker > 2m       地面状态*
                                                                      (按 xzSpeed 决定)
 2     canEnterLock         lockedBy==null                            LOCK
                            AND nearestPlayerDist < 0.5m
                            AND xzSpeed < 2.0

 3     canEnterAirGround    state∈{STILL,ROLL,SLIDE}                 AIR
                            AND ballVy > 0
                            (被踢起或地面反弹后弹起)

 4     canLand              state==AIR                               地面状态*
                            AND ballY <= ballRadius                   (按 xzSpeed 决定)
                            AND ballVy <= 0

 5     canEnterStill        state∈{ROLL,SLIDE} AND xzSpeed < 0.1     STILL

 6     canEnterRoll         state∈{SLIDE,AIR} AND xzSpeed∈[0.1,4.0)  ROLL
                            AND ballY <= ballRadius

 7     canEnterSlide        state∈{ROLL,STILL,AIR}                   SLIDE
                            AND xzSpeed >= 7.0
                            AND ballY <= ballRadius

 8     (default)                                                     保持当前状态
```

\* 地面状态分派规则（`dispatchGroundState(xzSpeed)`）：
- `xzSpeed < 0.5` → STILL
- `xzSpeed ∈ [0.5, 7.0)` → ROLL
- `xzSpeed >= 7.0` → SLIDE

### 2.4 各状态动作

#### STILL（静止）

```
entry:
  - 设置 Vx=Vy=Vz=0, ωx=ωy=ωz=0
  - ballY = ballRadius
  - 停止所有运动器

do:
  - 空（不消耗性能，等待外力改变速度）

exit:
  - 无（运动器已在 entry 停止）
```

#### ROLL（滚动）

```
entry:
  - 启动直线运动器（驱动力 = 当前 V）
  - 启动旋转运动器（角速度 = xzSpeed / ballRadius，转轴 = V × up 的垂直方向）
  - frictionDecay = 0.95

do:
  - Vx *= 0.95, Vz *= 0.95
  - ω = V / ballRadius（角速度和线速度始终耦合）
  - 更新运动器参数

exit:
  - 停止直线运动器
  - 停止旋转运动器
```

#### SLIDE（滑动）

```
entry:
  - 启动直线运动器（驱动力 = 当前 V）
  - 启动旋转运动器（驱动力 = 当前 ω，ω 独立于 V）
  - frictionDecay = 0.95
  - angularDecay = 0.90（角速度衰减比线速度快）

do:
  - Vx *= 0.95, Vz *= 0.95
  - ωx *= 0.90, ωy *= 0.90, ωz *= 0.90
  - 更新运动器参数

exit:
  - 停止直线运动器
  - 停止旋转运动器
```

#### AIR（空中）

```
entry:
  - 启动直线运动器（含 Y 分量驱动力）
  - 启动旋转运动器（ω 驱动）
  - airResistance = 0.995
  - gravity = 9.8

do:
  - Vy -= gravity * dt（dt = 0.12s）
  - ballY += Vy * dt
  - Vx *= 0.995, Vz *= 0.995
  - 简单马格努斯偏移：速度方向绕 ω 轴每 tick 偏转一个小角度
  - ω 独立衰减（ω *= 0.998）
  - 更新运动器参数

exit:
  - ballVy = 0
  - ballY = ballRadius
  - 停止所有运动器
```

#### LOCK（锁定）

```
entry:
  - lockedBy = nearestPlayerId
  - 给球施加初始水平速度（≥ 7.0，确保进入 SLIDE）
  - 方向：朝向 lockedBy 球员的前方

do (滑-滚-追循环):
  1. 球以初始速度滑出 → 线速度自然衰减
  2. 球自动从 SLIDE → ROLL（由转移表驱动）
  3. 球从 ROLL → 减速到阈值
  4. 检查 distFromLocker:
     - dist < 2m AND 球员已追上 → 再踢一脚（施加新速度，回到步骤 1）
     - dist ≥ 2m → 触发 canExitLock，退出到自由物理

exit:
  - lockedBy = null
```

---

## 3. 碰撞响应模块 (collision.ts)

碰撞响应**不直接修改状态**，只修改速度向量。修改后下一个 tick 的转移表自然判断出正确状态。

### 3.1 地面碰撞

```
条件: ballY <= ballRadius AND ballVy < 0
响应:
  ballVy = -ballVy * 0.5   （反弹衰减系数，先写死 0.5）
  ballY  = ballRadius + ε
  Vx, Vz 保持不变
  ω 保持不变
```

如果反弹后 `ballVy > 0` → 下个 tick `canEnterAirGround` 命中 → 进入 AIR（弹起来）。
如果反弹后 `ballVy ≈ 0`（衰减到几乎不动）→ 下个 tick `canLand` 命中 → 落回地面。

### 3.2 球员碰撞

```
条件: 球与球员身体碰撞（距离 < 碰撞半径）
响应:
  根据入射角和碰撞点法线做速度反射
  反射后速度 *= 0.5（衰减系数，先写死）
  
  简单实现用坐标计算：
    incidentDir = normalize(ballPos - playerPos)
    V_reflected = V - 2 * dot(V, incidentDir) * incidentDir
    V_final = V_reflected * 0.5
```

### 3.3 碰撞之后的转移

碰撞响应只改了 V。球如果弹起来了（Vy > 0），转移表会自动走 `* → AIR`。如果没弹起来只是水平方向偏转，转移表按 xzSpeed 决定是 STILL/ROLL/SLIDE。不需要一个单独的「反弹状态」。

---

## 4. 球员状态机 (Player FSM)

### 4.1 双层结构

```
球员实体
├── 基础层 (互斥，同一时刻只有 1 个 active)
│   S_IDLE    = 0   空闲
│   S_CHASE   = 1   追球
│   S_DRIBBLE = 2   控球推进
│   S_SHOOT   = 3   射门
│   S_PASS    = 4   传球
│   S_SHIELD  = 5   护球
│   S_RECEIVE = 6   接球（守门员，暂不实现）
│
└── 叠加层 (可与基础层共存)
    MOD_NONE   = 0   无叠加
    MOD_SPRINT = 1   冲刺加速
```

### 4.2 叠加兼容矩阵

```
allowModifier(base, mod):

  IDLE    + SPRINT → ✓ 允许（无球冲刺跑位）
  CHASE   + SPRINT → ✓ 允许（加速追球）
  DRIBBLE + SPRINT → ✓ 允许（带球冲刺）
  SHOOT   + SPRINT → ✗ 不允许
  PASS    + SPRINT → ✗ 不允许
  SHIELD  + SPRINT → ✗ 不允许
  RECEIVE + SPRINT → ✗ 不允许
```

### 4.3 和 Ball FSM 的联动

Player FSM 不直接调用 Ball 的状态切换函数。而是：

1. Player 读取 Ball 上下文变量（位置、速度、状态、lockedBy）
2. Player 根据上下文做出决策（追球 / 控球 / 射门）
3. 如果 Player 满足锁定条件（离球 < 0.5m + ball.xzSpeed < 2.0）+ 球未被锁定
4. Player 通过事件或全局变量向 Ball 发出「我被 X 锁定」的信号
5. Ball 的下一个 tick 检测到锁定信号 → `canEnterLock` 命中 → 进入 LOCK

**锁定流程**：

```
Player[tick]:
  if ball.state != LOCK
     AND dist(me, ball) < 0.5
     AND ball.xzSpeed < 2.0:
    → 设置 ball 的 lockedBy = me（或通过事件通知 Ball）
    → 自身进入 DRIBBLE

Ball[tick]:
  ctx = buildContext(ball)
  if canEnterLock(ctx):
    → 进入 LOCK，执行 entry (初始踢球速度)

Player[tick]（已进入 DRIBBLE）:
  读取 ball.state == LOCK AND ball.lockedBy == me
  如果自己移动了 → 不需要手动移球（Ball 的 LOCK.do 自己处理滑-滚-追）
  如果按射门键 → 自身进入 SHOOT + 给球施加踢球力 → Ball 退出 LOCK
```

### 4.4 玩家类型

| 类型 | 描述 | Player FSM 实现 |
|------|------|----------------|
| 真人玩家 | 通过游戏客户端控制移动 | 移动由编辑器/客户端驱动，FSM 只负责球相关的行为切换 |
| AI 玩家 | 算法自动追球和决策 | 后续实现，FSM 状态切换逻辑可复用，diff 仅在 do() 的驱动方式 |

---

## 5. 文件规划

```
src/
├── stateMachine.ts     ← 状态枚举 + BallContext + 守卫函数 + nextState() + entry/exit
├── ball_physics.ts     ← 各状态的 do() 物理计算（ROLL/SLIDE/AIR/LOCK 运动逻辑）
├── collision.ts        ← 碰撞检测 + 碰撞响应（只修改速度，不改状态）
├── kick.ts             ← 踢球方向计算 + 权重（迁移现有逻辑）
├── kick_weights.ts     ← 踢球权重计算（迁移现有逻辑）
├── player_fsm.ts       ← 球员基础状态机（状态定义 + 转移 + do）
├── player_modifier.ts  ← 技能叠加层（SPRINT 等，运行时与基础层组合）
└── main.ts             ← node graph 组装入口
```

### 职责边界

- `stateMachine.ts` — **唯一**包含转移逻辑的文件。加新状态只改这里。
- `ball_physics.ts` — 纯物理计算。每个状态的 `do()` 函数，无副作用的状态更新。
- `collision.ts` — 纯碰撞响应。输入速度向量，输出修改后的速度向量。
- `player_fsm.ts` — 球员基础状态转移 + do()，与 Ball 解耦。
- `player_modifier.ts` — 叠加层的兼容矩阵 + do() 修改器。
- `main.ts` — 只做组装：`g.server().on(...)` 绑定事件和调用。

---

## 6. Node Graph 挂载方案

### 6.1 实体与 ID 对应

| 源文件 | 挂载实体 | 实体数量 | 运行次数 | 说明 |
|--------|---------|---------|---------|------|
| `main.ts` (Ball) | 足球实体 | 1 个（手动放置） | 1 次 | Ball FSM，所有足球物理逻辑 |
| `main.ts` (Player) | 角色实体 | N 个（自动生成） | N 次（每个角色独立运行一份） | Player FSM，挂载在一个角色实体上，每个玩家实例各自拥有独立变量 |

### 6.2 Node Graph ID

- 足球实体 ID：需要从游戏引擎中查询后填入
- 角色实体 ID：角色实体自动生成，使用对应的实体类型 ID
- 后续新增 node graph 可以按需分配新 ID

### 6.3 变量作用域

- 挂在**足球实体**上的 node graph：图变量是唯一的（因为只有一个球）
- 挂在**角色实体**上的 node graph：每个角色实例拥有**各自独立的**图变量副本

### 6.4 跨实体通信

```
Ball 需要读取 Player 信息（nearestPlayerDist, nearestPlayerId）:
  → 遍历所有 Player 实体，计算距离，找最近的

Player 需要读取 Ball 信息（位置、速度、状态、lockedBy）:
  → 直接读取 Ball 实体的自定义变量
```

在 genshin-ts 节点图中，跨实体读取通过 `f.获取实体自定义变量(实体ID, '变量名')` 实现。

---

## 7. 和旧版代码的关系

### 保留可以复用的

- `kick_weights.ts` — 权重计算函数，逻辑不变
- `motion.ts` 中的 `计算旋转轴方向`、`施加基础运动` — 纯物理工具函数，可复用
- `motion.ts` 中的 `三维向量` 操作模式 — 作为写新 do() 的参考

### 废弃的

- 每个物理状态独立的 node graph（`roll.ts`, `slide.ts`, `air.ts`）→ 合并为单一 Ball FSM
- 分散在各文件里的转移逻辑 → 集中到 `stateMachine.ts`
- `判定目标状态` — 分散的落地后分派逻辑 → 改为 `dispatchGroundState(xzSpeed)` 集中处理

---

## 8. 实现计划

### Phase 1: 基础骨架 (stateMachine.ts + ball_physics.ts)

- [ ] 状态枚举定义
- [ ] BallContext 类型定义
- [ ] 守卫函数：canExitLock, canEnterLock, canEnterAirGround, canLand, canEnterStill, canEnterRoll, canEnterSlide
- [ ] dispatchGroundState(xzSpeed)
- [ ] nextState(ctx): bigint 核心转移函数
- [ ] onEnter/onExit 框架（每个状态含 entry/exit 动作桩）

### Phase 2: 物理计算 (ball_physics.ts)

- [ ] STILL.do()
- [ ] ROLL.do() — 线速度+角速度耦合
- [ ] SLIDE.do() — 线速度+角速度独立衰减
- [ ] AIR.do() — 重力+空气阻力+简单马格努斯偏移
- [ ] LOCK.do() — 滑-滚-追循环

### Phase 3: 碰撞 (collision.ts)

- [ ] 地面碰撞检测与响应
- [ ] 球员碰撞检测与响应（简单反射）

### Phase 4: 组装 (main.ts)

- [ ] 单 node graph 挂载到足球实体
- [ ] `自定义变量变化时` 事件入口
- [ ] `定时器触发时` tick 循环
- [ ] 编译验证（typecheck + lint + build）

### Phase 5: 球员 FSM

- [ ] player_fsm.ts — 基础层定义与转移
- [ ] player_modifier.ts — 叠加层兼容矩阵
- [ ] 球员 node graph 挂载

### Phase 6: 测试与调参

- [ ] 进入游戏实测
- [ ] 调反弹系数、摩擦衰减、空气阻力
- [ ] 调锁定距离阈值
- [ ] 调马格努斯力偏移量
