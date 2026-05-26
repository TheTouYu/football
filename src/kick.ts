import { g } from 'genshin-ts-touyu/runtime/core'

import {
  gstsServer计算力系数,
  gstsServer计算对齐权重,
  gstsServer计算踢球方向权重
} from './kick_weights'

// === 踢球图 1073742437 (角色实体) ===
// 踢球力学：读取角色/足球信息 → 计算方向与力 → 叠加冲量 → 判定后续运动状态

g.server({
  id: 1073742437,
  lang: 'zh',
  variables: {}
}).on('定时器触发时', (evt, f) => {
  if (bool(evt.timerName != 'kickProcess')) {
    return
  }

  // 1. 角色信息
  let charLocRot = f.获取实体位置与旋转(self)
  let charPos = charLocRot.location
  let charForward = f.三维向量旋转(charLocRot.rotate, f.创建三维向量(0.0, 0.0, 1.0))
  let charSpeedInfo = f.查询角色当前移动速度(self)
  let charSpeed = charSpeedInfo.currentSpeed

  // 2. 足球
  let balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
  let ball = balls[0]
  let ballLocRot = f.获取实体位置与旋转(ball)
  let ballPos = ballLocRot.location

  // 3. 读球速度
  // @ts-expect-error generic → float via dataTypeConversion
  let ballVx = f.数据类型转换(f.获取自定义变量(ball, 'ballVx'), 'float')
  // @ts-expect-error generic → float via dataTypeConversion
  let ballVz = f.数据类型转换(f.获取自定义变量(ball, 'ballVz'), 'float')
  // @ts-expect-error generic → float via dataTypeConversion
  let ballVy = f.数据类型转换(f.获取自定义变量(ball, 'ballVy'), 'float')

  // 4. 距离与方向
  let toBall = f.三维向量减法(ballPos, charPos)
  let toBallDir = f.三维向量归一化(toBall)
  let forwardDotBall = f.三维向量内积(charForward, toBallDir)
  let distSq = f.三维向量内积(toBall, toBall)

  // 5. 踢球方向
  let fw = gstsServer计算踢球方向权重(forwardDotBall)
  let tbw = 1.0 - fw
  let scaledForward = f.三维向量缩放(charForward, fw)
  let scaledToBall = f.三维向量缩放(toBallDir, tbw)
  let rawDir = f.三维向量加法(scaledForward, scaledToBall)
  let kickDir = f.三维向量归一化(rawDir)

  // 6. 基础力
  // @ts-expect-error generic → float via dataTypeConversion
  let speedMultiplier = f.数据类型转换(f.获取自定义变量(ball, 'speedMultiplier'), 'float')
  // @ts-expect-error generic → float via dataTypeConversion
  let minKickForce = f.数据类型转换(f.获取自定义变量(ball, 'minKickForce'), 'float')
  let baseForce = charSpeed * speedMultiplier
  if (bool(baseForce < minKickForce)) {
    baseForce = minKickForce
  }

  // 7. 力计算 + 距离衰减
  let weight = gstsServer计算对齐权重(forwardDotBall)
  let coeff = gstsServer计算力系数(forwardDotBall)
  // @ts-expect-error generic → float via dataTypeConversion
  let distDecayStrength = f.数据类型转换(f.获取自定义变量(ball, 'distDecayStrength'), 'float')
  let distFactor = 1.0 / (1.0 + distSq * distDecayStrength)
  let kickSpeed = baseForce * weight * coeff * distFactor
  let kickVel = f.三维向量缩放(kickDir, kickSpeed)

  // 8. 冲量叠加
  let prevVel = f.创建三维向量(ballVx, 0.0, ballVz)
  let newVel = f.三维向量加法(prevVel, kickVel)
  let velComps = f.拆分三维向量(newVel)
  let finalVx = velComps.xComponent
  let finalVz = velComps.zComponent

  // 9. 首次踢球弹跳
  // @ts-expect-error generic → bool via dataTypeConversion
  let hasKicked = f.数据类型转换(f.获取自定义变量(ball, 'hasKicked'), 'bool')
  if (bool(!hasKicked)) {
    f.设置自定义变量(ball, 'hasKicked', true)
    // @ts-expect-error generic → float via dataTypeConversion
    let bounceVelMin = f.数据类型转换(f.获取自定义变量(ball, 'bounceVelMin'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let bounceVelMax = f.数据类型转换(f.获取自定义变量(ball, 'bounceVelMax'), 'float')
    ballVy = f.获取随机浮点数(bounceVelMin, bounceVelMax)
  }

  // 10. 写回球速
  f.设置自定义变量(ball, 'ballVx', finalVx)
  f.设置自定义变量(ball, 'ballVz', finalVz)
  f.设置自定义变量(ball, 'ballVy', ballVy)

  // 11. 判定后续状态
  let xzVel = f.创建三维向量(finalVx, 0.0, finalVz)
  let xzSpeed = f.三维向量模运算(xzVel)
  let nextState = 1n
  if (bool(xzSpeed < 0.5)) {
    nextState = 0n
  }
  if (bool(xzSpeed >= 7.0)) {
    nextState = 2n
  }
  if (bool(ballVy > 0.0)) {
    nextState = 3n
  }
  f.设置自定义变量(ball, '状态', nextState, true)
})
