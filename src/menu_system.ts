// menu_system.ts — 交互式二级菜单系统（可复用模块）
// v1: 5行×2列 二级菜单，通过界面控件（上下左右空格）导航
//
// 挂载：角色实体（必须！界面控件组触发时 只有角色实体能收到）
// 渲染目标：stage 上 4 个 str_list 变量（对应 struct 菜单 的字段 1/2/3/4）
// 文本框模板：{1:lv.菜单.1.i}{1:lv.菜单.2.i} · {1:lv.菜单.3.i}{1:lv.菜单.4.i}
//
// v2 扩展点：
//   - VISIBLE_ROWS 改为动态变量支持滚动视口
//   - _menuCol 改为 _menuPath[] 栈支持多级（MENU_MAX_DEPTH）
//   - _menuScrollOffset 支持数据项 > 可见行时的轮询
//   - 命令表改为可注册的回调模式
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import { g } from 'genshin-ts-touyu/runtime/core'

// ============================================================
// 可配置常量（换系统时改这里）
// ============================================================

/** 可见行数（v2：改为动态变量支持滚动） */
const VISIBLE_ROWS = 5
/** 菜单最大深度（v2：>2 时启用路径栈） */
const MENU_MAX_DEPTH = 2
/** 主菜单项数 */
const MAIN_ITEM_COUNT = 4

// 按钮 ID
const BTN_UP = 1073742328n
const BTN_DOWN = 1073742329n
const BTN_LEFT = 1073742330n
const BTN_RIGHT = 1073742331n
const BTN_SPACE = 1073742335n

// 足球元件 ID
const BALL_PREFAB = 1077936262

// ============================================================
// 菜单内容定义（换系统时只需改下面的数组）
// ============================================================

/** 第一列内容（主菜单），长度 VISIBLE_ROWS，不足补空串 */
const COL1: string[] = ['运行控制', '状态跳转', '信息诊断', '其他操作', '']

/** 子菜单内容（每个主菜单对应一个长度 VISIBLE_ROWS 的数组） */
const SUB_0: string[] = ['单步完整', '恢复运行', '慢速切换', '', '']
const SUB_1: string[] = ['强制静止', '强制滚动', '强制滑动', '强制空中', '强制锁定']
const SUB_2: string[] = ['打印诊断', '守卫评估', '', '', '']
const SUB_3: string[] = ['重置足球', '单步转移', '单步物理', '', '']

/** 每个子菜单项数（用于下边界钳位） */
const SUB_0_COUNT = 3
const SUB_1_COUNT = 5
const SUB_2_COUNT = 2
const SUB_3_COUNT = 3

// ============================================================
// Menu_交互菜单 (ID 1073742447, 挂载角色实体)
// 多人模式：evt.eventSourceEntity == self 守卫防重复触发
// ============================================================

g.server({
  id: 1073742447,
  name: 'Menu_交互菜单',
  lang: 'zh',
  variables: {
    _init: false
  }
})
  .on('实体创建时', (_evt, f) => {
    if (f.获取节点图变量自动类型推断('_init')) return
    f.设置节点图变量自动类型推断('_init', true)

    // 状态变量（v2：_menuCol → _menuPath[] 栈）
    f.设置自定义变量(self, '_menuRow', 0.0)
    f.设置自定义变量(self, '_menuCol', 0.0)
    f.设置自定义变量(self, '_menuMainIdx', 0.0)

    // stage 关卡实体初始化需要时间，延迟 500ms 后首次渲染
    f.启动定时器(self, 'menuInitDelay', false, [0.5])
  })
  .on('定时器触发时', (evt, f) => {
    // 只处理 menuInitDelay 一次性定时器
    if (bool(evt.timerName != 'menuInitDelay')) return

    // 初始渲染 (row=0, col=0, mainIdx=0)
    f.设置自定义变量(stage, '_menu_fld1', list('str', ['*', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))
    f.设置自定义变量(stage, '_menu_fld3', list('str', [' ', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld4', list('str', SUB_0))
  })
  .on('界面控件组触发时', (evt, f) => {
    // 多人守卫：只处理属于本角色的交互事件
    if (!bool(f.equal(evt.eventSourceEntity, self))) return

    const btnId = evt.uiControlGroupIndex

    // 读状态
    const row = f.获取自定义变量(self, '_menuRow').asType('float')
    const col = f.获取自定义变量(self, '_menuCol').asType('float')
    const mainIdx = f.获取自定义变量(self, '_menuMainIdx').asType('float')

    let newRow = row
    let newCol = col
    let newMainIdx = mainIdx

    // ===== 导航 =====
    if (bool(btnId === BTN_UP)) {
      newRow = bool(row - 1.0 < 0.0) ? 0.0 : (row - 1.0)
    } else if (bool(btnId === BTN_DOWN)) {
      let col1Max = 0.0
      if (bool(mainIdx === 0.0)) col1Max = float(SUB_0_COUNT) - 1.0
      else if (bool(mainIdx === 1.0)) col1Max = float(SUB_1_COUNT) - 1.0
      else if (bool(mainIdx === 2.0)) col1Max = float(SUB_2_COUNT) - 1.0
      else if (bool(mainIdx === 3.0)) col1Max = float(SUB_3_COUNT) - 1.0

      const maxRow = bool(col === 0.0) ? (float(MAIN_ITEM_COUNT) - 1.0) : col1Max
      const rowPlus = row + 1.0
      newRow = bool(rowPlus > maxRow) ? maxRow : rowPlus
    } else if (bool(btnId === BTN_LEFT)) {
      newCol = 0.0
    } else if (bool(btnId === BTN_RIGHT)) {
      newCol = 1.0
      newMainIdx = row
    } else if (bool(btnId === BTN_SPACE)) {
      // ===== 命令执行 =====
      if (bool(col === 1.0)) {
        const balls = f.获取场上指定元件ID的实体(prefabId(BALL_PREFAB))
        const ball = balls[0]

        if (bool(mainIdx === 0.0)) {
          if (bool(row === 0.0)) f.设置自定义变量(ball, '_debugFlash0', 1.0, true)
          else if (bool(row === 1.0)) f.设置自定义变量(ball, '_debugFlash1', 1.0, true)
          else if (bool(row === 2.0)) f.设置自定义变量(ball, '_debugFlash4', 1.0, true)
        } else if (bool(mainIdx === 1.0)) {
          if (bool(row === 0.0)) f.设置自定义变量(ball, '_debugFlash8', 1.0, true)
          else if (bool(row === 1.0)) f.设置自定义变量(ball, '_debugFlash9', 1.0, true)
          else if (bool(row === 2.0)) f.设置自定义变量(ball, '_debugFlash10', 1.0, true)
          else if (bool(row === 3.0)) f.设置自定义变量(ball, '_debugFlash11', 1.0, true)
          else if (bool(row === 4.0)) f.设置自定义变量(ball, '_debugFlash12', 1.0, true)
        } else if (bool(mainIdx === 2.0)) {
          if (bool(row === 0.0)) f.设置自定义变量(ball, '_debugFlash3', 1.0, true)
          else if (bool(row === 1.0)) f.设置自定义变量(ball, '_debugFlash7', 1.0, true)
        } else if (bool(mainIdx === 3.0)) {
          if (bool(row === 0.0)) f.设置自定义变量(ball, '_debugFlash2', 1.0, true)
          else if (bool(row === 1.0)) f.设置自定义变量(ball, '_debugFlash5', 1.0, true)
          else if (bool(row === 2.0)) f.设置自定义变量(ball, '_debugFlash6', 1.0, true)
        }
      }
    }

    // 写回状态
    f.设置自定义变量(self, '_menuRow', newRow)
    f.设置自定义变量(self, '_menuCol', newCol)
    f.设置自定义变量(self, '_menuMainIdx', newMainIdx)

    // ===== 渲染 =====

    // 字段1：第一列前缀（* = 选中行+col=0）
    const f1r0 = bool(bool(newRow === 0.0) && bool(newCol === 0.0)) ? '*' : ' '
    const f1r1 = bool(bool(newRow === 1.0) && bool(newCol === 0.0)) ? '*' : ' '
    const f1r2 = bool(bool(newRow === 2.0) && bool(newCol === 0.0)) ? '*' : ' '
    const f1r3 = bool(bool(newRow === 3.0) && bool(newCol === 0.0)) ? '*' : ' '
    const f1r4 = bool(bool(newRow === 4.0) && bool(newCol === 0.0)) ? '*' : ' '
    f.设置自定义变量(stage, '_menu_fld1', list('str', [f1r0, f1r1, f1r2, f1r3, f1r4]))

    // 字段2：第一列内容（永远不变）
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))

    // 字段3：第二列前缀（* = 选中行+col=1）
    const f3r0 = bool(bool(newRow === 0.0) && bool(newCol === 1.0)) ? '*' : ' '
    const f3r1 = bool(bool(newRow === 1.0) && bool(newCol === 1.0)) ? '*' : ' '
    const f3r2 = bool(bool(newRow === 2.0) && bool(newCol === 1.0)) ? '*' : ' '
    const f3r3 = bool(bool(newRow === 3.0) && bool(newCol === 1.0)) ? '*' : ' '
    const f3r4 = bool(bool(newRow === 4.0) && bool(newCol === 1.0)) ? '*' : ' '
    f.设置自定义变量(stage, '_menu_fld3', list('str', [f3r0, f3r1, f3r2, f3r3, f3r4]))

    // 字段4：第二列内容（取决于 mainIdx）
    let f4r0 = ''; let f4r1 = ''; let f4r2 = ''; let f4r3 = ''; let f4r4 = ''
    if (bool(newMainIdx === 0.0)) {
      f4r0 = '单步完整'; f4r1 = '恢复运行'; f4r2 = '慢速切换'; f4r3 = ''; f4r4 = ''
    } else if (bool(newMainIdx === 1.0)) {
      f4r0 = '强制静止'; f4r1 = '强制滚动'; f4r2 = '强制滑动'; f4r3 = '强制空中'; f4r4 = '强制锁定'
    } else if (bool(newMainIdx === 2.0)) {
      f4r0 = '打印诊断'; f4r1 = '守卫评估'; f4r2 = ''; f4r3 = ''; f4r4 = ''
    } else if (bool(newMainIdx === 3.0)) {
      f4r0 = '重置足球'; f4r1 = '单步转移'; f4r2 = '单步物理'; f4r3 = ''; f4r4 = ''
    }
    f.设置自定义变量(stage, '_menu_fld4', list('str', [f4r0, f4r1, f4r2, f4r3, f4r4]))
  })
