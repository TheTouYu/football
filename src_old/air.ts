import { g } from 'genshin-ts-touyu/runtime/core'

import {
  gstsServer切换至空中,
  gstsServer判定目标状态,
  gstsServer施加基础运动,
  gstsServer状态定时器开关,
  gstsServer计算旋转轴方向
} from './motion'

// === 空中图 1073742436 (足球实体) ===
// 重力加速度 + Y位移 + 直线运动器(Y分量) + 旋转运动器

g.server({
  id: 1073742436,
  lang: 'zh',
  variables: {}
})
  .on('自定义变量变化时', (evt, _f) => {
    gstsServer状态定时器开关(evt, 3n, 'airTick')
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'airTick')) {
      return
    }

    let ballVx = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
    let ballVz = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
    let ballVy = f.数据类型转换(f.获取自定义变量(self, 'ballVy'), 'float')
    let ballY = f.数据类型转换(f.获取自定义变量(self, 'ballY'), 'float')
    let gravity = f.数据类型转换(f.获取自定义变量(self, 'gravity'), 'float')

    ballVy = ballVy - gravity * 0.12
    ballY = ballY + ballVy * 0.12

    // 两分支共用 XZ 速度计算
    let xzSpeed = f.三维向量模运算(f.创建三维向量(ballVx, 0.0, ballVz))

    if (bool(ballY <= 0.45)) {
      // 落地：由判定目标状态决定后续状态（注意此时 ballVy 可能为负）
      let nextState = gstsServer判定目标状态(xzSpeed, ballVy)
      f.设置自定义变量(self, 'ballVy', 0.0)
      f.设置自定义变量(self, 'ballY', 0.45)
      f.设置自定义变量(self, 'ballVx', ballVx)
      f.设置自定义变量(self, 'ballVz', ballVz)
      f.设置自定义变量(self, '状态', nextState, true)
      return
    }

    // 空中：施加运动器 + 保持空中状态（不触发事件，状态未变）
    let ballLocRot = f.获取实体位置与旋转(self)
    let ballRadius = f.数据类型转换(f.获取自定义变量(self, 'ballRadius'), 'float')
    let rotationAxis = gstsServer计算旋转轴方向(
      f.创建三维向量(ballVx, ballVy, ballVz),
      ballLocRot.rotate
    )
    gstsServer施加基础运动(3n, ballVx, ballVz, ballVy, ballRadius, rotationAxis)
    gstsServer切换至空中(ballVx, ballVz, ballVy, ballY)
  })
