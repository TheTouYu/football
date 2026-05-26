import { g } from 'genshin-ts-touyu/runtime/core'

import { gstsServer计算前向 } from './motion'

// === 主图 1073742432 (角色实体) ===
// 职责：定时检测踢球条件 → 写球.状态=4 + 启动 kickProcess 定时器

g.server({
  id: 1073742432,
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

    // 首次初始化球自定义变量
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

    // 3. 读球状态 — 若已在踢球中则跳过
    // @ts-expect-error generic → int via dataTypeConversion
    let ballState = f.数据类型转换(f.获取自定义变量(ball, '状态'), 'int')
    if (bool(ballState == 4n)) {
      return
    }

    // 4. 读角色信息
    let charLocRot = f.获取实体位置与旋转(self)
    let charPos = charLocRot.location
    let charForward = gstsServer计算前向(charLocRot.rotate)

    // 5. 读球位置
    let ballLocRot = f.获取实体位置与旋转(ball)
    let ballPos = ballLocRot.location

    // 6. 计算方向
    let toBall = f.三维向量减法(ballPos, charPos)
    let toBallDir = f.三维向量归一化(toBall)
    let forwardDotBall = f.三维向量内积(charForward, toBallDir)

    // 7. 踢球检测（冷却 + 朝向）
    // @ts-expect-error generic → int via dataTypeConversion
    let lastKickTick = f.数据类型转换(f.获取自定义变量(ball, 'lastKickTick'), 'int')
    // @ts-expect-error generic → int via dataTypeConversion
    let kickCooldown = f.数据类型转换(f.获取自定义变量(ball, 'kickCooldown'), 'int')
    let tickSinceKick = tc - lastKickTick

    if (bool(tickSinceKick >= kickCooldown && forwardDotBall > -0.3)) {
      f.设置自定义变量(ball, '状态', 4n, true)
      f.设置自定义变量(ball, 'lastKickTick', tc)
      f.启动定时器(self, 'kickProcess', false, [0.01])
    }
  })
