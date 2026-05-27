// stateMachine.ts — 足球物理状态机核心
// 包含：状态枚举、BallContext 类型、守卫函数、转移逻辑、entry/exit 动作函数
// 按 docs/STATE_MACHINE_DESIGN_ZH.md 第 2 节规范实现
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// ↑ f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明，禁用 any 安全警告

import { entity } from 'genshin-ts-touyu/runtime/value'

// ============================================================
// 2.1 状态枚举（bigint，必须带 n 后缀）
// ============================================================

/** 静止：速度为零，球静止在地面 */
export const S_STILL = 0n
/** 滚动：线速度与角速度耦合（纯滚动无滑移） */
export const S_ROLL = 1n
/** 滑动：线速度与角速度独立衰减 */
export const S_SLIDE = 2n
/** 空中：受重力和空气阻力影响 */
export const S_AIR = 3n
/** 锁定：球被球员控制，走滑-滚-追循环 */
export const S_LOCK = 4n

// ============================================================
// 2.2 BallContext 上下文类型
//     每个 tick 传给守卫函数的球状态快照（由 main.ts 构建）
// ============================================================

export interface BallContext {
  /** 当前状态（S_STILL / S_ROLL / S_SLIDE / S_AIR / S_LOCK） */
  state: bigint
  /** 水平速率 sqrt(Vx² + Vz²) */
  xzSpeed: number
  /** 线速度 X 分量 */
  ballVx: number
  /** 线速度 Y 分量（垂直） */
  ballVy: number
  /** 线速度 Z 分量 */
  ballVz: number
  /** 球心当前高度 */
  ballY: number
  /** 角速度 X 分量 */
  angularVx: number
  /** 角速度 Y 分量 */
  angularVy: number
  /** 角速度 Z 分量 */
  angularVz: number
  /** 球半径（0.45m） */
  ballRadius: number
  /** 锁定此球的球员实体 ID，等于 ballSelf 表示自由（未被锁定） */
  lockedBy: entity
  /** 球自身实体引用（用于判断 lockedBy 是否等于 ballSelf = 自由） */
  ballSelf: entity
  /** 最近球员的实体 ID */
  nearestPlayerId: bigint
  /** 最近球员距离（米） */
  nearestPlayerDist: number
  /** 球到锁定者的距离（lockedBy 非 0n 时有意义） */
  distFromLocker: number
}

// ============================================================
// 2.3 守卫函数（纯布尔，只读 ctx，无副作用）
//     按优先级从高到低排列（优先级 1 = 最高）
//     每个守卫返回 boolean，表示是否满足该转移条件
// ============================================================

/**
 * 优先级 1：退出锁定
 * 条件：当前为锁定状态 且 球离锁定者超过 2 米
 * 目标：dispatchGroundState(xzSpeed) — 按水平速率决定地面状态
 */
export function canExitLock(ctx: BallContext): boolean {
  return bool(ctx.state === S_LOCK && ctx.distFromLocker > 2.0)
}

/**
 * 优先级 2：进入锁定
 * 条件：球未被锁定 且 最近球员距离 < 0.5m 且 水平速率 < 2.0
 * 目标：S_LOCK
 */
export function canEnterLock(ctx: BallContext): boolean {
  return bool(ctx.lockedBy == ctx.ballSelf && ctx.nearestPlayerDist < 0.5 && ctx.xzSpeed < 2.0)
}

/**
 * 优先级 3：从地面进入空中
 * 条件：当前在地面状态（静止/滚动/滑动）且 垂直速度向上
 *       （被踢起或地面反弹后弹起）
 * 目标：S_AIR
 */
export function canEnterAirGround(ctx: BallContext): boolean {
  return bool(
    (ctx.state === S_STILL || ctx.state === S_ROLL || ctx.state === S_SLIDE) && ctx.ballVy > 0.0
  )
}

/**
 * 优先级 4：落地
 * 条件：当前在空中 且 球高度 <= 球半径 且 垂直速度向下（或为零）
 * 目标：dispatchGroundState(xzSpeed) — 按水平速率决定地面状态
 */
export function canLand(ctx: BallContext): boolean {
  return bool(ctx.state === S_AIR && ctx.ballY <= ctx.ballRadius && ctx.ballVy <= 0.0)
}

/**
 * 优先级 5：进入静止
 * 条件：当前在滚动/滑动状态 且 水平速率极低（< 0.1）
 * 目标：S_STILL
 */
export function canEnterStill(ctx: BallContext): boolean {
  return bool((ctx.state === S_ROLL || ctx.state === S_SLIDE) && ctx.xzSpeed < 0.1)
}

/**
 * 优先级 6：进入滚动
 * 条件：当前在滑动/空中状态 且 水平速率 ∈ [0.1, 4.0) 且 球已落地
 * 目标：S_ROLL
 */
export function canEnterRoll(ctx: BallContext): boolean {
  return bool(
    (ctx.state === S_SLIDE || ctx.state === S_AIR) &&
    ctx.xzSpeed >= 0.1 &&
    ctx.xzSpeed < 4.0 &&
    ctx.ballY <= ctx.ballRadius
  )
}

/**
 * 优先级 7：进入滑动
 * 条件：当前在滚动/静止/空中状态 且 水平速率 >= 7.0 且 球已落地
 * 目标：S_SLIDE
 */
export function canEnterSlide(ctx: BallContext): boolean {
  return bool(
    (ctx.state === S_ROLL || ctx.state === S_STILL || ctx.state === S_AIR) &&
    ctx.xzSpeed >= 7.0 &&
    ctx.ballY <= ctx.ballRadius
  )
}

// ============================================================
// 2.4 地面状态分派函数
// ============================================================

/**
 * 根据水平速率决定地面物理状态
 * - xzSpeed < 0.5   → STILL（静止）
 * - 0.5 ~ 7.0       → ROLL（滚动）
 * - xzSpeed >= 7.0   → SLIDE（滑动）
 */
export function dispatchGroundState(xzSpeed: number): bigint {
  if (bool(xzSpeed < 0.5)) {
    return S_STILL
  }
  if (bool(xzSpeed < 7.0)) {
    return S_ROLL
  }
  return S_SLIDE
}

// ============================================================
// 2.5 核心转移函数 nextState
// ============================================================

/**
 * 按优先级 1→7 依次检查守卫函数。
 * 返回第一个命中的目标状态，都不命中则返回 ctx.state（保持当前状态）。
 */
export function nextState(ctx: BallContext): bigint {
  // 优先级 1：退出锁定 → 按水平速率分派地面状态
  if (canExitLock(ctx)) {
    return dispatchGroundState(ctx.xzSpeed)
  }
  // 优先级 2：进入锁定
  if (canEnterLock(ctx)) {
    return S_LOCK
  }
  // 优先级 3：地面状态 → 空中
  if (canEnterAirGround(ctx)) {
    return S_AIR
  }
  // 优先级 4：空中 → 落地（按水平速率分派地面状态）
  if (canLand(ctx)) {
    return dispatchGroundState(ctx.xzSpeed)
  }
  // 优先级 5：进入静止
  if (canEnterStill(ctx)) {
    return S_STILL
  }
  // 优先级 6：进入滚动
  if (canEnterRoll(ctx)) {
    return S_ROLL
  }
  // 优先级 7：进入滑动
  if (canEnterSlide(ctx)) {
    return S_SLIDE
  }
  // 默认：保持当前状态不变
  return ctx.state
}

// ============================================================
// 2.6 entry/exit 动作函数
//     entry: 设置状态常量和物理参数（触发事件交给 main.ts）
//     exit:  停止基础运动器
//     运动器施加留给 ball_physics.ts 的 do() 函数
//     所有函数通过参数 f 获取节点图 API
// ============================================================

// --- STILL（静止）---

/**
 * 进入静止：
 * - 清零所有线速度和角速度分量
 * - 球高度重置为球半径（贴地）
 * - 写状态为 STILL
 * - 停止所有基础运动器
 */
export function enterStill(f: any): void {
  f.设置自定义变量(self, 'ballVx', 0.0, true)
  f.设置自定义变量(self, 'ballVy', 0.0, true)
  f.设置自定义变量(self, 'ballVz', 0.0, true)
  f.设置自定义变量(self, 'angularVx', 0.0, true)
  f.设置自定义变量(self, 'angularVy', 0.0, true)
  f.设置自定义变量(self, 'angularVz', 0.0, true)
  f.设置自定义变量(self, 'ballY', 0.45, true)
  f.设置自定义变量(self, '状态', S_STILL, true)
  f.停止并删除基础运动器(self, 'ballLinear', true)
  f.停止并删除基础运动器(self, 'ballRotate', true)
}

/** 退出静止：无需清理（速度已归零、运动器已停） */
export function exitStill(_f: any): void {
  // 无操作
}

// --- ROLL（滚动）---

/**
 * 进入滚动：
 * - 设置摩擦衰减 frictionDecay = 0.95
 * - 写状态为 ROLL
 * （线速度、角速度和运动器施加由 ball_physics.ts 处理）
 */
export function enterRoll(f: any): void {
  f.设置自定义变量(self, 'frictionDecay', 0.95, true)
  f.设置自定义变量(self, '状态', S_ROLL, true)
}

/** 退出滚动：停止所有基础运动器 */
export function exitRoll(f: any): void {
  f.停止并删除基础运动器(self, 'ballLinear', true)
  f.停止并删除基础运动器(self, 'ballRotate', true)
}

// --- SLIDE（滑动）---

/**
 * 进入滑动：
 * - 设置摩擦衰减 frictionDecay = 0.95
 * - 设置角速度衰减 angularDecay = 0.90
 * - 写状态为 SLIDE
 * （线速度、角速度和运动器施加由 ball_physics.ts 处理）
 */
export function enterSlide(f: any): void {
  f.设置自定义变量(self, 'frictionDecay', 0.95, true)
  f.设置自定义变量(self, 'angularDecay', 0.9, true)
  f.设置自定义变量(self, '状态', S_SLIDE, true)
}

/** 退出滑动：停止所有基础运动器 */
export function exitSlide(f: any): void {
  f.停止并删除基础运动器(self, 'ballLinear', true)
  f.停止并删除基础运动器(self, 'ballRotate', true)
}

// --- AIR（空中）---

/**
 * 进入空中：
 * - 设置空气阻力 airResistance = 0.995
 * - 设置重力 gravity = 9.8
 * - 写状态为 AIR
 * （运动器施加由 ball_physics.ts 处理）
 */
export function enterAir(f: any): void {
  f.设置自定义变量(self, 'airResistance', 0.995, true)
  f.设置自定义变量(self, 'gravity', 9.8, true)
  f.设置自定义变量(self, '状态', S_AIR, true)
}

/**
 * 退出空中：
 * - 清零垂直速度 ballVy
 * - 球高度重置为球半径（贴地）
 * - 停止所有基础运动器
 */
export function exitAir(f: any): void {
  f.设置自定义变量(self, 'ballVy', 0.0, true)
  f.设置自定义变量(self, 'ballY', 0.45, true)
  f.停止并删除基础运动器(self, 'ballLinear', true)
  f.停止并删除基础运动器(self, 'ballRotate', true)
}

/**
 * 进入锁定（已废弃，改用内联模式）
 * @deprecated 跨函数传递 entity 引用会导致 GIA 类型解析失败，已在 main2.ts/main3.ts 中内联
 */
export function enterLock(f: any, ctx: BallContext): void {
  f.设置自定义变量(self, 'lockedBy', ctx.nearestPlayerId, true)
  f.设置自定义变量(self, '状态', S_LOCK, true)
}

/**
 * 退出锁定（已废弃，改用内联模式）
 * @deprecated 同上
 */
export function exitLock(f: any): void {
  f.设置自定义变量(self, 'lockedBy', 0n, true)
}
