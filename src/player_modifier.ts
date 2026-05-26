// player_modifier.ts — 技能叠加层
// 包含：叠层枚举、兼容矩阵、效果施加函数
// 按 docs/STATE_MACHINE_DESIGN_ZH.md 第 4.2 节规范实现
// 当前阶段：骨架。SPRINT 的速度加成后续实现
/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================
// 4.1 叠加状态枚举（bigint，可与基础层共存）
// ============================================================

/** 无叠加：未激活任何技能 */
export const MOD_NONE = 0n
/** 冲刺加速：提高移动速度 */
export const MOD_SPRINT = 1n

// ============================================================
// 4.2 兼容矩阵 — 允许某个叠加在某个基础状态上的检查
//     按设计文档第 4.2 节定义的兼容表
// ============================================================

// 基础状态枚举引用（值与 player_fsm.ts 中定义一致）
// 内联常量避免循环导入，仅声明 allowModifier 中实际需要匹配的状态
const P_IDLE = 0n
const P_CHASE = 1n
const P_DRIBBLE = 2n
// P_SHOOT / P_PASS / P_SHIELD / P_RECEIVE 不需要显式引用 —
// allowModifier 通过 fallthrough return false 统一处理所有不允许的组合

/**
 * 检查某个叠加（mod）是否允许在指定基础状态（base）上激活。
 *
 * 兼容矩阵：
 *   IDLE    + SPRINT → true   (无球冲刺跑位)
 *   CHASE   + SPRINT → true   (加速追球)
 *   DRIBBLE + SPRINT → true   (带球冲刺)
 *   SHOOT   + SPRINT → false  (射门中不可冲刺)
 *   PASS    + SPRINT → false  (传球中不可冲刺)
 *   SHIELD  + SPRINT → false  (护球中不可冲刺)
 *   RECEIVE + SPRINT → false  (接球中不可冲刺)
 *
 * MOD_NONE 与任何基础状态兼容（恒返回 true）。
 *
 * @param base 基础状态（P_IDLE / P_CHASE / ...）
 * @param mod  叠加状态（MOD_NONE / MOD_SPRINT）
 * @returns true = 允许叠加，false = 不允许
 */
export function allowModifier(base: bigint, mod: bigint): boolean {
  // MOD_NONE 与任何基础状态兼容
  if (bool(mod === MOD_NONE)) {
    return true
  }

  // MOD_SPRINT 兼容矩阵
  if (bool(mod === MOD_SPRINT)) {
    // 允许 SPRINT 的基础状态：IDLE、CHASE、DRIBBLE
    if (bool(base === P_IDLE)) {
      return true
    }
    if (bool(base === P_CHASE)) {
      return true
    }
    if (bool(base === P_DRIBBLE)) {
      return true
    }
    // 不允许 SPRINT 的基础状态：SHOOT、PASS、SHIELD、RECEIVE
    // 以及 unknown base（防御性：不允许）
    return false
  }

  // 未知 mod：不允许
  return false
}

// ============================================================
// 4.3 效果施加函数 applyModifier
//     当前阶段：骨架。后续 SPRINT 会在这里做速度加成
// ============================================================

/**
 * 对运动参数施加 modifier 效果。
 *
 * 当前骨架实现：
 *   - mod == MOD_NONE    → 不做任何事
 *   - mod == MOD_SPRINT  → 暂时不做任何事（速度加成逻辑后续实现）
 *
 * 后续计划：
 *   - SPRINT 提高角色移动速度上限（通过设置角色组件参数或图变量）
 *   - 可能的实现：f.设置自定义变量(self, 'moveSpeedMultiplier', 1.3)
 *
 * @param _f    节点图 API（当前未使用，保留供后续 sprint 实现）
 * @param base  当前基础状态
 * @param mod   当前叠加状态
 */
export function applyModifier(_f: any, base: bigint, mod: bigint): void {
  // MOD_NONE：不做任何事
  if (bool(mod === MOD_NONE)) {
    return
  }

  // MOD_SPRINT：当前骨架，不做任何事
  // 后续实现：读取并修改角色的移动速度参数
  // 示例：_f.设置自定义变量(self, 'sprintMultiplier', 1.3)
  if (bool(mod === MOD_SPRINT)) {
    // 骨架：暂不实现速度加成
    // 此处预留 base 参数用于后续判断是否在合法的 Sprint 状态中
    void base // 抑制 unused variable 警告
    return
  }
}
