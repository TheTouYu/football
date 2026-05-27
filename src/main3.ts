// main3.ts — 全新 Node Graph 组装入口 (v3)
// 改进点 vs main.ts：
//   1. 碰撞检测内联到本文件的 tick handler 中（避免跨文件 GIA 类型解析问题）
//   2. 地面碰撞 + 球员碰撞均在 motionTick 中实际执行（不再禁用）
//   3. 踢球权重计算内联（纯数学函数，无外部依赖）
//   4. 球员扫描 + 碰撞合并为一个循环，减少遍历次数
//   5. 新的 Node Graph ID（1073742442 / 1073742443），与 main.ts/main2.ts 共存
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
// f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明

import { g } from 'genshin-ts-touyu/runtime/core'

import { log } from './logger'
import { doAir, doLock, doRoll, doSlide, doStill } from './ball_physics'
import { P_IDLE, playerNextState } from './player_fsm'
import { allowModifier, applyModifier, MOD_NONE } from './player_modifier'
import {
  enterAir,
  enterRoll,
  enterSlide,
  enterStill,
  exitAir,
  exitRoll,
  exitSlide,
  exitStill,
  nextState,
  S_AIR,
  S_LOCK,
  S_ROLL,
  S_SLIDE,
  S_STILL
} from './stateMachine'

// ============================================================
// 物理常量
// ============================================================

const BALL_RADIUS = 0.45
const GROUND_EPSILON = 0.001
const BOUNCE_DECAY = 0.5
// 球员碰撞半径 = 球半径 * 2（球员身体碰撞圈的粗略估计）
const PLAYER_COLLISION_RADIUS = 0.9

// ============================================================
// 踢球权重计算（从 src_old/kick_weights.ts 迁移，纯数学函数）
// ============================================================

// TODO: 踢球力学集成时使用这些权重函数
function _计算踢球方向权重(dot: number): number {
  let fw = 0.7
  if (bool(dot > 0.7)) {
    fw = 0.7
  }
  if (bool(dot > 0.0 && dot <= 0.7)) {
    fw = 0.45
  }
  if (bool(dot <= 0.0)) {
    fw = 0.25
  }
  return fw
}

function _计算对齐权重(dot: number): number {
  let weight = 0.1
  if (bool(dot > 0.9)) {
    weight = 1.2
  }
  if (bool(dot > 0.5 && dot <= 0.9)) {
    weight = 1.0
  }
  if (bool(dot > 0.0 && dot <= 0.5)) {
    weight = 0.5
  }
  if (bool(dot > -0.5 && dot <= 0.0)) {
    weight = 0.2
  }
  return weight
}

function _计算力系数(dot: number): number {
  let coeff = 0.3
  if (bool(dot > 0.9)) {
    coeff = 0.8
  }
  if (bool(dot > 0.0 && dot <= 0.9)) {
    coeff = 1.2
  }
  return coeff
}

// ============================================================
// Node Graph 1: 足球物理主控 — 挂载到足球实体 (ID: 1073742442)
// 职责：每 120ms tick 驱动完整的足球物理管线
//   扫描球员 + 碰撞检测 → 构建上下文 → 状态转移 → 物理更新
// ============================================================

g.server({
  id: 1073742442,
  name: 'Ball_FSM_主控',
  lang: 'zh',
  variables: {
    _init3: false
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init3')) {
      return
    }
    f.设置节点图变量自动类型推断('_init3', true)

    // 初始化足球自定义变量
    f.设置自定义变量(self, 'ballVx', 0.0)
    f.设置自定义变量(self, 'ballVy', 0.0)
    f.设置自定义变量(self, 'ballVz', 0.0)
    f.设置自定义变量(self, 'ballY', 0.45)
    f.设置自定义变量(self, 'angularVx', 0.0)
    f.设置自定义变量(self, 'angularVy', 0.0)
    f.设置自定义变量(self, 'angularVz', 0.0)
    f.设置自定义变量(self, 'ballRadius', 0.45)
    f.设置自定义变量(self, 'frictionDecay', 0.95)
    f.设置自定义变量(self, 'angularDecay', 0.9)
    f.设置自定义变量(self, 'airResistance', 0.995)
    f.设置自定义变量(self, 'gravity', 9.8)
    f.设置自定义变量(self, 'lockedBy', self)
    f.设置自定义变量(self, 'distFromLocker', 0.0)
    f.设置自定义变量(self, '状态', 0n)

    f.启动定时器(self, 'motionTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'motionTick')) {
      return
    }

    // ==========================================================
    // 1. 读取足球基本自定义变量
    // ==========================================================

    const ballVx = f.获取自定义变量(self, 'ballVx').asType('float')
    const ballVy = f.获取自定义变量(self, 'ballVy').asType('float')
    const ballVz = f.获取自定义变量(self, 'ballVz').asType('float')
    const ballY = f.获取自定义变量(self, 'ballY').asType('float')
    const angularVx = f.获取自定义变量(self, 'angularVx').asType('float')
    const angularVy = f.获取自定义变量(self, 'angularVy').asType('float')
    const angularVz = f.获取自定义变量(self, 'angularVz').asType('float')
    const ballRadius = f.获取自定义变量(self, 'ballRadius').asType('float')
    const lockedByEntity = f.获取自定义变量(self, 'lockedBy').asType('entity')
    const currentState = f.获取自定义变量(self, '状态').asType('int')

    // 派生：xzSpeed
    const xzSpeed = f.三维向量模运算(f.创建三维向量(ballVx, 0.0, ballVz))

    // 球位置（复用给玩家距离计算和 distFromLocker）
    const ballLocRot = f.获取实体位置与旋转(self)
    const ballPos = ballLocRot.location

    // ==========================================================
    // 2. 地面碰撞检测（内联，避免跨文件 GIA 类型解析问题）
    //    条件：球触地且正在下落 → 反弹
    // ==========================================================

    if (bool(ballY <= BALL_RADIUS && ballVy < 0.0)) {
      const newVy = (0.0 - ballVy) * BOUNCE_DECAY
      const newY = BALL_RADIUS + GROUND_EPSILON
      f.设置自定义变量(self, 'ballVy', newVy)
      f.设置自定义变量(self, 'ballY', newY)
      log(f, '物理', ['地面碰撞 Vy=', str(ballVy), '→', str(newVy)])
    }

    // ==========================================================
    // 3. 遍历 8 个玩家：找最近球员 + 球员碰撞检测
    //    节点图不支持 for 循环，手动展开固定索引
    //    每个玩家：计算距离 → 更新最近追踪 → 碰撞检测
    // ==========================================================

    const players = f.获取在场玩家实体列表()
    let nearestPlayerEntity: any = self
    let nearestPlayerDist = 9999.0
    // 碰撞标志：一个 tick 最多处理一次球员碰撞
    let playerCollided = false

    // --- 玩家 0 ---
    const p0Chars = f.获取指定玩家所有角色实体(players[0])
    const p0: any = p0Chars[0]
    const p0Pos = f.获取实体位置与旋转(p0).location
    const p0Diff = f.三维向量减法(p0Pos, ballPos)
    const p0Dist = f.三维向量模运算(p0Diff)
    if (bool(p0Dist < nearestPlayerDist)) {
      nearestPlayerDist = p0Dist
      nearestPlayerEntity = p0
    }
    if (bool(!playerCollided && p0Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      // 读球当前速度
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p0Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 1 ---
    const p1Chars = f.获取指定玩家所有角色实体(players[1])
    const p1: any = p1Chars[0]
    const p1Pos = f.获取实体位置与旋转(p1).location
    const p1Diff = f.三维向量减法(p1Pos, ballPos)
    const p1Dist = f.三维向量模运算(p1Diff)
    if (bool(p1Dist < nearestPlayerDist)) {
      nearestPlayerDist = p1Dist
      nearestPlayerEntity = p1
    }
    if (bool(!playerCollided && p1Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p1Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 2 ---
    const p2Chars = f.获取指定玩家所有角色实体(players[2])
    const p2: any = p2Chars[0]
    const p2Pos = f.获取实体位置与旋转(p2).location
    const p2Diff = f.三维向量减法(p2Pos, ballPos)
    const p2Dist = f.三维向量模运算(p2Diff)
    if (bool(p2Dist < nearestPlayerDist)) {
      nearestPlayerDist = p2Dist
      nearestPlayerEntity = p2
    }
    if (bool(!playerCollided && p2Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p2Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 3 ---
    const p3Chars = f.获取指定玩家所有角色实体(players[3])
    const p3: any = p3Chars[0]
    const p3Pos = f.获取实体位置与旋转(p3).location
    const p3Diff = f.三维向量减法(p3Pos, ballPos)
    const p3Dist = f.三维向量模运算(p3Diff)
    if (bool(p3Dist < nearestPlayerDist)) {
      nearestPlayerDist = p3Dist
      nearestPlayerEntity = p3
    }
    if (bool(!playerCollided && p3Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p3Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 4 ---
    const p4Chars = f.获取指定玩家所有角色实体(players[4])
    const p4: any = p4Chars[0]
    const p4Pos = f.获取实体位置与旋转(p4).location
    const p4Diff = f.三维向量减法(p4Pos, ballPos)
    const p4Dist = f.三维向量模运算(p4Diff)
    if (bool(p4Dist < nearestPlayerDist)) {
      nearestPlayerDist = p4Dist
      nearestPlayerEntity = p4
    }
    if (bool(!playerCollided && p4Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p4Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 5 ---
    const p5Chars = f.获取指定玩家所有角色实体(players[5])
    const p5: any = p5Chars[0]
    const p5Pos = f.获取实体位置与旋转(p5).location
    const p5Diff = f.三维向量减法(p5Pos, ballPos)
    const p5Dist = f.三维向量模运算(p5Diff)
    if (bool(p5Dist < nearestPlayerDist)) {
      nearestPlayerDist = p5Dist
      nearestPlayerEntity = p5
    }
    if (bool(!playerCollided && p5Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p5Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 6 ---
    const p6Chars = f.获取指定玩家所有角色实体(players[6])
    const p6: any = p6Chars[0]
    const p6Pos = f.获取实体位置与旋转(p6).location
    const p6Diff = f.三维向量减法(p6Pos, ballPos)
    const p6Dist = f.三维向量模运算(p6Diff)
    if (bool(p6Dist < nearestPlayerDist)) {
      nearestPlayerDist = p6Dist
      nearestPlayerEntity = p6
    }
    if (bool(!playerCollided && p6Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p6Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    // --- 玩家 7 ---
    const p7Chars = f.获取指定玩家所有角色实体(players[7])
    const p7: any = p7Chars[0]
    const p7Pos = f.获取实体位置与旋转(p7).location
    const p7Diff = f.三维向量减法(p7Pos, ballPos)
    const p7Dist = f.三维向量模运算(p7Diff)
    if (bool(p7Dist < nearestPlayerDist)) {
      nearestPlayerDist = p7Dist
      nearestPlayerEntity = p7
    }
    if (bool(!playerCollided && p7Dist < PLAYER_COLLISION_RADIUS)) {
      playerCollided = true
      const vel = f.创建三维向量(ballVx, ballVy, ballVz)
      const incidentDir = f.三维向量归一化(p7Diff)
      const dotVN = f.三维向量内积(vel, incidentDir)
      const scaledIncident = f.三维向量缩放(incidentDir, dotVN * 2.0)
      const velReflected = f.三维向量减法(vel, scaledIncident)
      const velFinal = f.三维向量缩放(velReflected, 0.5)
      const velComps = f.拆分三维向量(velFinal)
      f.设置自定义变量(self, 'ballVx', velComps.xComponent, true)
      f.设置自定义变量(self, 'ballVy', velComps.yComponent, true)
      f.设置自定义变量(self, 'ballVz', velComps.zComponent, true)
    }

    if (bool(playerCollided)) {
      log(f, '物理', ['球员碰撞'])
    }

    // ==========================================================
    // 4. 读取 distFromLocker（由 doLock 维护）
    // ==========================================================

    const distFromLockerComputed = f.获取自定义变量(self, 'distFromLocker').asType('float')

    // ==========================================================
    // 5. 组装 BallContext 快照
    //    nearestPlayerId 在此设为 0n 占位 — enterLock/exitLock 已内联，不依赖 ctx.nearestPlayerId
    // ==========================================================

    const ballCtx = {
      state: currentState,
      xzSpeed: xzSpeed,
      ballVx: ballVx,
      ballVy: ballVy,
      ballVz: ballVz,
      ballY: ballY,
      angularVx: angularVx,
      angularVy: angularVy,
      angularVz: angularVz,
      ballRadius: ballRadius,
      lockedBy: lockedByEntity,
      nearestPlayerId: 0n,
      nearestPlayerDist: nearestPlayerDist,
      distFromLocker: distFromLockerComputed
    }

    // ==========================================================
    // 6. nextState — 按优先级 1→7 检查守卫，返回目标状态
    // ==========================================================

    const newState = nextState(ballCtx)

    // ==========================================================
    // 7. 状态转移：exit 旧状态 → enter 新状态
    // ==========================================================

    if (bool(newState != currentState)) {
      log(f, '状态机', ['状态 ', str(currentState), '→', str(newState)])
      if (bool(currentState == S_STILL)) {
        exitStill(f)
      } else if (bool(currentState == S_ROLL)) {
        exitRoll(f)
      } else if (bool(currentState == S_SLIDE)) {
        exitSlide(f)
      } else if (bool(currentState == S_AIR)) {
        exitAir(f)
      } else if (bool(currentState == S_LOCK)) {
        // 内联 exitLock：lockedBy 用 self（球自身）= 自由
        f.设置自定义变量(self, 'lockedBy', self, true)
        log(f, '锁定', ['退出锁定 距锁定者=', str(distFromLockerComputed)])
      }

      if (bool(newState == S_STILL)) {
        enterStill(f)
      } else if (bool(newState == S_ROLL)) {
        enterRoll(f)
      } else if (bool(newState == S_SLIDE)) {
        enterSlide(f)
      } else if (bool(newState == S_AIR)) {
        enterAir(f)
      } else if (bool(newState == S_LOCK)) {
        log(f, '锁定', ['进入锁定 距离=', str(nearestPlayerDist)])
        // 内联 enterLock：直接传 nearestPlayerEntity（scan 中追踪的实体引用）
        f.设置自定义变量(self, 'lockedBy', nearestPlayerEntity, true)
        f.设置自定义变量(self, '状态', S_LOCK, true)
      }
    }

    // ==========================================================
    // 8. 执行当前状态的 do 函数（物理更新：运动器、速度衰减等）
    //    在 LOCK 状态时，nearestPlayerEntity 即为 locker 实体
    //    （canEnterLock 已验证 nearestPlayerDist < 0.5）
    // ==========================================================

    if (bool(newState == S_STILL)) {
      doStill(f)
    } else if (bool(newState == S_ROLL)) {
      doRoll(f)
    } else if (bool(newState == S_SLIDE)) {
      doSlide(f)
    } else if (bool(newState == S_AIR)) {
      doAir(f)
    } else if (bool(newState == S_LOCK)) {
      doLock(f, nearestPlayerEntity)
    }
  })

// ============================================================
// Node Graph 2: 球员状态机 — 挂载到角色实体 (ID: 1073742443)
// 职责：每 120ms tick 检测自身与球的关系 → 切换基础状态
// 当前阶段为骨架：playerNextState 返回原状态不变
// ============================================================

g.server({
  id: 1073742443,
  name: 'Player_FSM',
  lang: 'zh',
  variables: {
    _init3: false
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init3')) {
      return
    }
    f.设置节点图变量自动类型推断('_init3', true)

    f.设置自定义变量(self, 'playerState', P_IDLE)
    f.设置自定义变量(self, 'playerModifier', MOD_NONE)

    f.启动定时器(self, 'playerTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'playerTick')) {
      return
    }

    const balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
    const ball = balls[0]

    const playerState = f.获取自定义变量(self, 'playerState').asType('int')
    const playerModifier = f.获取自定义变量(self, 'playerModifier').asType('int')
    const ballState = f.获取自定义变量(ball, '状态').asType('int')
    const ballLockedBy = f.获取自定义变量(ball, 'lockedBy').asType('entity')

    const selfLocRot = f.获取实体位置与旋转(self)
    const selfPos = selfLocRot.location
    const ballLocRot = f.获取实体位置与旋转(ball)
    const ballPos = ballLocRot.location
    const diffToBall = f.三维向量减法(ballPos, selfPos)
    const distToBall = f.三维向量模运算(diffToBall)

    const speedInfo = f.查询角色当前移动速度(self)
    const selfXzSpeed = speedInfo.currentSpeed

    const playerCtx = {
      state: playerState,
      modifier: playerModifier,
      ballState: ballState,
      ballLockedBy: ballLockedBy,
      distToBall: distToBall,
      xzSpeed: selfXzSpeed
    }

    const newBase = playerNextState(playerCtx)

    if (bool(newBase != playerState)) {
      log(f, '状态机', ['球员状态 ', str(playerState), '→', str(newBase)])
      f.设置自定义变量(self, 'playerState', newBase, true)
    }

    if (bool(allowModifier(newBase, playerModifier))) {
      applyModifier(f, newBase, playerModifier)
    }
  })
