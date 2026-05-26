import { g } from 'genshin-ts/runtime/core'

// === 滑动图 1073742435 (足球实体) ===
// 地面摩擦 + 直线运动器（无旋转）

g.server({
  id: 1073742435,
  lang: 'zh',
  variables: {}
})
  .on('自定义变量变化时', (evt, f) => {
    if (bool(evt.variableName != '状态')) {
      return
    }
    // @ts-expect-error generic postChangeValue → int via dataTypeConversion
    if (bool(f.数据类型转换(evt.postChangeValue, 'int') == 2n)) {
      f.启动定时器(self, 'motionTick', true, [0.12])
    }
    // @ts-expect-error generic postChangeValue → int via dataTypeConversion
    if (bool(f.数据类型转换(evt.postChangeValue, 'int') != 2n)) {
      f.终止定时器(self, 'motionTick')
    }
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'motionTick')) {
      return
    }

    // @ts-expect-error generic → float via dataTypeConversion
    let ballVx = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let ballVz = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
    // @ts-expect-error generic → float via dataTypeConversion
    let frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')

    ballVx = ballVx * frictionDecay
    ballVz = ballVz * frictionDecay

    let xzVel = f.创建三维向量(ballVx, 0.0, ballVz)
    let xzSpeed = f.三维向量模运算(xzVel)

    if (bool(xzSpeed < 0.1)) {
      f.设置自定义变量(self, 'ballVx', 0.0)
      f.设置自定义变量(self, 'ballVz', 0.0)
      f.设置自定义变量(self, '状态', 0n, true)
      return
    }
    if (bool(xzSpeed < 4.0)) {
      f.设置自定义变量(self, 'ballVx', ballVx)
      f.设置自定义变量(self, 'ballVz', ballVz)
      f.设置自定义变量(self, '状态', 1n, true)
      return
    }

    let finalVel = f.创建三维向量(ballVx, 0.0, ballVz)
    f.添加匀速直线型基础运动器(self, 'dribbleCtrl', 0.24, finalVel)

    f.设置自定义变量(self, 'ballVx', ballVx)
    f.设置自定义变量(self, 'ballVz', ballVz)
    f.设置自定义变量(self, '速度', finalVel)
    f.设置自定义变量(self, '状态', 2n)
  })
