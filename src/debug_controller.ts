// debug_controller.ts — 调试控制台
// Graph 1: 游戏开始时创建「元件7」实体（翻开的书籍），ID 1073742445
// Graph 2: 已废弃，原选项卡控制已迁移至 menu_system.ts (ID 1073742447)
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { g } from 'genshin-ts-touyu/runtime/core'

// ============================================================
// Graph 1: Debug_创建控制台 (ID 1073742445, 挂载足球实体)
// 职责：游戏开始时创建调试控制台实体（元件7）
// ============================================================

g.server({
  id: 1073742445,
  name: 'Debug_创建控制台',
  lang: 'zh',
  variables: {
    _init: false
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init')) {
      return
    }
    f.设置节点图变量自动类型推断('_init', true)

    // 在指定位置创建元件7（翻开的书籍）
    f.创建元件(
      prefabId(1077936280),           // 元件7
      f.创建三维向量(-3.0, 2.0, 0.0), // 位置
      f.创建三维向量(0.0, 0.0, 0.0),  // 旋转：默认朝向
      self,                            // 拥有者：足球实体
      false,                           // 不覆写等级
      0n,                              // 等级
      list('int', [])                  // 无单位标签
    )
  })

// ============================================================
// Graph 2: 已废弃 — 原选项卡控制
// 菜单交互已迁移至 menu_system.ts (ID 1073742447)
// 此 ID (1073742446) 保留，不挂载任何逻辑
// ============================================================

// ============================================================
// Graph 3: Menu_按键转发 (ID 1073742448, 挂载角色实体)
// 职责：过滤菜单按钮事件，转发给元件7实体
//       只转发上下左右空格 5 个按钮，其余忽略
// ============================================================

const MENU_BTN_UP    = 1073742339n
const MENU_BTN_DOWN  = 1073742340n
const MENU_BTN_LEFT  = 1073742341n
const MENU_BTN_RIGHT = 1073742342n
const MENU_BTN_SPACE = 1073742343n

g.server({
  id: 1073742448,
  name: 'Menu_按键转发',
  lang: 'zh'
})
  .on('界面控件组触发时', (evt, f) => {
    const btnId = evt.uiControlGroupIndex

    // 只转发菜单按钮
    if (bool(
      btnId === MENU_BTN_UP   || btnId === MENU_BTN_DOWN ||
      btnId === MENU_BTN_LEFT || btnId === MENU_BTN_RIGHT ||
      btnId === MENU_BTN_SPACE
    )) {
      const entities = f.获取场上指定元件ID的实体(prefabId(1077936280))
      const menuEntity = entities[0]
      f.转发事件(menuEntity)
    }
  })
