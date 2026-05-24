import { g } from 'genshin-ts/runtime/core'

import { gstsServer计算力系数, gstsServer计算对齐权重, gstsServer计算踢球方向权重 } from './kick'
import { gstsServer判断运动状态, gstsServer计算前向, gstsServer计算旋转轴方向 } from './motion'

// === 主入口 ===

g.server({
  id: 1073742432,
  lang: 'zh',
  variables: {
    _init: false,
    ballVx: 0.0,
    ballVz: 0.0,
    tickCount: 0n,
    lastKickTick: 0n,
    ballState: 0n,
    frictionDecay: 0.75,
    ballRadius: 0.45,
    kickCooldown: 1n,
    kickRangeSq: 3.25,
    speedMultiplier: 1.4,
    minKickForce: 2.0
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init')) {
      return
    }
    f.设置节点图变量自动类型推断('_init', true)

    f.启动定时器(self, 'run', true, [0.12])
  })
  .on('定时器触发时', (_evt, f) => {
    // 1. tickCount++
    let tc = f.获取节点图变量自动类型推断('tickCount')
    tc = tc + 1n
    f.设置节点图变量自动类型推断('tickCount', tc)

    // 2. 查找足球和角色
    let balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
    let char = self

    // 3. 读取角色位置、前方向量、速度
    let charLocRot = f.获取实体位置与旋转(char)
    let charPos = charLocRot.location
    let charForward = gstsServer计算前向(charLocRot.rotate)
    let charSpeedInfo = f.查询角色当前移动速度(char)
    let charSpeed = charSpeedInfo.currentSpeed

    // 4. 读取足球位置和旋转
    let ball = balls[0]
    let ballLocRot = f.获取实体位置与旋转(ball)
    let ballPos = ballLocRot.location
    let ballRotate = ballLocRot.rotate

    // 5. 摩擦力衰减（先于踢球），仅 XZ 平面
    let storedVx = f.获取节点图变量自动类型推断('ballVx')
    let storedVz = f.获取节点图变量自动类型推断('ballVz')
    let frictionDecay = f.获取节点图变量自动类型推断('frictionDecay')
    storedVx = storedVx * frictionDecay
    storedVz = storedVz * frictionDecay

    // 计算方向向量
    let toBall = f.三维向量减法(ballPos, charPos)
    let toBallDir = f.三维向量归一化(toBall)
    let forwardDotBall = f.三维向量内积(charForward, toBallDir)
    let distSq = f.三维向量内积(toBall, toBall)

    // 6. 踢球决策
    let tickSinceKick = tc - f.获取节点图变量自动类型推断('lastKickTick')
    let kickCooldown = f.获取节点图变量自动类型推断('kickCooldown')
    let kickRangeSq = f.获取节点图变量自动类型推断('kickRangeSq')
    let canKick = bool(
      tickSinceKick >= kickCooldown && distSq < kickRangeSq && forwardDotBall > -0.3
    )

    let finalVx = storedVx
    let finalVz = storedVz

    if (canKick) {
      f.设置节点图变量自动类型推断('lastKickTick', tc)

      // 踢球方向: forwardWeight * forward + (1-forwardWeight) * toBallDir
      let fw = gstsServer计算踢球方向权重(forwardDotBall)
      let tbw = 1.0 - fw
      let scaledForward = f.三维向量缩放(charForward, fw)
      let scaledToBall = f.三维向量缩放(toBallDir, tbw)
      let rawDir = f.三维向量加法(scaledForward, scaledToBall)
      let kickDir = f.三维向量归一化(rawDir)

      // 基础力: max(charSpeed * speedMultiplier, minKickForce)
      let speedMultiplier = f.获取节点图变量自动类型推断('speedMultiplier')
      let minKickForce = f.获取节点图变量自动类型推断('minKickForce')
      let baseForce = charSpeed * speedMultiplier
      if (bool(baseForce < minKickForce)) {
        baseForce = minKickForce
      }

      let weight = gstsServer计算对齐权重(forwardDotBall)
      let coeff = gstsServer计算力系数(forwardDotBall)

      // 7. 叠加踢球速度
      let kickSpeed = baseForce * weight * coeff
      let kickVel = f.三维向量缩放(kickDir, kickSpeed)

      let prevVel = f.创建三维向量(storedVx, 0.0, storedVz)
      let newVel = f.三维向量加法(prevVel, kickVel)

      let velComps = f.拆分三维向量(newVel)
      finalVx = velComps.xComponent
      finalVz = velComps.zComponent
    }

    // 8. 写回 ballVelocity
    f.设置节点图变量自动类型推断('ballVx', finalVx)
    f.设置节点图变量自动类型推断('ballVz', finalVz)

    // 9. 运动状态判定
    let finalVel = f.创建三维向量(finalVx, 0.0, finalVz)
    let speed = f.三维向量模运算(finalVel)
    let currentState = f.获取节点图变量自动类型推断('ballState')
    let newState = gstsServer判断运动状态(speed, currentState)
    f.设置节点图变量自动类型推断('ballState', newState)

    // 10. 施加运动器件（静止时跳过以节省性能）
    if (bool(speed >= 0.1)) {
      f.添加匀速直线型基础运动器(ball, 'dribbleCtrl', 0.24, finalVel)

      // 仅滚动状态施加角速度
      if (bool(newState == 1n)) {
        // 角速度 = 线速度 / 半径
        let ballRadius = f.获取节点图变量自动类型推断('ballRadius')
        const angularSpeed = ((speed / ballRadius) * 180) / 3.1415926
        const rotationAxis = gstsServer计算旋转轴方向(finalVel, ballRotate)
        f.添加匀速旋转型基础运动器(ball, 'dribbleRot', 0.24, angularSpeed, rotationAxis)
      }
    }

    f.设置自定义变量(ball, '速度', finalVel)
    f.设置自定义变量(ball, '状态', newState)
  })
