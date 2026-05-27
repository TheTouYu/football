// logger.ts — 统一日志工具
// log: 发送信号到「日志操作」接收器 + 控制台 print(str()) 双重输出
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// ↑ f: any 是 genshin-ts 标准模式，中文函数名无 TS 类型声明

/**
 * 列表迭代回调：逐项打印到控制台
 * gstsServer 模式，用 gsts.f 调用 GIA API
 */
function 日志打印回调(item: any, _breakLoop: any): void {
  print(str(item))
}

/**
 * 统一日志：发信号到游戏日志接收器 + 控制台逐段打印
 *
 * @param f       节点图 API
 * @param channel 日志通道（'物理'/'状态机'/'锁定'/'扫描'/'诊断'）
 * @param items   日志内容数组，调用处传数组字面量
 *
 * 用法：
 *   log(f, '物理', ['地面碰撞 Vy=', str(ballVy), '→', str(bouncedVy)])
 *
 * 效果：
 *   信号 → 日志接收器（游戏中查看）
 *   控制台 → print(channel) + 列表迭代逐项打印
 */
export function log(f: any, channel: string, items: any[]): void {
  // 构建字符串列表（编译器展开数组字面量 → assemblyList）
  const msgList = f.拼装列表(items)

  // 1. 发信号到日志接收器（游戏中看）
  f.发送信号('日志操作', channel as any, msgList as any)

  // 2. 控制台逐段打印（本地调试用）
  print(str(channel))
  f.列表迭代循环(msgList, 日志打印回调)
}
