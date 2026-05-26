# 代码问题与优化方案

## 一、Bug（功能正确性问题）

### 1.1 双人同时踢球竞争

**场景**：两个角色的 mainTick 几乎同时触发，A 和 B 都读到球状态=0，各自写状态=4，各自启动 kickProcess。

**后果**：两个 kickProcess 几乎同时执行，各自读到的 ballVx/ballVz 可能都是旧值，后写入的覆盖前一个，导致冲量冲突，其中一个角色的踢球完全丢失。

**根因**：状态=4 是一个"单次锁"，只能阻止下一个 mainTick，无法防止同 tick 内的竞争。

### 1.3 air.ts 落地无弹力

**场景**：球落地时 `ballY <= 0.45`，直接 `ballVy = 0` 落地。

**后果**：无论从多高落下，球都没有弹跳，直接转为地面状态。物理行为不真实。

**根因**：代码缺少垂直速度阈值判断和反弹逻辑。

---

## 二、性能问题

### 2.1 air.ts 分支 B 每 tick 触发状态事件

**位置**：`src/air.ts:78`

```ts
f.设置自定义变量(self, '状态', 3n, true) // true = 触发事件
```

**问题**：空中每 0.12 秒设置一次状态=3 并触发 `自定义变量变化时` 事件，三个图的 handler 都会响应（虽然最终都无操作），浪费节点图节点。状态没有变化时不需要触发事件。

**建议**：移除 `true` 参数（不触发事件）。

### 2.2 三份 `自定义变量变化时` handler 重复

**位置**：`air.ts:13-25`、`roll.ts:13-25`、`slide.ts:11-23`

**问题**：12 行结构体在三个文件中逐字复制，仅状态值和定时器名不同。每个 handler 中 `f.数据类型转换(evt.postChangeValue, 'int')` 被调用两次（`==` 和 `!=`），各生成独立节点图节点。

---

## 三、解决方案

### 3.1 抢球锁定状态（解决 1.1 + 1.2）

#### 核心问题：多人游玩的调度架构

当前 main.ts 使用 `self`（挂在单个角色实体上），只检查当前角色能否踢球。多人模式下，需要有**一个 centralized 调度器**来遍历所有角色，找出最合适的那个来踢球。

#### 方案设计

**main.ts 改为 centralized 角色调度器**：

1. main.ts 不再依赖 `self` 代表踢球者，而是主动查找场上所有角色实体
2. 每 10 秒重新随机排序一次角色列表（公平性）
3. 每 0.12 秒遍历排序后的角色列表，对**第一个**同时满足以下条件的角色执行踢球：
   - 球不在特殊状态（未被锁定）
   - 角色与球的距离满足条件（新增 `kickRange` 参数）
4. 踢球触发时设球为特殊状态（如状态=5），持续 0.5s，此状态下不触发踢球条件

#### 实现要点

##### 角色列表随机排序

在 main.ts 的 `_ballInit` 块中，每 10 秒执行一次：

```ts
// 每 10s 重新排序一次角色列表（用一次性定时器做递归）
f.启动定时器(self, 'reorderPlayers', false, [10.0])
```

`定时器触发时` 中处理 `reorderPlayers`：

```ts
获取当前的玩家数量.
获取随机整数 得到玩家数量的索引 如[2,1,4,5,3]
获取玩家/角色实力数组 遍历

}
```

##### 踢球条件

```ts
// ballState == 5n = 特殊锁状态
if (bool(ballState != 5n && pDist < kickRange)) {
  // 锁定球
  f.设置自定义变量(ball, '状态', 5n, true)
  f.设置自定义变量(ball, 'lastKickTick', tc)
  // 在 kicker 身上启动 kickProcess
  f.启动定时器(kicker, 'kickProcess', false, [0.01])
}
```

注意 `f.启动定时器(kicker, 'kickProcess', ...)` —— 定时器挂在被选中的角色身上，这样 kick.ts 中的 `self` 指向的就是踢球角色，与当前逻辑兼容。

##### 0.5s 锁状态

用 ball 上的图处理状态=5，启动 0.5s 定时器做超时解锁：

```ts
// slide.ts 添加
.on('自定义变量变化时', (evt, f) => {
  if (bool(evt.variableName != '状态')) { return }
  // @ts-expect-error generic → int
  if (bool(f.数据类型转换(evt.postChangeValue, 'int') == 5n)) {
    f.启动定时器(self, 'lockTimeout', false, [0.5])
  }
})
.on('定时器触发时', (evt, f) => {
  if (bool(evt.timerName != 'lockTimeout')) { return }
  // @ts-expect-error generic → int
  let s = f.数据类型转换(f.获取自定义变量(self, '状态'), 'int')
  if (bool(s == 5n)) {
    f.设置自定义变量(self, '状态', 0n, true)
  }
})
```

#### 与现有 kick.ts 的兼容性

kick.ts 中 `self` 指向的是被选中的踢球角色，main.ts 用 `f.启动定时器(kicker, ...)` 触发 kickProcess 后，kick.ts 的 `self` 自然就是 kicker。无需改动 kick.ts。

#### 本次需同步修改

- **main.ts**：
  - 新增节点图变量 `_playerOrder`（或类似列表缓存）
  - `_ballInit` 中增加 `kickRange` 自定义变量的初始化
  - 定时器触发时逻辑改为遍历角色 + 距离检测 + 状态=5 锁定
  - 新增 `reorderPlayers` 定时器处理
- **kick.ts**：无需改动
- **slide.ts**（或其他 ball 图）：添加状态=5 的超时处理
- **motion.ts**：可考虑添加辅助函数

### 3.2 air.ts 弹力分支（解决 1.3）

**新增自定义变量**（在 main.ts \_ballInit 中初始化）：

- `bounceThreshold`: float = 2.0（向下速度超过此值才反弹）
- `restitution`: float = 0.6（反弹系数）

**修改 air.ts 落地逻辑**：

```ts
if (bool(ballY <= 0.45)) {
  // @ts-expect-error generic → float via dataTypeConversion
  let bounceThreshold = f.数据类型转换(f.获取自定义变量(self, 'bounceThreshold'), 'float')
  // @ts-expect-error generic → float via dataTypeConversion
  let restitution = f.数据类型转换(f.获取自定义变量(self, 'restitution'), 'float')

  if (bool(ballVy < -bounceThreshold)) {
    // 弹起
    ballVy = -ballVy * restitution
    ballY = 0.45
    f.设置自定义变量(self, 'ballVy', ballVy)
    f.设置自定义变量(self, 'ballY', ballY)
    let finalVel = f.创建三维向量(ballVx, ballVy, ballVz)
    f.设置自定义变量(self, '速度', finalVel)
    f.设置自定义变量(self, 'ballVx', ballVx)
    f.设置自定义变量(self, 'ballVz', ballVz)
    return
  }

  // 真正落地（原有逻辑）
  f.设置自定义变量(self, 'ballVy', 0.0)
  f.设置自定义变量(self, 'ballY', 0.45)
  // ... 后续状态判定不变 ...
}
```

### 3.3 air.ts 移除冗余状态事件（解决 2.1）

```ts
// 旧：
f.设置自定义变量(self, '状态', 3n, true)

// 新：
f.设置自定义变量(self, '状态', 3n)
```

状态值没有变化（本来就是 3），无需触发事件。

### 3.4 抽取共享定时器管理函数（解决 2.2）

在 `motion.ts` 中新增：

```ts
export function gstsServer状态定时器开关(f: any, evt: any, targetState: bigint, timerName: string) {
  if (bool(evt.variableName != '状态')) {
    return
  }
  // @ts-expect-error generic → int via dataTypeConversion
  let newState = f.数据类型转换(evt.postChangeValue, 'int')
  if (bool(newState == targetState)) {
    f.启动定时器(self, timerName, true, [0.12])
  }
  if (bool(newState != targetState)) {
    f.终止定时器(self, timerName)
  }
}
```

三个文件各 12 行替换为单行调用：

```ts
// slide.ts
.on('自定义变量变化时', (evt, f) => {
  gstsServer状态定时器开关(f, evt, 2n, 'motionTick')
})
// roll.ts
.on('自定义变量变化时', (evt, f) => {
  gstsServer状态定时器开关(f, evt, 1n, 'motionTick')
})
// air.ts
.on('自定义变量变化时', (evt, f) => {
  gstsServer状态定时器开关(f, evt, 3n, 'airTick')
})
```

---

## 四、优先修复顺序

| 优先级 | 问题                                    | 分类     | 影响面   |
| ------ | --------------------------------------- | -------- | -------- |
| P0     | 双人同时踢球竞争 (1.1) + 空中连踢 (1.2) | Bug      | 核心玩法 |
| P0     | 抢球锁定状态 (3.1)                      | 修复方案 | 配套变更 |
| P1     | 空中落地无弹力 (1.3)                    | Bug      | 物理体验 |
| P2     | air.ts 冗余状态事件 (2.1)               | 性能     | 节点效率 |
| P3     | handler 重复 (2.2)                      | 整洁     | 可维护性 |
