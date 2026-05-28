// menu_bridge.ts — 菜单命令桥接
// 挂在元件7上，监听 _menuConfirm 变化，解码后写入 _debugFlash 到足球
// 换菜单功能时只需改此文件的 switch 映射
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { g } from 'genshin-ts-touyu/runtime/core'

const BALL_PREFAB = 1077936262

g.server({
  id: 1073742449,
  name: 'Menu_命令桥接',
  lang: 'zh'
})
  .on('自定义变量变化时', (evt, f) => {
    if (bool(evt.variableName != '_menuConfirm')) return

    const result = f.获取自定义变量(self, '_menuResult').asType('int')
    const balls = f.获取场上指定元件ID的实体(prefabId(BALL_PREFAB))
    const ball = balls[0]

    switch (result) {
      case 0n:  f.设置自定义变量(ball, '_debugFlash0', 1.0, true); break  // 运行控制→单步完整
      case 1n:  f.设置自定义变量(ball, '_debugFlash1', 1.0, true); break  // 运行控制→恢复运行
      case 2n:  f.设置自定义变量(ball, '_debugFlash4', 1.0, true); break  // 运行控制→慢速切换
      case 10n: f.设置自定义变量(ball, '_debugFlash8', 1.0, true); break  // 状态跳转→强制静止
      case 11n: f.设置自定义变量(ball, '_debugFlash9', 1.0, true); break  // 状态跳转→强制滚动
      case 12n: f.设置自定义变量(ball, '_debugFlash10', 1.0, true); break // 状态跳转→强制滑动
      case 13n: f.设置自定义变量(ball, '_debugFlash11', 1.0, true); break // 状态跳转→强制空中
      case 14n: f.设置自定义变量(ball, '_debugFlash12', 1.0, true); break // 状态跳转→强制锁定
      case 20n: f.设置自定义变量(ball, '_debugFlash3', 1.0, true); break  // 信息诊断→打印诊断
      case 21n: f.设置自定义变量(ball, '_debugFlash7', 1.0, true); break  // 信息诊断→守卫评估
      case 30n: f.设置自定义变量(ball, '_debugFlash2', 1.0, true); break  // 其他操作→重置足球
      case 31n: f.设置自定义变量(ball, '_debugFlash5', 1.0, true); break  // 其他操作→单步转移
      case 32n: f.设置自定义变量(ball, '_debugFlash6', 1.0, true); break  // 其他操作→单步物理
    }
  })
