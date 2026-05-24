export function gstsServer计算踢球方向权重(dot: number) {
  // 返回 forward 权重（toBallDir 权重 = 1.0 - forward权重）
  // dot 越低（越偏离），toBallDir 权重越高，转弯时更积极地修正
  let fw = 0.7
  if (bool(dot > 0.7)) {
    fw = 0.7
  }
  if (bool(dot > 0.0 && dot <= 0.7)) {
    fw = 0.45
  }
  if (bool(dot <= 0.0)) {
    fw = 0.25
  }
  return fw
}

export function gstsServer计算对齐权重(dot: number) {
  let weight = 0.1
  if (bool(dot > 0.9)) {
    weight = 1.2
  }
  if (bool(dot > 0.5 && dot <= 0.9)) {
    weight = 1.0
  }
  if (bool(dot > 0.0 && dot <= 0.5)) {
    weight = 0.5
  }
  if (bool(dot > -0.5 && dot <= 0.0)) {
    weight = 0.2
  }
  return weight
}

export function gstsServer计算力系数(dot: number) {
  let coeff = 0.3
  if (bool(dot > 0.9)) {
    coeff = 0.8
  }
  if (bool(dot > 0.0 && dot <= 0.9)) {
    coeff = 1.2
  }
  return coeff
}
