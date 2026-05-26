// ball_physics.ts — 足球物理计算模块
// 每个状态的 do() 函数，每 tick（120ms）被 main.ts 调用
// 负责更新速度、施加运动器，读/写自定义变量
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
// ↑ f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明；所有赋值来自 any 类型 API 返回值

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 从欧拉角计算前向向量（Z 轴正方向是默认前向）
 * 适配自 src_old/motion.ts 的 gstsServer计算前向
 */
function 计算前向(f: any, rotate: any) {
  return f.三维向量旋转(rotate, f.创建三维向量(0.0, 0.0, 1.0))
}

/**
 * 计算滚动旋转轴方向
 * 原理：cross(up, velDir) 归一化 → 再对球的旋转角做逆旋转（YXZ 顺序）
 * 适配自 src_old/motion.ts 的 gstsServer计算旋转轴方向，改为接收 f 参数
 */
function 计算旋转轴方向(f: any, velDir: any, ballRotate: any) {
  const up = f.创建三维向量(0.0, 1.0, 0.0)
  const axis = f._3dVectorCrossProduct(up, velDir)
  const result0 = f.三维向量归一化(axis)
  // 对旋转轴加上球的旋转偏移（逆旋转，YXZ 顺序）
  const rotComps = f.拆分三维向量(f.三维向量缩放(ballRotate, -1.0))
  const yRot = f.创建三维向量(0.0, rotComps.yComponent, 0.0)
  const result1 = f.三维向量旋转(yRot, result0)
  const xRot = f.创建三维向量(rotComps.xComponent, 0.0, 0.0)
  const result2 = f.三维向量旋转(xRot, result1)
  const zRot = f.创建三维向量(0.0, 0.0, rotComps.zComponent)
  const result3 = f.三维向量旋转(zRot, result2)
  return result3
}

// ============================================================
// do 函数 — 每个 tick 被 main.ts 调用
// 函数签名：只接收 f（节点图 API），内部从自定义变量读取所需数据
// BallContext 的构建由 main.ts 负责
// ============================================================

/**
 * 静止：空操作，不消耗性能，等待外力改变速度
 */
export function doStill(_f: any): void {
  // 不做任何事
}

/**
 * 滚动：线速度与角速度耦合衰减（纯滚动无滑移）
 *   1. 读取 ballVx, ballVz, frictionDecay (0.95)
 *   2. Vx *= frictionDecay, Vz *= frictionDecay（摩擦衰减）
 *   3. 计算 xzSpeed = sqrt(Vx² + Vz²)
 *   4. 获取球实体位置与旋转，计算旋转轴（cross(up, velDir) 归一化）
 *   5. 角速度 = (xzSpeed / ballRadius) * 180 / π（度/秒）
 *   6. 施加直线运动器 + 旋转运动器（duration = 0.24，覆盖 2 个 tick）
 *   7. 写回 ballVx, ballVz 到自定义变量（带事件触发）
 */
export function doRoll(f: any): void {
  // 1. 读取变量
  const ballVxRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
  const ballVzRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
  const frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')
  const ballRadius = f.数据类型转换(f.获取自定义变量(self, 'ballRadius'), 'float')

  // 2. 摩擦衰减 — 用 raw 值构建 vec3，再用 三维向量缩放 做衰减（避免 float * float 的 GIA 类型问题）
  const rawHorizVel = f.创建三维向量(ballVxRaw, 0.0, ballVzRaw)
  const horizVel = f.三维向量缩放(rawHorizVel, frictionDecay)
  const horizComps = f.拆分三维向量(horizVel)
  const decayedVx = horizComps.xComponent
  const decayedVz = horizComps.zComponent

  // 3. 计算水平速率
  const xzSpeed = f.三维向量模运算(horizVel)

  // 4. 获取球实体位置与旋转，计算旋转轴
  const ballLocRot = f.获取实体位置与旋转(self)
  const velDir = f.三维向量归一化(horizVel)
  const rotationAxis = 计算旋转轴方向(f, velDir, ballLocRot.rotate)

  // 5. 角速度（度/秒）— 用 vec3 缩放代替 float * float，避免 GIA 类型问题
  const speedForAngular = f.创建三维向量(xzSpeed, 0.0, 0.0)
  const angularScaled = f.三维向量缩放(speedForAngular, 127.324)
  const angularSpeed = f.拆分三维向量(angularScaled).xComponent

  // 6. 施加直线运动器 + 旋转运动器（duration = 0.24，覆盖 2 个 tick）
  f.addUniformBasicLinearMotionDevice(self, 'ballLinear', 0.24, horizVel)
  f.addUniformBasicRotationBasedMotionDevice(self, 'ballRotate', 0.24, angularSpeed, rotationAxis)

  // 7. 写回自定义变量（带事件触发，让转移表能响应速度变化）
  f.设置自定义变量(self, 'ballVx', decayedVx, true)
  f.设置自定义变量(self, 'ballVz', decayedVz, true)
}

/**
 * 滑动：线速度与角速度独立衰减，各自独立驱动运动器
 *   1. 读取 ballVx, ballVz, frictionDecay (0.95), angularVx, angularVy, angularVz, angularDecay (0.90)
 *   2. Vx *= frictionDecay, Vz *= frictionDecay（线速度摩擦衰减）
 *   3. ωx *= angularDecay, ωy *= angularDecay, ωz *= angularDecay（角速度独立衰减）
 *   4. 计算 xzSpeed（水平速率）
 *   5. 角速度大小 = |ω|，旋转轴 = normalize(ω)
 *   6. 施加直线运动器 + 旋转运动器（独立角速度驱动）
 *   7. 写回所有速度变量
 */
export function doSlide(f: any): void {
  // 1. 读取变量
  const ballVxRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
  const ballVzRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
  const frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')
  const angularVxRaw = f.数据类型转换(f.获取自定义变量(self, 'angularVx'), 'float')
  const angularVyRaw = f.数据类型转换(f.获取自定义变量(self, 'angularVy'), 'float')
  const angularVzRaw = f.数据类型转换(f.获取自定义变量(self, 'angularVz'), 'float')
  const angularDecay = f.数据类型转换(f.获取自定义变量(self, 'angularDecay'), 'float')

  // 2. 线速度摩擦衰减 — 用三维向量缩放代替 float * float 避免 GIA 类型问题
  const rawHorizVel = f.创建三维向量(ballVxRaw, 0.0, ballVzRaw)
  const horizVel = f.三维向量缩放(rawHorizVel, frictionDecay)
  const horizComps = f.拆分三维向量(horizVel)
  const ballVx = horizComps.xComponent
  const ballVz = horizComps.zComponent

  // 3. 角速度独立衰减 — 用三维向量缩放代替 float * float
  const rawOmegaVec = f.创建三维向量(angularVxRaw, angularVyRaw, angularVzRaw)
  const omegaVec = f.三维向量缩放(rawOmegaVec, angularDecay)
  const omegaComps = f.拆分三维向量(omegaVec)
  const angularVx = omegaComps.xComponent
  const angularVy = omegaComps.yComponent
  const angularVz = omegaComps.zComponent

  // 4. 计算水平速率（供外部参考，本函数内不使用）
  const _xzSpeed = f.三维向量模运算(horizVel)

  // 5. 角速度大小 = |ω|，旋转轴 = normalize(ω)
  const angularSpeed = f.三维向量模运算(omegaVec)
  const rotationAxis = f.三维向量归一化(omegaVec)

  // 6. 施加直线运动器（水平方向）+ 旋转运动器（独立角速度驱动）
  f.addUniformBasicLinearMotionDevice(self, 'ballLinear', 0.24, horizVel)
  f.addUniformBasicRotationBasedMotionDevice(self, 'ballRotate', 0.24, angularSpeed, rotationAxis)

  // 7. 写回所有变量（带事件触发）
  f.设置自定义变量(self, 'ballVx', ballVx, true)
  f.设置自定义变量(self, 'ballVz', ballVz, true)
  f.设置自定义变量(self, 'angularVx', angularVx, true)
  f.设置自定义变量(self, 'angularVy', angularVy, true)
  f.设置自定义变量(self, 'angularVz', angularVz, true)
}

/**
 * 空中：重力 + 空气阻力 + 简单马格努斯偏移
 *   1. 读取 ballVx, ballVz, ballVy, ballY, airResistance (0.995), gravity (9.8), angularVx, angularVy, angularVz
 *   2. Vy -= gravity * 0.12（重力加速度 * tick 间隔）
 *   3. ballY += ballVy * 0.12（更新高度）
 *   4. Vx *= airResistance, Vz *= airResistance（空气阻力衰减）
 *   5. 马格努斯偏移：cross(ω归一化, V) × 微小系数 = 偏移量，加到 V 上（速度方向绕角速度轴偏转）
 *   6. 角速度轻微衰减：ω *= 0.998
 *   7. 施加直线运动器（含 Y 分量）+ 旋转运动器
 *   8. 写回所有变量
 */
export function doAir(f: any): void {
  // 1. 读取变量（全部 const，避免 let 突变导致的跨文件 GIA 类型解析问题）
  const ballVxOld = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
  const ballVzOld = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')
  const ballVyOld = f.数据类型转换(f.获取自定义变量(self, 'ballVy'), 'float')
  const ballYOld = f.数据类型转换(f.获取自定义变量(self, 'ballY'), 'float')
  const airResistance = f.数据类型转换(f.获取自定义变量(self, 'airResistance'), 'float')
  const gravity = f.数据类型转换(f.获取自定义变量(self, 'gravity'), 'float')
  const angularVxOld = f.数据类型转换(f.获取自定义变量(self, 'angularVx'), 'float')
  const angularVyOld = f.数据类型转换(f.获取自定义变量(self, 'angularVy'), 'float')
  const angularVzOld = f.数据类型转换(f.获取自定义变量(self, 'angularVz'), 'float')

  // 2. 重力加速度 * tick 间隔（dt = 0.12s）— 用 vec3 缩放代替 float * float
  const gravityVec3 = f.创建三维向量(0.0, gravity, 0.0)
  const gravityScaled = f.三维向量缩放(gravityVec3, 0.12)
  const gravityDt = f.拆分三维向量(gravityScaled).yComponent
  const vySubA = f.创建三维向量(0.0, ballVyOld, 0.0)
  const vySubB = f.创建三维向量(0.0, gravityDt, 0.0)
  const vySubResult = f.三维向量减法(vySubA, vySubB)
  const ballVyAfterGravity = f.拆分三维向量(vySubResult).yComponent

  // 3. 更新高度（使用新 Vy）— 用 vec3 缩放代替 float * float
  const vyForY = f.创建三维向量(0.0, ballVyAfterGravity, 0.0)
  const vyForYScaled = f.三维向量缩放(vyForY, 0.12)
  const ballYDelta = f.拆分三维向量(vyForYScaled).yComponent
  const yAddA = f.创建三维向量(0.0, ballYOld, 0.0)
  const yAddB = f.创建三维向量(0.0, ballYDelta, 0.0)
  const yAddResult = f.三维向量加法(yAddA, yAddB)
  const ballY = f.拆分三维向量(yAddResult).yComponent

  // 4. 空气阻力衰减 — 用三维向量缩放代替 float * float
  const velPreDrag = f.创建三维向量(ballVxOld, ballVyAfterGravity, ballVzOld)
  const velAfterDrag = f.三维向量缩放(velPreDrag, airResistance)
  const dragComps = f.拆分三维向量(velAfterDrag)
  const ballVxAfterDrag = dragComps.xComponent
  const ballVyAfterDrag = dragComps.yComponent
  const ballVzAfterDrag = dragComps.zComponent

  // 5. 简单马格努斯偏移：cross(ω归一化, V) × 微小系数 = 偏移量，加到 V 上
  const omegaVec = f.创建三维向量(angularVxOld, angularVyOld, angularVzOld)
  const omegaNorm = f.三维向量归一化(omegaVec)
  // cross(ω_norm, V) 给出垂直于角速度轴和速度方向的偏移方向
  const crossProd = f._3dVectorCrossProduct(omegaNorm, velAfterDrag)
  const magnusCoeff = 0.005 // 微小系数，每 tick 的速度偏移比例
  const magnusOffset = f.三维向量缩放(crossProd, magnusCoeff)
  const newVel = f.三维向量加法(velAfterDrag, magnusOffset)
  // 拆分回标量分量
  const velComps = f.拆分三维向量(newVel)
  const ballVx = velComps.xComponent
  const ballVy = velComps.yComponent
  const ballVz = velComps.zComponent

  // 6. 角速度轻微衰减 — 用三维向量缩放代替 float * float
  const omegaDecayed = f.三维向量缩放(omegaVec, 0.998)
  const omegaDecayComps = f.拆分三维向量(omegaDecayed)
  const angularVx = omegaDecayComps.xComponent
  const angularVy = omegaDecayComps.yComponent
  const angularVz = omegaDecayComps.zComponent

  // 7. 施加直线运动器（含 Y 分量）+ 旋转运动器
  const finalVel = f.创建三维向量(ballVx, ballVy, ballVz)
  f.addUniformBasicLinearMotionDevice(self, 'ballLinear', 0.24, finalVel)

  // 旋转轴 = normalize(ω)，角速度大小 = |ω|
  const updatedOmega = f.创建三维向量(angularVx, angularVy, angularVz)
  const angularSpeed = f.三维向量模运算(updatedOmega)
  const rotationAxis = f.三维向量归一化(updatedOmega)
  f.addUniformBasicRotationBasedMotionDevice(self, 'ballRotate', 0.24, angularSpeed, rotationAxis)

  // 8. 写回所有变量（带事件触发）
  f.设置自定义变量(self, 'ballVx', ballVx, true)
  f.设置自定义变量(self, 'ballVy', ballVy, true)
  f.设置自定义变量(self, 'ballVz', ballVz, true)
  f.设置自定义变量(self, 'ballY', ballY, true)
  f.设置自定义变量(self, 'angularVx', angularVx, true)
  f.设置自定义变量(self, 'angularVy', angularVy, true)
  f.设置自定义变量(self, 'angularVz', angularVz, true)
}

/**
 * 锁定：滑-滚-追循环
 *   1. 读取 lockedBy, ballVx, ballVz
 *   2. 如果球接近静止（xzSpeed < 0.05，刚进入锁定的第一帧）：
 *      - 计算朝向 lockedBy 球员前方的方向，施加初始水平速度 7.5（确保进入 SLIDE）
 *      - 写回速度
 *   3. 否则（球已在运动中）：
 *      - 施加摩擦衰减（Vx *= frictionDecay, Vz *= frictionDecay）
 *      - 计算球到锁定者的距离 distFromLocker
 *      - 写回 distFromLocker 到自定义变量（供守卫 canExitLock 读）
 *      - 注意：不再施加额外踢球力。球速衰减到阈值后，main.ts 调用 nextState()，
 *        由转移表决定是再踢一脚还是退出 LOCK
 */
export function doLock(f: any): void {
  // 1. 读取变量 — lockedBy 不加数据类型转换，保留 entity 类型供获取实体位置与旋转
  const lockedBy = f.获取自定义变量(self, 'lockedBy')
  const ballVxRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVx'), 'float')
  const ballVzRaw = f.数据类型转换(f.获取自定义变量(self, 'ballVz'), 'float')

  // 判断球是否接近静止（刚进入锁定的第一帧）
  const xzSpeed = f.三维向量模运算(f.创建三维向量(ballVxRaw, 0.0, ballVzRaw))

  if (bool(xzSpeed < 0.05)) {
    // 2. 球刚进入锁定第一帧：朝向 lockedBy 球员前方，施加初始水平速度

    // 读取 lockedBy 球员实体的位置和面朝方向
    const lockerLocRot = f.获取实体位置与旋转(lockedBy)

    // 计算球员面朝方向（Z 轴正方向旋转球员欧拉角）
    const lockerForward = 计算前向(f, lockerLocRot.rotate)
    const fwdComps = f.拆分三维向量(lockerForward)

    // 水平速度 7.5，方向 = 球员前向 — 用 vec3 缩放代替 float * float
    const fwdVec = f.创建三维向量(fwdComps.xComponent, 0.0, fwdComps.zComponent)
    const kickVec = f.三维向量缩放(fwdVec, 7.5)
    const kickComps = f.拆分三维向量(kickVec)
    const kickVx = kickComps.xComponent
    const kickVz = kickComps.zComponent

    // 施加直线运动器（初始踢球力）
    const kickVel = f.创建三维向量(kickVx, 0.0, kickVz)
    f.addUniformBasicLinearMotionDevice(self, 'ballLinear', 0.24, kickVel)

    // 写回速度（带事件触发，更新转移表能感知的 xzSpeed）
    f.设置自定义变量(self, 'ballVx', kickVx, true)
    f.设置自定义变量(self, 'ballVz', kickVz, true)
  } else {
    // 3. 球已在运动中：摩擦衰减 + 计算与锁定者的距离

    const frictionDecay = f.数据类型转换(f.获取自定义变量(self, 'frictionDecay'), 'float')

	    // 线速度摩擦衰减 — 用三维向量缩放代替 float * float
	    const rawVel = f.创建三维向量(ballVxRaw, 0.0, ballVzRaw)
	    const decayedVel = f.三维向量缩放(rawVel, frictionDecay)
	    const decayedComps = f.拆分三维向量(decayedVel)
	    const ballVx = decayedComps.xComponent
	    const ballVz = decayedComps.zComponent

	    // 施加直线运动器（衰减后的水平速度）
	    f.addUniformBasicLinearMotionDevice(self, 'ballLinear', 0.24, decayedVel)

    // 计算球到锁定者的距离（供守卫 canExitLock 检查 distFromLocker > 2m）
    const ballLocRot = f.获取实体位置与旋转(self)
    const ballPos = ballLocRot.location
    const lockerLocRot = f.获取实体位置与旋转(lockedBy)
    const lockerPos = lockerLocRot.location
    const diff = f.三维向量减法(lockerPos, ballPos)
    const distFromLocker = f.三维向量模运算(diff)

    // 写回变量（带事件触发）
    f.设置自定义变量(self, 'ballVx', ballVx, true)
    f.设置自定义变量(self, 'ballVz', ballVz, true)
    f.设置自定义变量(self, 'distFromLocker', distFromLocker, true)
  }
}
