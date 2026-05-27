import { g } from 'genshin-ts-touyu/runtime/core'

import {
  gstsServer切换至滑动,
  gstsServer切换至滚动,
  gstsServer切换至静止,
  gstsServer施加基础运动,
  gstsServer状态定时器开关,
  gstsServer计算旋转轴方向,
  gstsServer锁定超时归零
} from './motion'

// === 滑动图 1073742435 (足球实体) ===
// 地面摩擦 + 直线运动器（无旋转）

g.server({
  id: 1073742435,
  lang: 'zh',
  variables: {}
})
  .on('自定义变量变化时', (evt, f) => {
    gstsServer状态定时器开关(evt, 2n, 'motionTick')
    // 锁定超时保护（状态=5）
    if (bool(evt.variableName == '状态')) {
      if (bool(f.数据类型转换(evt.postChangeValue, 'int') == 5n)) {
        f.启动定时器(self, 'lockTimeout', false, [0.5])
      }
    }
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName == 'lockTimeout')) {
      gstsServer锁定超时归零()
      return
    }
    if (bool(evt.timerName != 'motionTick')) {
      return
    }

    let ballVx = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
    let ballVz = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
    let frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')

    ballVx = ballVx * frictionDecay
    ballVz = ballVz * frictionDecay

    let xzVel = f.创建三维向量(ballVx, 0.0, ballVz)
    let xzSpeed = f.三维向量模运算(xzVel)

    if (bool(xzSpeed < 0.1)) {
      gstsServer切换至静止()
      return
    }
    if (bool(xzSpeed < 4.0)) {
      gstsServer切换至滚动(ballVx, ballVz)
      return
    }

    // 滑动中：直线运动器（无旋转）
    let ballLocRot = f.获取实体位置与旋转(self)
    let rotationAxis = gstsServer计算旋转轴方向(
      f.创建三维向量(ballVx, 0.0, ballVz),
      ballLocRot.rotate
    )
    gstsServer施加基础运动(2n, ballVx, ballVz, 0.0, 0.45, rotationAxis)
    gstsServer切换至滑动(ballVx, ballVz)
  })
