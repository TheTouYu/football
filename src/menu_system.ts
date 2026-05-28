// menu_system.ts — 交互式二级菜单系统（可复用模块）
// v1: 5行×2列 二级菜单，通过界面控件（上下左右空格）导航
//
// ===== 接入指南 =====
// 1. 改底部「菜单内容定义」区的文字
// 2. 改「渲染配置」区的目标实体和变量名前缀
// 3. 改 col1Text()/subText() 的文字映射
// 4. 消费者监听 ball._menuConfirm 变化 → 读 _menuResult* 数据 → 分派
// 5. 分配新节点图 ID
//
// ===== 输出变量（写在 _RESULT_TARGET 实体上）=====
// _menuConfirm (int) — 每次确认递增，消费者监听此变量变化事件
// _menuResult  (int) — 编码位置 = mainIdx*10 + row
// _menuResultMain (str) — 主菜单文字
// _menuResultSub  (str) — 子菜单文字
//
// ===== 渲染输出（写在 _RENDER_TARGET 实体的 _RENDER_PREFIX{1,2,3,4} 变量上）=====
// 文本框模板：
//   {1:lv._RENDER_PREFIX1.i}{1:lv._RENDER_PREFIX2.i} · {1:lv._RENDER_PREFIX3.i}{1:lv._RENDER_PREFIX4.i}
//
// v2 扩展点：
//   - VISIBLE_ROWS 改为动态变量支持滚动视口
//   - _menuCol 改为 _menuPath[] 栈支持多级（MENU_MAX_DEPTH）
//   - _menuScrollOffset 支持数据项 > 可见行时的轮询
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import { g } from 'genshin-ts-touyu/runtime/core'

// ============================================================
// 渲染配置（换系统时改下面的 stage 为目标实体）
// ============================================================

/** 渲染变量名前缀（不需要改） */

// 足球元件 ID
const _BALL_PREFAB = 1077936262

// ============================================================
// 可配置常量
// ============================================================

/** 可见行数（v2：改为动态变量支持滚动） */
const VISIBLE_ROWS = 5
/** 菜单最大深度（v2：>2 时启用路径栈） */
const MENU_MAX_DEPTH = 2

// 主菜单最大行索引（4 项，索引 0~3）
const MAIN_MAX_ROW = 3n
// 子菜单最大行索引
const SUB0_MAX_ROW = 2n
const SUB1_MAX_ROW = 4n
const SUB2_MAX_ROW = 1n
const SUB3_MAX_ROW = 2n

// ============================================================
// 菜单内容定义（换系统时只需改下面的数组 + col1Text/subText 函数）
// ============================================================

/** 第一列内容（主菜单），长度 VISIBLE_ROWS */
const COL1: string[] = ['运行控制', '状态跳转', '信息诊断', '其他操作', '']

/** 子菜单内容表 */
const SUB_0: string[] = ['单步完整',    '恢复运行', '慢速切换', '', '']
const SUB_1: string[] = ['强制静止',    '强制滚动', '强制滑动', '强制空中', '强制锁定']
const SUB_2: string[] = ['打印诊断',    '守卫评估', '',         '',      '']
const SUB_3: string[] = ['重置足球',    '单步转移', '单步物理', '',      '']

// ============================================================
// 辅助函数
// ============================================================
function submenuContent(mainIdx: bigint): string[] {
  switch (mainIdx) {
    case 0n: return SUB_0
    case 1n: return SUB_1
    case 2n: return SUB_2
    case 3n: return SUB_3
    default:  return ['', '', '', '', '']
  }
}

function submenuMaxRow(mainIdx: bigint): bigint {
  switch (mainIdx) {
    case 0n: return SUB0_MAX_ROW
    case 1n: return SUB1_MAX_ROW
    case 2n: return SUB2_MAX_ROW
    case 3n: return SUB3_MAX_ROW
    default:  return 0n
  }
}

function col1Text(mainIdx: bigint): string {
  switch (mainIdx) {
    case 0n: return '运行控制'
    case 1n: return '状态跳转'
    case 2n: return '信息诊断'
    case 3n: return '其他操作'
    default:  return ''
  }
}

function subText(mainIdx: bigint, row: bigint): string {
  switch (mainIdx) {
    case 0n:
      switch (row) {
        case 0n: return '单步完整'
        case 1n: return '恢复运行'
        case 2n: return '慢速切换'
      }
      break
    case 1n:
      switch (row) {
        case 0n: return '强制静止'
        case 1n: return '强制滚动'
        case 2n: return '强制滑动'
        case 3n: return '强制空中'
        case 4n: return '强制锁定'
      }
      break
    case 2n:
      switch (row) {
        case 0n: return '打印诊断'
        case 1n: return '守卫评估'
      }
      break
    case 3n:
      switch (row) {
        case 0n: return '重置足球'
        case 1n: return '单步转移'
        case 2n: return '单步物理'
      }
      break
  }
  return ''
}

// ============================================================
// Menu_交互菜单 (ID 1073742447, 挂载角色实体)
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

    f.设置自定义变量(self, '_menuRow', 0n)
    f.设置自定义变量(self, '_menuCol', 0n)
    f.设置自定义变量(self, '_menuMainIdx', 0n)
    f.设置自定义变量(self, '_menuSubRow0', 0n)
    f.设置自定义变量(self, '_menuSubRow1', 0n)
    f.设置自定义变量(self, '_menuSubRow2', 0n)
    f.设置自定义变量(self, '_menuSubRow3', 0n)
    // 确认计数器
    f.设置自定义变量(self, '_menuConfirm', 0n)

    f.启动定时器(self, 'menuInitDelay', false, [0.5])
  })
  .on('定时器触发时', (evt, f) => {
    if (bool(evt.timerName != 'menuInitDelay')) return

    f.设置自定义变量(stage, '_menu_fld1', list('str', ['*', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))
    f.设置自定义变量(stage, '_menu_fld3', list('str', [' ', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld4', list('str', SUB_0))
  })
  .on('界面控件组触发时', (evt, f) => {
    if (!bool(f.equal(evt.eventSourceEntity, self))) return

    const btnId = evt.uiControlGroupIndex
    const row = f.获取自定义变量(self, '_menuRow').asType('int')
    const col = f.获取自定义变量(self, '_menuCol').asType('int')
    const mainIdx = f.获取自定义变量(self, '_menuMainIdx').asType('int')
    const confirm = f.获取自定义变量(self, '_menuConfirm').asType('int')
    const sub0 = f.获取自定义变量(self, '_menuSubRow0').asType('int')
    const sub1 = f.获取自定义变量(self, '_menuSubRow1').asType('int')
    const sub2 = f.获取自定义变量(self, '_menuSubRow2').asType('int')
    const sub3 = f.获取自定义变量(self, '_menuSubRow3').asType('int')

    let newRow = row
    let newCol = col
    let newMainIdx = mainIdx
    let newConfirm = confirm
    let newSub0 = sub0
    let newSub1 = sub1
    let newSub2 = sub2
    let newSub3 = sub3

    const maxRow = bool(col === 0n) ? MAIN_MAX_ROW : submenuMaxRow(mainIdx)

    switch (btnId) {
      case 1073742328n: // 上（循环）
        newRow = bool(row > 0n) ? (row - 1n) : maxRow
        break
      case 1073742329n: // 下（循环）
        newRow = bool(row < maxRow) ? (row + 1n) : 0n
        break
      case 1073742330n: // 左：返回上级，保存子光标
        switch (mainIdx) {
          case 0n: newSub0 = row; break
          case 1n: newSub1 = row; break
          case 2n: newSub2 = row; break
          case 3n: newSub3 = row; break
        }
        newCol = 0n
        newRow = mainIdx
        break
      case 1073742331n: // 右：进入子菜单，恢复子光标
        newMainIdx = row
        newCol = 1n
        switch (row) {
          case 0n: newRow = sub0; break
          case 1n: newRow = sub1; break
          case 2n: newRow = sub2; break
          case 3n: newRow = sub3; break
          default: newRow = 0n; break
        }
        break
      case 1073742335n: // 空格 → 确认选中
        if (col === 1n) {
          const balls = f.获取场上指定元件ID的实体(prefabId(_BALL_PREFAB))
          const ball = balls[0]
          // 确认信号（消费者监听此变量变化）
          newConfirm = confirm + 1n
          f.设置自定义变量(ball, '_menuConfirm', newConfirm, true)
          // 附带数据
          f.设置自定义变量(ball, '_menuResult', mainIdx * 10n + row, true)
          f.设置自定义变量(ball, '_menuResultMain', col1Text(mainIdx), true)
          f.设置自定义变量(ball, '_menuResultSub', subText(mainIdx, row), true)
        }
        break
    }

    // 写回状态
    f.设置自定义变量(self, '_menuRow', newRow)
    f.设置自定义变量(self, '_menuCol', newCol)
    f.设置自定义变量(self, '_menuMainIdx', newMainIdx)
    f.设置自定义变量(self, '_menuConfirm', newConfirm)
    f.设置自定义变量(self, '_menuSubRow0', newSub0)
    f.设置自定义变量(self, '_menuSubRow1', newSub1)
    f.设置自定义变量(self, '_menuSubRow2', newSub2)
    f.设置自定义变量(self, '_menuSubRow3', newSub3)

    // ===== 渲染 =====

    f.设置自定义变量(stage, '_menu_fld1', list('str', [
      bool(bool(newRow === 0n) && bool(newCol === 0n)) ? '*' : ' ',
      bool(bool(newRow === 1n) && bool(newCol === 0n)) ? '*' : ' ',
      bool(bool(newRow === 2n) && bool(newCol === 0n)) ? '*' : ' ',
      bool(bool(newRow === 3n) && bool(newCol === 0n)) ? '*' : ' ',
      bool(bool(newRow === 4n) && bool(newCol === 0n)) ? '*' : ' ',
    ]))
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))
    f.设置自定义变量(stage, '_menu_fld3', list('str', [
      bool(bool(newRow === 0n) && bool(newCol === 1n)) ? '*' : ' ',
      bool(bool(newRow === 1n) && bool(newCol === 1n)) ? '*' : ' ',
      bool(bool(newRow === 2n) && bool(newCol === 1n)) ? '*' : ' ',
      bool(bool(newRow === 3n) && bool(newCol === 1n)) ? '*' : ' ',
      bool(bool(newRow === 4n) && bool(newCol === 1n)) ? '*' : ' ',
    ]))
    f.设置自定义变量(stage, '_menu_fld4', list('str', submenuContent(newMainIdx)))
  })
