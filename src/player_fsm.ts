// player_fsm.ts — 球员基础状态机（互斥层）
// 包含：状态枚举、PlayerContext 类型、转移决策函数
// 按 docs/STATE_MACHINE_DESIGN_ZH.md 第 4 节规范实现
// 当前阶段：骨架。转移逻辑后续填充（涉及玩家输入和 AI 决策）

import { entity } from 'genshin-ts-touyu/runtime/value'

// ============================================================
// 4.1 基础状态枚举（bigint，同一时刻只有 1 个 active）
// ============================================================

/** 空闲：无球状态下待机，等待 AI 指令或玩家输入 */
export const P_IDLE = 0n
/** 追球：向球移动，尝试取得球权 */
export const P_CHASE = 1n
/** 控球推进：球在 LOCK 且 lockedBy == self，带球前进 */
export const P_DRIBBLE = 2n
/** 射门：短暂的射门动作（触发踢球力，之后回到 CHASE/IDLE） */
export const P_SHOOT = 3n
/** 传球：短暂的传球动作（触发传球力，之后回到 CHASE/IDLE） */
export const P_PASS = 4n
/** 护球：球在脚下，低速移动护球 */
export const P_SHIELD = 5n
/** 接球：守门员专用，接住来袭的球（当前仅骨架，暂不实现） */
export const P_RECEIVE = 6n

// ============================================================
// 4.2 PlayerContext — 球员决策所需的上下文快照
//     每个 tick 由 main.ts 构建，传入 playerNextState
// ============================================================

export interface PlayerContext {
  /** 当前基础状态（P_IDLE / P_CHASE / P_DRIBBLE 等） */
  state: bigint
  /** 当前叠加状态（MOD_NONE / MOD_SPRINT，0n = 无叠加） */
  modifier: bigint
  /** Ball FSM 的当前状态（S_STILL / S_ROLL / S_SLIDE / S_AIR / S_LOCK） */
  ballState: bigint
  /** Ball 的 lockedBy 字段（0n = 自由，非 0n = 被某球员锁定） */
  ballLockedBy: entity
  /** 自身到球的距离（米） */
  distToBall: number
  /** 自身的水平速率（米/秒） */
  xzSpeed: number
}

// ============================================================
// 4.3 转移决策函数 playerNextState
//     当前阶段：骨架，直接返回 ctx.state（保持当前状态）
//     后续填充：IDLE → CHASE → DRIBBLE 等完整转移逻辑
//     守卫条件和转移表将在后续版本中逐步添加
// ============================================================

/**
 * 根据球员上下文决定下一基础状态。
 * 当前骨架实现：保持当前状态不变。
 * 后续版本将按优先级依次检查转移条件，返回第一个命中的目标状态。
 *
 * 计划中的转移骨架：
 *   IDLE    → CHASE    (球自由 + 最近球员距离够近)
 *   CHASE   → DRIBBLE  (球被自己锁定)
 *   CHASE   → IDLE     (球被队友锁定 或 太远)
 *   DRIBBLE → SHOOT    (射门指令触发)
 *   DRIBBLE → PASS     (传球指令触发)
 *   DRIBBLE → CHASE    (球失控，lockedBy != self)
 *   SHOOT   → CHASE    (射门动作完成)
 *   PASS    → CHASE    (传球动作完成)
 *
 * @param ctx 球员上下文快照
 * @returns 下一 tick 的基础状态（当前版本恒返回 ctx.state）
 */
export function playerNextState(ctx: PlayerContext): bigint {
  // 骨架：保持当前状态不变
  // 后续逐步添加转移守卫，例如：
  // if (ctx.state === P_IDLE && ballIsFree(ctx)) { return P_CHASE }
  return ctx.state
}
