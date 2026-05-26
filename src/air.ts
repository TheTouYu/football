import { g } from 'genshin-ts/runtime/core'

import { gstsServer计算旋转轴方向 } from './motion'

// === 空中图 1073742436 (足球实体) ===
// 重力加速度 + Y位移 + 直线运动器(Y分量) + 旋转运动器

g.server({
  id: 1073742436,
  lang: 'zh',
  variables: {}
})
  .on('自定义变量变化时', (evt, f) => {
    if (bool(evt.variableName != '状态')) {
      return
    }
    // @ts-expect-error generic postChangeValue → int via dataTypeConversion
    if (bool(f.数据类型转换(evt.postChangeValue, 'int') == 3n)) {
      f.启动定时器(self, 'airTick', true, [0.12])
    }
    // @ts-expect-error generic postChangeValue → int via dataTypeConversion
    if (bool(f.数据类型转换(evt.postChangeValue, 'int') != 3n)) {
      f.终止定时器(self, 'airTick')
    }
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'airTick')) {
      return
    }

    // @ts-expect-error generic → float via dataTypeConversion
    let ballVx = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let ballVz = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let ballVy = f.数据类型转换(f.获取自定义变量(self, 'ballVy'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let ballY = f.数据类型转换(f.获取自定义变量(self, 'ballY'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let gravity = f.数据类型转换(f.获取自定义变量(self, 'gravity'), 'float')

    ballVy = ballVy - gravity * 0.12
    ballY = ballY + ballVy * 0.12

    if (bool(ballY <= 0.45)) {
      f.设置自定义变量(self, 'ballVy', 0.0)
      f.设置自定义变量(self, 'ballY', 0.45)

      let xzVel = f.创建三维向量(ballVx, 0.0, ballVz)
      let xzSpeed = f.三维向量模运算(xzVel)
      let nextState = 1n
      if (bool(xzSpeed < 0.5)) {
        nextState = 0n
      }
      if (bool(xzSpeed >= 7.0)) {
        nextState = 2n
      }
      f.设置自定义变量(self, '状态', nextState, true)
      return
    }

    let finalVel = f.创建三维向量(ballVx, ballVy, ballVz)
    f.添加匀速直线型基础运动器(self, 'dribbleCtrl', 0.24, finalVel)

    let ballLocRot = f.获取实体位置与旋转(self)
    // @ts-expect-error generic → float via dataTypeConversion
    let ballRadius = f.数据类型转换(f.获取自定义变量(self, 'ballRadius'), 'float')
    let xzVel2 = f.创建三维向量(ballVx, 0.0, ballVz)
    let xzSpeed = f.三维向量模运算(xzVel2)
    let angularSpeed = ((xzSpeed / ballRadius) * 180) / 3.1415926
    let rotationAxis = gstsServer计算旋转轴方向(finalVel, ballLocRot.rotate)
    f.添加匀速旋转型基础运动器(self, 'dribbleRot', 0.24, angularSpeed, rotationAxis)

    f.设置自定义变量(self, 'ballVx', ballVx)
    f.设置自定义变量(self, 'ballVz', ballVz)
    f.设置自定义变量(self, 'ballVy', ballVy)
    f.设置自定义变量(self, 'ballY', ballY)
    f.设置自定义变量(self, '速度', finalVel)
    f.设置自定义变量(self, '状态', 3n)
  })
