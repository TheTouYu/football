// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gstsServer计算前向(rotate: any) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const fwd = gsts.f._3dVectorRotation(rotate, gsts.f.create3dVector(0.0, 0.0, 1.0))
  return fwd
}

export function gstsServer判断运动状态(speed: number, currentState: bigint) {
  // 带迟滞的状态切换，防止边界抖动
  let s = currentState
  // 进入静止：速度低于退出阈值
  if (bool(speed < 0.1)) {
    s = 0n
  }
  // 静止→滚动：需要较高启动阈值
  if (bool(currentState == 0n && speed >= 0.5)) {
    s = 1n
  }
  // 滚动→滑动：需要较高进入阈值
  if (bool(currentState == 1n && speed >= 7.0)) {
    s = 2n
  }
  // 滑动→滚动：需要降到较低退出阈值
  if (bool(currentState == 2n && speed < 4.0 && speed >= 0.1)) {
    s = 1n
  }
  return s
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gstsServer计算旋转轴方向(velDir: any, ballRotate: any) {
  // 标准滚动轴：cross(up, velDir) → 归一化
  const up = gsts.f.create3dVector(0.0, 1.0, 0.0)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  let axis = gsts.f._3dVectorCrossProduct(up, velDir)
  let result = gsts.f._3dVectorNormalization(axis)
  // 对旋转轴加上球的旋转偏移（YXZ顺序）
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  let rotComps = gsts.f.split3dVector(gsts.f._3dVectorZoom(ballRotate, -1))

  let yRot = gsts.f.create3dVector(0.0, rotComps.yComponent, 0.0)

  result = gsts.f._3dVectorRotation(yRot, result)
  let xRot = gsts.f.create3dVector(rotComps.xComponent, 0.0, 0.0)

  result = gsts.f._3dVectorRotation(xRot, result)
  let zRot = gsts.f.create3dVector(0.0, 0.0, rotComps.zComponent)

  result = gsts.f._3dVectorRotation(zRot, result)
  return result
}
