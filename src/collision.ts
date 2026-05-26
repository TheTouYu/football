// collision.ts — 足球碰撞检测与响应模块
// 碰撞响应只修改速度向量，不直接改状态
// 修改后下一个 tick 的转移表自然判断出正确状态
// 参考 docs/STATE_MACHINE_DESIGN_ZH.md 第 3 节
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
// ↑ f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明

// ============================================================
// 碰撞半径常量
// ============================================================

/** 足球半径（物理常量，与元件的实际半径一致） */
const BALL_RADIUS = 0.45
/** 地面碰撞后高度微调偏移（防止穿透） */
const GROUND_EPSILON = 0.001
/** 球员碰撞半径倍率（粗略估计：球半径 * 2 = 球员身体碰撞圈） */
const PLAYER_COLLISION_MULTIPLIER = 2.0
/** 碰撞反弹衰减系数（地面和球员统一先写死 0.5） */
const BOUNCE_DECAY = 0.5

// ============================================================
// 地面碰撞检测与响应
// ============================================================

/**
 * 地面碰撞检测与响应
 *
 * 条件：球心高度 <= 球半径（触地）且 垂直速度向下（ballVy < 0）
 * 响应：ballVy = -ballVy * 0.5（反弹衰减）
 *       ballY = ballRadius + 0.001（贴地偏移，防止穿透）
 *
 * 反弹后若 ballVy > 0 → 下个 tick canEnterAirGround 命中 → 进入 AIR（弹起）
 * 反弹后若 ballVy ≈ 0 → 下个 tick canLand 命中 → 落回地面
 *
 * @param f 节点图 API
 * @returns true 表示发生了地面碰撞
 */
export function checkGroundCollision(f: any): boolean {
  // 读取球的高度和垂直速度
  const ballY = f.数据类型转换(f.获取自定义变量(self, 'ballY'), 'float')
  const ballVy = f.数据类型转换(f.获取自定义变量(self, 'ballVy'), 'float')

  // 条件：球触地且正在下落
  if (bool(ballY <= BALL_RADIUS && ballVy < 0.0)) {
    // 反弹：垂直速度反向，乘以衰减系数 0.5
    const newVy = -ballVy * BOUNCE_DECAY
    // 球高度重置为球半径 + 微小偏移，防止穿透
    const newY = BALL_RADIUS + GROUND_EPSILON

    f.设置自定义变量(self, 'ballVy', newVy)
    f.设置自定义变量(self, 'ballY', newY)
    return true
  }
  return false
}

// ============================================================
// 球员碰撞检测与响应
// ============================================================

/**
 * 球员碰撞检测（球碰到球员身体）
 *
 * 条件：球到球员距离 < 碰撞半径（ballRadius * 2）
 *
 * 响应：速度反射（入射角 = 反射角），衰减 0.5
 *   入射方向 = normalize(ballPos - playerPos)
 *   V_reflected = V - 2 * dot(V, incidentDir) * incidentDir
 *   V_final = V_reflected * 0.5
 *
 * 碰撞响应可能产生 Y 分量（球被弹起），因此需要写回 Vx、Vy、Vz 三个分量
 *
 * @param f            节点图 API
 * @param playerEntity 被检测的球员实体
 * @returns true 表示发生了球员碰撞
 */
export function checkPlayerCollision(f: any, playerEntity: any): boolean {
  // 获取球实体（通过元件 ID 查找）
  const balls = f.获取场上指定元件ID的实体(prefabId(1077936262))
  const ball = balls[0]

  // 获取球和球员的位置
  const ballLocRot = f.获取实体位置与旋转(ball)
  const playerLocRot = f.获取实体位置与旋转(playerEntity)
  const ballPos = ballLocRot.location
  const playerPos = playerLocRot.location

  // 计算距离向量（球位置 - 球员位置）和距离
  const diff = f.三维向量减法(ballPos, playerPos)
  const dist = f.三维向量模运算(diff)

  // 碰撞半径：球半径 * 2（球员身体碰撞圈的粗略估计）
  const collisionRadius = BALL_RADIUS * PLAYER_COLLISION_MULTIPLIER

  // 条件：球到球员距离 < 碰撞半径
  if (bool(dist < collisionRadius)) {
    // 读取球当前速度（三个分量）
    const ballVx = f.数据类型转换(f.获取自定义变量(ball, 'ballVx'), 'float')
    const ballVy = f.数据类型转换(f.获取自定义变量(ball, 'ballVy'), 'float')
    const ballVz = f.数据类型转换(f.获取自定义变量(ball, 'ballVz'), 'float')

    // 构建速度向量 V = (Vx, Vy, Vz)
    const vel = f.创建三维向量(ballVx, ballVy, ballVz)

    // 入射方向：从球员指向球（归一化）
    // diff 已经是 ballPos - playerPos，直接归一化即为入射方向
    const incidentDir = f.三维向量归一化(diff)

    // 反射公式：V_reflected = V - 2 * dot(V, incidentDir) * incidentDir
    const dotVN = f.三维向量内积(vel, incidentDir)
    const twoDot = dotVN * 2.0
    const scaledIncident = f.三维向量缩放(incidentDir, twoDot)
    const velReflected = f.三维向量减法(vel, scaledIncident)

    // 衰减 0.5
    const velFinal = f.三维向量缩放(velReflected, BOUNCE_DECAY)

    // 提取分量并写回（碰撞响应可能产生 Y 分量！）
    const velComps = f.拆分三维向量(velFinal)
    f.设置自定义变量(ball, 'ballVx', velComps.xComponent)
    f.设置自定义变量(ball, 'ballVy', velComps.yComponent)
    f.设置自定义变量(ball, 'ballVz', velComps.zComponent)

    return true
  }
  return false
}
