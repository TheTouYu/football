import { g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073742432,
  lang: 'zh',
  variables: {
    _init: false,
    ballVx: 0.0,
    ballVy: 0.0,
    ballVz: 0.0,
    tickCount: 0n,
    lastKickTick: 0n
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
    let balls = f.获取场上指定元件ID的实体(prefabId(1077936220))
    let char = self

    // 3. 读取角色位置、前方向量、速度
    let charLocRot = f.获取实体位置与旋转(char)
    let charPos = charLocRot.location
    let charForward = f.三维向量旋转(charLocRot.rotate, f.创建三维向量(0.0, 0.0, 1.0))
    let charSpeedInfo = f.查询角色当前移动速度(char)
    let charSpeed = charSpeedInfo.currentSpeed

    // 4. 读取足球位置
    let ball = balls[0]
    let ballLocRot = f.获取实体位置与旋转(ball)
    let ballPos = ballLocRot.location

    // 5. 摩擦力衰减（先于踢球）
    let storedVx = f.获取节点图变量自动类型推断('ballVx')
    let storedVy = f.获取节点图变量自动类型推断('ballVy')
    let storedVz = f.获取节点图变量自动类型推断('ballVz')
    storedVx = storedVx * 0.95
    storedVy = storedVy * 0.95
    storedVz = storedVz * 0.95

    // 计算方向向量
    let toBall = f.三维向量减法(ballPos, charPos)
    let toBallDir = f.三维向量归一化(toBall)
    let forwardDotBall = f.三维向量内积(charForward, toBallDir)
    let distSq = f.三维向量内积(toBall, toBall)

    // 6. 踢球决策
    let tickSinceKick = tc - f.获取节点图变量自动类型推断('lastKickTick')
    let canKick = bool(tickSinceKick >= 3n && distSq < 2.25 && forwardDotBall > -0.3)

    let finalVx = storedVx
    let finalVy = storedVy
    let finalVz = storedVz

    if (canKick) {
      f.设置节点图变量自动类型推断('lastKickTick', tc)

      // 踢球方向: normalize(0.7 * charForward + 0.3 * toBallDir)
      let scaledForward = f.三维向量缩放(charForward, 0.7)
      let scaledToBall = f.三维向量缩放(toBallDir, 0.3)
      let rawDir = f.三维向量加法(scaledForward, scaledToBall)
      let kickDir = f.三维向量归一化(rawDir)

      // 基础力: max(charSpeed * 1.2, 3.0)
      let baseForce = charSpeed * 1.2
      if (bool(baseForce < 3.0)) {
        baseForce = 3.0
      }

      // 对齐权重: 分段线性
      let weight = 0.1
      if (bool(forwardDotBall > 0.9)) {
        weight = 1.2
      }
      if (bool(forwardDotBall > 0.5 && forwardDotBall <= 0.9)) {
        weight = 1.0
      }
      if (bool(forwardDotBall > 0.0 && forwardDotBall <= 0.5)) {
        weight = 0.5
      }
      if (bool(forwardDotBall > -0.5 && forwardDotBall <= 0.0)) {
        weight = 0.2
      }

      // 力系数: 轻推0.3 / 修正1.2 / 正常0.8
      let coeff = 0.3
      if (bool(forwardDotBall > 0.9)) {
        coeff = 0.8
      }
      if (bool(forwardDotBall > 0.0 && forwardDotBall <= 0.9)) {
        coeff = 1.2
      }

      // 7. 叠加踢球速度
      let kickSpeed = baseForce * weight * coeff
      let kickVel = f.三维向量缩放(kickDir, kickSpeed)

      let prevVel = f.创建三维向量(storedVx, storedVy, storedVz)
      let newVel = f.三维向量加法(prevVel, kickVel)

      let velComps = f.拆分三维向量(newVel)
      finalVx = velComps.xComponent
      finalVy = velComps.yComponent
      finalVz = velComps.zComponent
    }

    // 8. 写回 ballVelocity
    f.设置节点图变量自动类型推断('ballVx', finalVx)
    f.设置节点图变量自动类型推断('ballVy', finalVy)
    f.设置节点图变量自动类型推断('ballVz', finalVz)

    // 9. 施加运动器件
    let finalVel = f.创建三维向量(finalVx, finalVy, finalVz)
    f.添加匀速直线型基础运动器(ball, 'dribbleCtrl', 0.12, finalVel)
    f.设置自定义变量(ball, '速度', finalVel)
  })
