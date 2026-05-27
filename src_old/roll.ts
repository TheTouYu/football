import { g } from 'genshin-ts-touyu/runtime/core'

import {
  gstsServer切换至滑动,
  gstsServer切换至滚动,
  gstsServer切换至静止,
  gstsServer施加基础运动,
  gstsServer状态定时器开关,
  gstsServer计算旋转轴方向
} from './motion'

// === 滚动图 1073742434 (足球实体) ===
// 地面摩擦 + 直线运动器 + 旋转运动器

g.server({
  id: 1073742434,
  lang: 'zh',
  variables: {}
})
  .on('自定义变量变化时', (evt, _f) => {
    gstsServer状态定时器开关(evt, 1n, 'motionTick')
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'motionTick')) {
      return
    }

    let ballVx = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
    let ballVz = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
    let frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')

    ballVx = ballVx * frictionDecay
    ballVz = ballVz * frictionDecay

    let xzSpeed = f.三维向量模运算(f.创建三维向量(ballVx, 0.0, ballVz))

    if (bool(xzSpeed < 0.1)) {
      gstsServer切换至静止()
      return
    }
    if (bool(xzSpeed >= 7.0)) {
      gstsServer切换至滑动(ballVx, ballVz)
      return
    }

    // 滚动中：直线运动器 + 旋转运动器
    let ballLocRot = f.获取实体位置与旋转(self)
    let ballRadius = f.数据类型转换(f.获取自定义变量(self, 'ballRadius'), 'float')
    let finalVel = f.创建三维向量(ballVx, 0.0, ballVz)
    let rotationAxis = gstsServer计算旋转轴方向(finalVel, ballLocRot.rotate)
    gstsServer施加基础运动(1n, ballVx, ballVz, 0.0, ballRadius, rotationAxis)
    gstsServer切换至滚动(ballVx, ballVz)
  })
