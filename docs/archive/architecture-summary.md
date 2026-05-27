# 足球带球系统架构

## 概述

多人足球带球控制系统，基于 genshin-ts-touyu 节点图编译，使用事件驱动状态机管理足球的 5 种运动状态。

5 个节点图相互独立，通过足球的自定义变量 `状态` 的变化事件来协调切换，形成分布式状态机。

---

## 节点图总览

| 节点图 | ID | 挂载实体 | 职责 |
|--------|------|----------|------|
| `main.ts` | 1073742432 | 角色实体 | 集中调度器，遍历玩家，触发踢球 |
| `kick.ts` | 1073742437 | 角色实体 | 踢球力学计算，叠加冲量 |
| `slide.ts` | 1073742435 | 足球实体 | 滑动状态(2)：地面摩擦，直线运动器 |
| `roll.ts` | 1073742434 | 足球实体 | 滚动状态(1)：地面摩擦，直线+旋转运动器 |
| `air.ts` | 1073742436 | 足球实体 | 空中状态(3)：重力，Y位移，直线+旋转运动器 |

---

## 状态定义

| 状态 | 名称 | 触发者 | 响应图 | 说明 |
|------|------|--------|--------|------|
| 0 | 静止 | 任意 | — | 球完全静止，无定时器运行 |
| 1 | 滚动 | kick/air/slide | `roll.ts` | 低速滚动（含旋转），摩擦减速 |
| 2 | 滑动 | kick/air/roll | `slide.ts` | 高速滑动（无旋转），摩擦减速 |
| 3 | 空中 | kick | `air.ts` | 重力+Y位移+弹跳 |
| 5 | 锁定 | main | `slide.ts` | 0.5s 独占期，正在踢球，不可触发新踢球 |

> 注意：状态 5 只由 main.ts 的 `gstsServer切换至锁定()` 写入。除 kick.ts 直接覆盖外，由 slide.ts 的 0.5s 超时兜底归零。

## 状态切换矩阵

```
当前状态 → 目标状态  |  触发条件
--------------------|-----------------------
任意 (由 kick.ts)    |  kick.ts 按速度判定：
  0（静止）          | 水平速度 < 0.5
  1（滚动）          | 0.5 ≤ 水平速度 < 7.0
  2（滑动）          | 水平速度 ≥ 7.0
  3（空中）          | 垂直速度 > 0.0

空中 → 地面 (由 air.ts):
  0（静止）          | 落地且水平速度 < 0.5
  1（滚动）          | 落地且 0.5 ≤ xz < 7.0
  2（滑动）          | 落地且 xz ≥ 7.0

滚动/滑动 (由各自图)：
  0（静止）          | 摩擦减速至 xz < 0.1
  1（滚动）←→ 2（滑动）| 加速/减速跨越速度阈值
```

---

## 共享函数（motion.ts）

### 定时器管理

```
gstsServer状态定时器开关(evt, targetState, timerName)
```
- 由 slide/roll/air 的 `自定义变量变化时` handler 调用
- 目标状态匹配 → 启动定时器；失配 → 停止定时器
- 消除了三份重复的 12 行 handler 结构

### 统一运动器

```
gstsServer施加基础运动(state, ballVx, ballVz, ballVy, ballRadius, rotationAxis)
```
- 对足球实体施加直线运动器
- 滚动(1)和空中(3)额外施加旋转运动器
- 滑动(2)仅施加直线运动器
- 整合了 roll.ts 和 air.ts 中重复的运动器施加逻辑

### 状态切换函数

| 函数 | 写入变量 | 触发事件 |
|------|----------|----------|
| `切换至静止()` | ballVx=0, ballVz=0, ballVy=0, ballY=0.45, 状态=0 | ✅ |
| `切换至滚动(ballVx, ballVz)` | ballVx, ballVz, 状态=1 | ✅ |
| `切换至滑动(ballVx, ballVz)` | ballVx, ballVz, 状态=2 | ✅ |
| `切换至空中(ballVx, ballVz, ballVy, ballY)` | ballVx, ballVz, ballVy, ballY, 状态=3 | ✅ |
| `切换至锁定(ball, tickCount)` | 状态=5, lastKickTick | ✅ |
| `锁定超时归零()` | 状态=0（仅当状态仍=5时） | ✅ |

### 判定函数

```
gstsServer判定目标状态(xzSpeed, ballVy) → bigint
```
- 根据速度返回目标状态值（0/1/2/3）

---

## 踢球条件（kick_weights.ts）

```
gstsServer满足踢球条件(ballState, charPos, ballPos, kickRange) → boolean
```
- 独立成函数，后续可替换为按键触发等不依赖位置的判定方式
- 当前实现：球不在锁定状态 && 距离 < kickRange

其他权重函数（不变）：
- `计算踢球方向权重(dot)` — 面朝 vs 球方向混合比
- `计算对齐权重(dot)` — 对齐度 → 力度系数
- `计算力系数(dot)` — 对齐度 → 力系数

---

## 核心流程

### main.ts（集中调度器）

```
初始化：
  实体创建时 → 启动 mainTick（0.12s 循环）

每个 mainTick：
  ① tickCount++
  ② 初始化足球自定义变量（首次）
  ③ 检查球状态 == 5？→ 锁定中，跳过
  ④ 获取所有玩家实体列表
  ⑤ 展开 8 个固定索引，逐一检查：
     获取玩家角色 → 读位置 → 调用满足踢球条件
  ⑥ 找到第一个满足条件的 → 
     切换至锁定(球, tickCount)
     在角色身上启动 kickProcess（0.01s 一次性）
```

### kick.ts（踢球力学）

```
kickProcess 触发（0.01s 后，仅执行一次）：
  ① 读角色位置/面朝/速度
  ② 读球位置/速度
  ③ 计算踢球方向（面朝与球方向混合）
  ④ 计算基础力 × 对齐权重 × 距离衰减
  ⑤ 叠加冲量到球当前速度
  ⑥ 首次踢球：随机弹跳初速度
  ⑦ 写回球速度
  ⑧ 判定目标状态 → 写入球状态（触发事件）
```

### 各状态图响应（事件驱动）

```
球状态变化（带 triggerEvent=true）→
  所有足球图同时收到事件：

  状态→1：roll 启动 motionTick，其他图停止
  状态→2：slide 启动 motionTick，其他图停止
  状态→3：air 启动 airTick，其他图停止
  状态→5：slide 启动 lockTimeout（0.5s）
  其他状态：停止所有定时器

每个状态图在自己的 tick 中：
  ① 读取球当前速度
  ② 施加摩擦/重力等物理
  ③ 调用 施加基础运动(state, ...) 
  ④ 调用 切换至XXX(...)
```

#### 各状态物理逻辑

**滚动 (roll.ts)**：
```
每 tick：ballVx *= 0.75, ballVz *= 0.75（摩擦衰减）
速度分支：< 0.1→静止, ≥ 7.0→滑动, 中间→滚动
滚动时：直线运动器 + 旋转运动器
```

**滑动 (slide.ts)**：
```
每 tick：ballVx *= 0.75, ballVz *= 0.75
速度分支：< 0.1→静止, < 4.0→滚动, ≥ 4.0→滑动
滑动时：仅直线运动器（无旋转）
```

**空中 (air.ts)**：
```
每 tick：ballVy -= 9.8 * 0.12, ballY += ballVy * 0.12
ballY ≤ 0.45 → 落地：判定目标状态并切换
ballY > 0.45 → 空中：直线运动器 + 旋转运动器
```

---

## 自定义变量（足球实体）

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| ballVx | float | 0.0 | 水平 X 速度 |
| ballVz | float | 0.0 | 水平 Z 速度 |
| ballVy | float | 0.0 | 垂直 Y 速度 |
| ballY | float | 0.45 | 球心 Y 坐标 |
| 状态 | int | 0 | 运动状态（0/1/2/3/5） |
| lastKickTick | int | 0 | 上次踢球 tick |
| hasKicked | bool | false | 是否已被踢过 |
| frictionDecay | float | 0.75 | 地面摩擦系数 |
| ballRadius | float | 0.45 | 球半径 |
| kickCooldown | int | 1 | 踢球冷却 tick 数 |
| speedMultiplier | float | 1.4 | 速度→力度系数 |
| minKickForce | float | 2.0 | 最小踢球力度 |
| distDecayStrength | float | 0.5 | 距离衰减强度 |
| gravity | float | 9.8 | 重力加速度 |
| bounceVelMin | float | 2.0 | 弹跳速度下限 |
| bounceVelMax | float | 5.0 | 弹跳速度上限 |
| 速度 | vec3 | — | 运行时速度向量 |

---

## 与编辑器边界

以下需在编辑器中预先配置：
- 5 个节点图（id=1073742432/4/5/6/7）挂载到对应实体
- 角色实体和足球实体使用正确的预制体（元件ID：足球=1077936262）
- 所有自定义变量不提前声明（运行时首次写入时自动创建）
- 锁定时 0.5s 超时由 slide.ts 管理，无需编辑器全局定时器

## 文件依赖关系

```
main.ts → motion.ts, kick_weights.ts
kick.ts → kick_weights.ts, motion.ts
slide.ts → motion.ts
roll.ts → motion.ts
air.ts → motion.ts

motion.ts: 共享函数 + 纯计算函数
kick_weights.ts: 权重表 + 踢球条件判定
```
