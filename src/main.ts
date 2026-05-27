import { g } from 'genshin-ts-touyu/runtime/core'

import { gstsServer满足踢球条件 } from './kick_weights'
import { gstsServer切换至锁定 } from './motion'

// === 主图 1073742432 (角色实体) ===
// 职责：集中调度器，遍历所有角色选择踢球者 → 锁定球 → 启动 kickProcess

g.server({
  id: 1073742432,
  name: 'Main_调度器',
  lang: 'zh',
  variables: {
    _init: false,
    _ballInit: false,
    tickCount: 0n
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init')) {
      return
    }
    f.设置节点图变量自动类型推断('_init', true)
    f.启动定时器(self, 'mainTick', true, [0.12])
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'mainTick')) {
      return
    }

    // 1. tickCount++
    let tc = f.获取节点图变量自动类型推断('tickCount')
    tc = tc + 1n
    f.设置节点图变量自动类型推断('tickCount', tc)

    // 2. 查找足球
    let balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
    let ball = balls[0]

    // 3. 首次初始化球自定义变量
    let ballInit = f.获取节点图变量自动类型推断('_ballInit')
    if (bool(!ballInit)) {
      f.设置节点图变量自动类型推断('_ballInit', true)
      f.设置自定义变量(ball, 'ballVx', 0.0)
      f.设置自定义变量(ball, 'ballVz', 0.0)
      f.设置自定义变量(ball, 'ballVy', 0.0)
      f.设置自定义变量(ball, 'ballY', 0.45)
      f.设置自定义变量(ball, '状态', 0n)
      f.设置自定义变量(ball, 'lastKickTick', 0n)
      f.设置自定义变量(ball, 'hasKicked', false)
      f.设置自定义变量(ball, 'frictionDecay', 0.75)
      f.设置自定义变量(ball, 'ballRadius', 0.45)
      f.设置自定义变量(ball, 'kickCooldown', 1n)
      f.设置自定义变量(ball, 'speedMultiplier', 1.4)
      f.设置自定义变量(ball, 'minKickForce', 2.0)
      f.设置自定义变量(ball, 'distDecayStrength', 0.5)
      f.设置自定义变量(ball, 'gravity', 9.8)
      f.设置自定义变量(ball, 'bounceVelMin', 2.0)
      f.设置自定义变量(ball, 'bounceVelMax', 5.0)
    }

    // 4. 读球状态 — 若在锁定中(5)则跳过
    let ballState = f.数据类型转换(f.获取自定义变量(ball, '状态'), 'int')
    if (bool(ballState == 5n)) {
      return
    }

    // 5. 读球位置（所有玩家共用的固定信息）
    let ballLocRot = f.获取实体位置与旋转(ball)
    let ballPos = ballLocRot.location

    // 6. 冷却检查
    let lastKickTick = f.数据类型转换(f.获取自定义变量(ball, 'lastKickTick'), 'int')
    let kickCooldown = f.数据类型转换(f.获取自定义变量(ball, 'kickCooldown'), 'int')
    let tickSinceKick = tc - lastKickTick
    if (bool(tickSinceKick < kickCooldown)) {
      return
    }

    // 7. 遍历所有玩家角色，找第一个满足踢球条件的
    let players = f.获取在场玩家实体列表()
    // kicker 用 self 初始化（仅做占位，由 found 守卫实际使用）
    let kicker = self
    let found = false

    // 展开 8 个固定索引（节点图无法 for 循环）
    // 按列表顺序检查，第一个满足条件的当选踢球者
    // TODO: 随机排序玩家列表（每 10s 重排一次）

    // 玩家 0
    if (bool(!found)) {
      let p0Chars = f.获取指定玩家所有角色实体(players[0])
      let p0: any = p0Chars[0]
      let p0Pos = f.获取实体位置与旋转(p0).location
      if (bool(gstsServer满足踢球条件(ballState, p0Pos, ballPos, 3.25))) {
        kicker = p0
        found = true
      }
    }
    // 玩家 1
    if (bool(!found)) {
      let p1Chars = f.获取指定玩家所有角色实体(players[1])
      let p1: any = p1Chars[0]
      let p1Pos = f.获取实体位置与旋转(p1).location
      if (bool(gstsServer满足踢球条件(ballState, p1Pos, ballPos, 3.25))) {
        kicker = p1
        found = true
      }
    }
    // 玩家 2
    if (bool(!found)) {
      let p2Chars = f.获取指定玩家所有角色实体(players[2])
      let p2: any = p2Chars[0]
      let p2Pos = f.获取实体位置与旋转(p2).location
      if (bool(gstsServer满足踢球条件(ballState, p2Pos, ballPos, 3.25))) {
        kicker = p2
        found = true
      }
    }
    // 玩家 3
    if (bool(!found)) {
      let p3Chars = f.获取指定玩家所有角色实体(players[3])
      let p3: any = p3Chars[0]
      let p3Pos = f.获取实体位置与旋转(p3).location
      if (bool(gstsServer满足踢球条件(ballState, p3Pos, ballPos, 3.25))) {
        kicker = p3
        found = true
      }
    }
    // 玩家 4
    if (bool(!found)) {
      let p4Chars = f.获取指定玩家所有角色实体(players[4])
      let p4: any = p4Chars[0]
      let p4Pos = f.获取实体位置与旋转(p4).location
      if (bool(gstsServer满足踢球条件(ballState, p4Pos, ballPos, 3.25))) {
        kicker = p4
        found = true
      }
    }
    // 玩家 5
    if (bool(!found)) {
      let p5Chars = f.获取指定玩家所有角色实体(players[5])
      let p5: any = p5Chars[0]
      let p5Pos = f.获取实体位置与旋转(p5).location
      if (bool(gstsServer满足踢球条件(ballState, p5Pos, ballPos, 3.25))) {
        kicker = p5
        found = true
      }
    }
    // 玩家 6
    if (bool(!found)) {
      let p6Chars = f.获取指定玩家所有角色实体(players[6])
      let p6: any = p6Chars[0]
      let p6Pos = f.获取实体位置与旋转(p6).location
      if (bool(gstsServer满足踢球条件(ballState, p6Pos, ballPos, 3.25))) {
        kicker = p6
        found = true
      }
    }
    // 玩家 7
    if (bool(!found)) {
      let p7Chars = f.获取指定玩家所有角色实体(players[7])
      let p7: any = p7Chars[0]
      let p7Pos = f.获取实体位置与旋转(p7).location
      if (bool(gstsServer满足踢球条件(ballState, p7Pos, ballPos, 3.25))) {
        kicker = p7
        found = true
      }
    }

    // 8. 找到踢球者 → 锁定球 + 启动 kickProcess
    if (bool(found)) {
      gstsServer切换至锁定(ball, tc)
      f.启动定时器(kicker, 'kickProcess', false, [0.01])
    }
  })
