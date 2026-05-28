# 核心 API 速查

> 来源：`docs/AGENT_SHARED_KNOWLEDGE.md` 第 3、4 章节提取。独立速查文档，供开发时快速翻阅。

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
// 读取（使用 .asType() 简写）
let ballVx = f.获取自定义变量(entity, 'ballVx').asType('float')

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
