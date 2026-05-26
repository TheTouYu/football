// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gstsServer计算前向(rotate: any) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const fwd = gsts.f._3dVectorRotation(rotate, gsts.f.create3dVector(0.0, 0.0, 1.0))
  return fwd
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
