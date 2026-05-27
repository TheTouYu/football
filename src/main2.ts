// main2.ts — Node Graph 组装入口（新架构）
// 4 个 g.server() 调用：Ball_主控、Ball_物理、Ball_玩家扫描、Player_FSM
// 按 docs/STATE_MACHINE_DESIGN_ZH.md 第 1 节架构 + 第 6 节挂载方案
// 不参考 src_old/ 的任何代码
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// ↑ f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明；所有赋值来自 any 类型 API 返回值

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
// Graph 1: Ball_主控 (ID 1073742438, 挂载足球实体)
// 职责：状态转移逻辑 + tick 协调（不执行物理 doXxx）
//       地面碰撞 → 读最近球员信息 → nextState → exit/enter
// ============================================================

g.server({
  id: 1073742438,
  name: 'Ball_主控',
  lang: 'zh',
  variables: {
    _init: false
  }
})
  .on('实体创建时', (_evt, f) => {
    // 防重复初始化
    if (f.获取节点图变量自动类型推断('_init')) {
      return
    }
    f.设置节点图变量自动类型推断('_init', true)

    // 初始化所有足球自定义变量
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
    f.设置自定义变量(self, 'nearestPlayerId', self) // 用球实体自身作为哨兵值，保持 entity 类型一致
    f.设置自定义变量(self, 'nearestPlayerDist', 999.0)
    f.设置自定义变量(self, '状态', S_STILL)

    // Debug 视觉反馈变量（初始化 0.0，用户设为非零值触发闪烁）
    f.设置自定义变量(self, '_debugFlash0', 0.0)
    f.设置自定义变量(self, '_debugFlash1', 0.0)

    // 启动 motionTick 循环定时器（120ms 间隔）
    f.启动定时器(self, 'motionTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    // 只处理 motionTick 事件
    if (bool(evt.timerName != 'motionTick')) {
      return
    }

    // ============================================================
    // 1. buildBallContext — 从自定义变量构建 BallContext 快照
    //    nearestPlayerId/Dist 由 Graph 3（玩家扫描器）写入，直接读取
    // ============================================================

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
    // nearestPlayerId 由 Graph 3 扫描写入（保持 entity 类型）
    // 不在此处声明局部变量 — 仅在进入 LOCK 时内联读取，避免 setLocalVariable 类型解析失败
    const nearestPlayerDist = f.获取自定义变量(self, 'nearestPlayerDist').asType('float')
    const distFromLockerVal = f.获取自定义变量(self, 'distFromLocker').asType('float')

    // 派生：水平速率
    const xzSpeed = f.三维向量模运算(f.创建三维向量(ballVx, 0.0, ballVz))

    // 组装 BallContext 快照
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
      nearestPlayerId: 0n, // unused by guards; real value read inline in enterLock
      nearestPlayerDist: nearestPlayerDist,
      distFromLocker: distFromLockerVal
    }

    // ============================================================
    // 2. 地面碰撞检测 — 内联实现，修改 ballVy/ballY 自定义变量
    //    碰撞响应只改速度，下个 tick 的转移表自然判定
    //    跨文件调用 checkGroundCollision 有 self 类型解析问题，故内联
    //    条件：球触地（ballY <= 球半径）且 垂直速度向下（ballVy < 0）
    //    响应：ballVy *= -0.5（反弹衰减），ballY = 球半径 + ε（防穿透）
    // ============================================================
    if (bool(ballY <= 0.45 && ballVy < 0.0)) {
      // 反弹：Vy *= -0.5，用 vec3 缩放避免 float * float 的 GIA 类型问题
      const ballVyVec = f.创建三维向量(0.0, ballVy, 0.0)
      const bouncedVyVec = f.三维向量缩放(ballVyVec, -0.5)
      const bouncedVy = f.拆分三维向量(bouncedVyVec).yComponent

      // 写回反弹后的垂直速度和贴地高度
      f.设置自定义变量(self, 'ballVy', bouncedVy)
      f.设置自定义变量(self, 'ballY', 0.451) // ballRadius(0.45) + ε(0.001)

      log(f, '物理', ['地面碰撞 Vy=', str(ballVy), '→', str(bouncedVy)])
    }

    // ============================================================
    // 3. nearestPlayerId / nearestPlayerDist 已由 Graph 3 写入
    //    buildBallContext 中已读取，此处无额外操作
    // ============================================================

    // ============================================================
    // 3.5 调试日志：球员在 5m 内时打印诊断信息
    //     帮助定位「球不动」原因：确认状态、速度、距离等关键值
    // ============================================================
    if (bool(nearestPlayerDist < 5.0)) {
      log(f, '诊断', ['诊断 状态=', str(currentState), ' xz=', str(xzSpeed), ' 最近=', str(nearestPlayerDist), ' 距锁=', str(distFromLockerVal)])
    }

    // ============================================================
    // 4. nextState — 按优先级 1→7 检查守卫，返回目标状态
    // ============================================================
    const newState = nextState(ballCtx)

    // ============================================================
    // 5. exit 旧状态 / enter 新状态
    //    enter 函数内部写「状态」自定义变量
    // ============================================================
    if (bool(newState != currentState)) {
      log(f, '状态机', ['状态 ', str(currentState), '→', str(newState)])

      // exit 旧状态
      if (bool(currentState == S_STILL)) {
        exitStill(f)
      } else if (bool(currentState == S_ROLL)) {
        exitRoll(f)
      } else if (bool(currentState == S_SLIDE)) {
        exitSlide(f)
      } else if (bool(currentState == S_AIR)) {
        exitAir(f)
      } else if (bool(currentState == S_LOCK)) {
        // 内联 exitLock：用 self（球自身）= 自由
        f.设置自定义变量(self, 'lockedBy', self, true)
        log(f, '锁定', ['退出锁定 距锁定者=', str(distFromLockerVal)])
      }

      // enter 新状态
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
        // 内联 enterLock：内联读取 nearestPlayerId 避免 setLocalVariable 类型解析失败
        f.设置自定义变量(
          self,
          'lockedBy',
          f.获取自定义变量(self, 'nearestPlayerId').asType('entity'),
          true
        )
        f.设置自定义变量(self, '状态', S_LOCK, true)
      }
    }

    // 注意：不在此处调用 doXxx() — 物理执行由 Graph 2 负责
  })

// ============================================================
// Graph 2: Ball_物理 (ID 1073742439, 挂载足球实体)
// 职责：每 tick 读取状态，执行对应 doXxx() 物理计算
//       Graph 1 和 Graph 2 独立运行，通过「状态」自定义变量通信
// ============================================================

g.server({
  id: 1073742439,
  name: 'Ball_物理',
  lang: 'zh'
})
  .on('实体创建时', (_evt, f) => {
    // 启动 physicsTick 循环定时器（120ms，与 Graph 1 同步）
    f.启动定时器(self, 'physicsTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    // 只处理 physicsTick 事件
    if (bool(evt.timerName != 'physicsTick')) {
      return
    }

    // 读取当前状态（由 Graph 1 写入），根据状态调用对应 do 函数
    const state = f.获取自定义变量(self, '状态').asType('int')

    if (bool(state == S_STILL)) {
      doStill(f)
    } else if (bool(state == S_ROLL)) {
      doRoll(f)
    } else if (bool(state == S_SLIDE)) {
      doSlide(f)
    } else if (bool(state == S_AIR)) {
      doAir(f)
    } else if (bool(state == S_LOCK)) {
      const lockerEntity = f.获取自定义变量(self, 'nearestPlayerId').asType('entity')
      doLock(f, lockerEntity)
    }
  })

// ============================================================
// Graph 3: Ball_玩家扫描 (ID 1073742440, 挂载足球实体)
// 职责：每 0.5s 扫描所有玩家，找离球最近的球员
//       结果写入 nearestPlayerId / nearestPlayerDist 自定义变量
//       Graph 1 直接读取这些变量
// ============================================================

/**
 * 列表迭代循环回调：扫描单个玩家，更新最近球员追踪
 * 角色实体用法不同：chars.at(0)?.pos 直接获取位置，不需要 getEntityLocationAndRotation
 */
function 扫描球员回调(playerEntity: any, _breakLoop: any): void {
  // 获取角色实体列表
  const chars = gsts.f.getAllCharacterEntitiesOfSpecifiedPlayer(playerEntity)
  // getCorrespondingValueFromList 获取列表元素（显式 API，避免 [0] 的 entity 类型问题）
  const char = gsts.f.getCorrespondingValueFromList(chars, 0)
  // 角色实体有 .pos 属性，直接拿位置（不需要 getEntityLocationAndRotation）
  const charPos = char.pos

  // 获取球位置（self 是普通实体，需要 getEntityLocationAndRotation）
  const ballLocRot = gsts.f.getEntityLocationAndRotation(self)
  const ballPos = ballLocRot.location

  // 计算距离
  const diff = gsts.f._3dVectorSubtraction(charPos, ballPos)
  const dist = gsts.f._3dVectorModuloOperation(diff)

  // 读取当前最近距离
  const currNearest = gsts.f.getCustomVariable(self, 'nearestPlayerDist').asType('float')

  // 如果更近，更新最近球员
  if (bool(dist < currNearest)) {
    gsts.f.setCustomVariable(self, 'nearestPlayerDist', dist)
    gsts.f.setCustomVariable(self, 'nearestPlayerId', char)
  }
}

g.server({
  id: 1073742440,
  name: 'Ball_玩家扫描',
  lang: 'zh'
})
  .on('实体创建时', (_evt, f) => {
    // 启动 playerScanTick 循环定时器（500ms 间隔，无需每 tick 扫描）
    f.启动定时器(self, 'playerScanTick', true, [0.5])
  })
  .on('定时器触发时', (evt, f) => {
    // 只处理 playerScanTick 事件
    if (bool(evt.timerName != 'playerScanTick')) {
      return
    }

    // 获取场上所有玩家实体列表
    const players = f.获取在场玩家实体列表()

    // self 就是足球实体（此 node graph 挂在足球上）
    // 初始化最近距离为极大值（每次扫描开始前重置）
    f.设置自定义变量(self, 'nearestPlayerDist', 999.0)
    f.设置自定义变量(self, 'nearestPlayerId', self)

    // 列表迭代循环，回调为 gstsServer 函数（内部用 gsts.f 英文 API）
    f.列表迭代循环(players, 扫描球员回调)

    // 日志：扫描结果 — 确认扫描器是否找到球员以及距离
    const scanDist = f.获取自定义变量(self, 'nearestPlayerDist').asType('float')
    log(f, '扫描', ['扫描 最近球员 距离=', str(scanDist)])
  })

// ============================================================
// Graph 4: Player_FSM (ID 1073742441, 挂载角色实体)
// 职责：每 120ms tick 驱动球员状态机
//       读自身变量 + 读球变量 → playerNextState → applyModifier
//       当前阶段：骨架。playerNextState 返回原状态不变
//       挂载在角色实体上，每个角色实例独立运行
// ============================================================

g.server({
  id: 1073742441,
  name: 'Player_FSM',
  lang: 'zh',
  variables: {
    _init: false
  }
})
  .on('实体创建时', (_evt, f) => {
    // 防重复初始化
    if (f.获取节点图变量自动类型推断('_init')) {
      return
    }
    f.设置节点图变量自动类型推断('_init', true)

    // 初始化球员自定义变量
    f.设置自定义变量(self, 'playerState', P_IDLE)
    f.设置自定义变量(self, 'playerModifier', MOD_NONE)

    // 启动 playerTick 循环定时器（120ms 间隔，与球 tick 同步）
    f.启动定时器(self, 'playerTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    // 只处理 playerTick 事件
    if (bool(evt.timerName != 'playerTick')) {
      return
    }

    // ============================================================
    // 1. buildPlayerContext — 读自身状态 + 跨实体读球状态
    // ============================================================

    // 查找足球实体
    const balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
    const ball = balls[0]

    // 读自身球员变量
    const playerState = f.获取自定义变量(self, 'playerState').asType('int')
    const playerModifier = f.获取自定义变量(self, 'playerModifier').asType('int')

    // 跨实体读足球变量
    const ballState = f.获取自定义变量(ball, '状态').asType('int')
    const ballLockedBy = f.获取自定义变量(ball, 'lockedBy').asType('entity')

    // 计算自身到球的距离
    const selfLocRot = f.获取实体位置与旋转(self)
    const selfPos = selfLocRot.location
    const ballLocRot = f.获取实体位置与旋转(ball)
    const ballPos = ballLocRot.location
    const diffToBall = f.三维向量减法(ballPos, selfPos)
    const distToBall = f.三维向量模运算(diffToBall)

    // 查自身水平速率
    const speedInfo = f.查询角色当前移动速度(self)
    const selfXzSpeed = speedInfo.currentSpeed

    // 组装 PlayerContext 快照
    const playerCtx = {
      state: playerState,
      modifier: playerModifier,
      ballState: ballState,
      ballLockedBy: ballLockedBy,
      distToBall: distToBall,
      xzSpeed: selfXzSpeed
    }

    // ============================================================
    // 2. playerNextState — 球员决策（当前骨架：保持原状态不变）
    // ============================================================
    const newBase = playerNextState(playerCtx)

    // ============================================================
    // 3. 基础状态变化时写回自定义变量
    // ============================================================
    if (bool(newBase != playerState)) {
      f.设置自定义变量(self, 'playerState', newBase, true)
    }

    // ============================================================
    // 4. applyModifier — 检查兼容矩阵后施加叠加层效果
    //    当前骨架：MOD_NONE 和 MOD_SPRINT 均不做实际效果
    // ============================================================
    if (bool(allowModifier(newBase, playerModifier))) {
      applyModifier(f, newBase, playerModifier)
    }
  })

// ============================================================
// Graph 5: Ball_Debug视觉 (ID 1073742444, 挂载足球实体)
// 职责：监听 debug 自定义变量变化 → 触发一帧视觉闪烁
//       用户通过 f.设置自定义变量(self, '_debugFlash0', <任意值>, true)
//       触发视觉反馈（球模型闪烁一次，用于调试状态机判断）
// ============================================================

g.server({
  id: 1073742444,
  name: 'Ball_Debug视觉',
  lang: 'zh'
})
  .on('自定义变量变化时', (evt, f) => {
    // 快速过滤：只处理 _debugFlash0 / _debugFlash1，其余立即返回
    const notFlash0 = bool(evt.variableName != '_debugFlash0')
    const notFlash1 = bool(evt.variableName != '_debugFlash1')
    if (bool(notFlash0 && notFlash1)) {
      return
    }

    // 触发一帧视觉闪烁：隐藏模型 → 0.05s 后恢复
    // 激活关闭模型显示: true=可见, false=不可见
    f.激活关闭模型显示(self, false as any)
    f.启动定时器(self, 'debugFlashRestore', false, [0.05])
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'debugFlashRestore')) {
      return
    }
    f.激活关闭模型显示(self, true as any)
  })
