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

// === 状态定时器管理 ===

/** 通用：状态进入时启动定时器、离开时停止 */
export function gstsServer状态定时器开关(evt: any, targetState: bigint, timerName: string) {
  if (bool(evt.variableName == '状态')) {
    let newState = gsts.f.dataTypeConversion(evt.postChangeValue, 'int')
    if (bool(newState == targetState)) {
      gsts.f.startTimer(self, timerName, true, [0.12])
    }
    if (bool(newState != targetState)) {
      gsts.f.stopTimer(self, timerName)
    }
  }
}

// === 统一运动器 ===

/** 统一的基础运动器施加（除静止 0 外所有状态共用） */
// 注意：不写回 ballVx/ballVz/ballVy — 由调用方或切换函数负责

export function gstsServer施加基础运动(
  state: bigint,
  ballVx: any,
  ballVz: any,
  ballVy: any,
  ballRadius: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rotationAxis: any
) {
  let finalVel = gsts.f.create3dVector(ballVx, ballVy, ballVz)
  gsts.f.addUniformBasicLinearMotionDevice(self, 'dribbleCtrl', 0.24, finalVel)

  // 滚动(1)和空中(3)需要旋转运动器
  if (bool(state == 1n || state == 3n)) {
    let xzSpeed = gsts.f._3dVectorModuloOperation(gsts.f.create3dVector(ballVx, 0.0, ballVz))
    let angularSpeed = ((xzSpeed / ballRadius) * 180) / 3.1415926
    gsts.f.addUniformBasicRotationBasedMotionDevice(
      self,
      'dribbleRot',
      0.24,
      angularSpeed,
      rotationAxis
    )
  }

  gsts.f.setCustomVariable(self, '速度', finalVel)
}

// === 状态切换函数 ===

/** 切换至静止(0) */
export function gstsServer切换至静止() {
  gsts.f.setCustomVariable(self, 'ballVx', 0.0)
  gsts.f.setCustomVariable(self, 'ballVz', 0.0)
  gsts.f.setCustomVariable(self, 'ballVy', 0.0)
  gsts.f.setCustomVariable(self, 'ballY', 0.45)
  gsts.f.setCustomVariable(self, '状态', 0n, true)
}

/** 切换至滚动(1) */
export function gstsServer切换至滚动(ballVx: any, ballVz: any) {
  gsts.f.setCustomVariable(self, 'ballVx', ballVx)
  gsts.f.setCustomVariable(self, 'ballVz', ballVz)
  gsts.f.setCustomVariable(self, '状态', 1n, true)
}

/** 切换至滑动(2) */
export function gstsServer切换至滑动(ballVx: any, ballVz: any) {
  gsts.f.setCustomVariable(self, 'ballVx', ballVx)
  gsts.f.setCustomVariable(self, 'ballVz', ballVz)
  gsts.f.setCustomVariable(self, '状态', 2n, true)
}

/** 切换至空中(3) */
export function gstsServer切换至空中(ballVx: any, ballVz: any, ballVy: any, ballY: any) {
  gsts.f.setCustomVariable(self, 'ballVx', ballVx)
  gsts.f.setCustomVariable(self, 'ballVz', ballVz)
  gsts.f.setCustomVariable(self, 'ballVy', ballVy)
  gsts.f.setCustomVariable(self, 'ballY', ballY)
  gsts.f.setCustomVariable(self, '状态', 3n, true)
}

/** 切换至锁定(5) — 接受 ball 实体，可在非球图中调用 */
export function gstsServer切换至锁定(ball: any, tickCount: bigint) {
  gsts.f.setCustomVariable(ball, '状态', 5n, true)
  gsts.f.setCustomVariable(ball, 'lastKickTick', tickCount)
}

/** 锁定超时兜底：0.5s 后若状态仍=5 则归零 */
export function gstsServer锁定超时归零() {
  let s = gsts.f.dataTypeConversion(gsts.f.getCustomVariable(self, '状态'), 'int')
  if (bool(s == 5n)) {
    gsts.f.setCustomVariable(self, '状态', 0n, true)
  }
}

/** 根据速度判定目标状态 */
export function gstsServer判定目标状态(xzSpeed: any, ballVy: any): bigint {
  let state = 1n
  if (bool(xzSpeed < 0.5)) {
    state = 0n
  }
  if (bool(xzSpeed >= 7.0)) {
    state = 2n
  }
  if (bool(ballVy > 0.0)) {
    state = 3n
  }
  return state
}
