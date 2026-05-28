// menu_system.ts — 交互式二级菜单系统（可复用模块）
// v1: 5行×2列 二级菜单，通过界面控件（上下左右空格）导航
//
// 挂载：元件7 实体（事件由角色实体的 Menu_按键转发 转发至此，无需守卫）
// 渲染目标：stage 上 4 个 str_list 变量（_menu_fld1~4）
//
// ===== 接入指南 =====
// 1. 改底部「菜单内容定义」区的文字
// 2. 改「渲染配置」区的目标实体和变量名前缀
// 3. 改 col1Text()/subText() 的文字映射
// 4. 消费者监听 ball._menuConfirm 变化 → 读 _menuResult* 数据 → 分派
// 5. 分配新节点图 ID
//
// ===== 输出变量（写在 self=元件7 上，由桥接图 menu_bridge.ts 监听并转发到球）=====
// _menuConfirm (int) — 每次确认递增
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
const SUB_0: string[] = ['单步完整', '恢复运行', '慢速切换', '', '']
const SUB_1: string[] = ['强制静止', '强制滚动', '强制滑动', '强制空中', '强制锁定']
const SUB_2: string[] = ['打印诊断', '守卫评估', '', '', '']
const SUB_3: string[] = ['重置足球', '单步转移', '单步物理', '', '']

// ============================================================
// gstsServer 查表函数（加前缀后编译器可正确生成跨函数调用节点）
// 约束：单一 return 表达式，参数为普通标识符（不能是对象/解构）
// ============================================================

function gstsServerSubmenuContent(mainIdx: bigint): string[] {
  return mainIdx === 0n ? SUB_0
    : mainIdx === 1n ? SUB_1
    : mainIdx === 2n ? SUB_2
    : mainIdx === 3n ? SUB_3
    : ['', '', '', '', '']
}

function gstsServerSubmenuMaxRow(mainIdx: bigint): bigint {
  return mainIdx === 0n ? SUB0_MAX_ROW
    : mainIdx === 1n ? SUB1_MAX_ROW
    : mainIdx === 2n ? SUB2_MAX_ROW
    : mainIdx === 3n ? SUB3_MAX_ROW
    : 0n
}

function gstsServerCol1Text(mainIdx: bigint): string {
  return mainIdx === 0n ? '运行控制'
    : mainIdx === 1n ? '状态跳转'
    : mainIdx === 2n ? '信息诊断'
    : mainIdx === 3n ? '其他操作'
    : ''
}

function gstsServerSubText(mainIdx: bigint, row: bigint): string {
  return mainIdx === 0n
    ? (row === 0n ? '单步完整' : row === 1n ? '恢复运行' : row === 2n ? '慢速切换' : '')
    : mainIdx === 1n
    ? (row === 0n ? '强制静止' : row === 1n ? '强制滚动' : row === 2n ? '强制滑动' : row === 3n ? '强制空中' : row === 4n ? '强制锁定' : '')
    : mainIdx === 2n
    ? (row === 0n ? '打印诊断' : row === 1n ? '守卫评估' : '')
    : mainIdx === 3n
    ? (row === 0n ? '重置足球' : row === 1n ? '单步转移' : row === 2n ? '单步物理' : '')
    : ''
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
    f.设置自定义变量(self, '_menuConfirm', 0n)
    f.设置自定义变量(self, '_menuFlash', 0n) // 确认闪烁标记（0=正常 1=显示圆点）

    f.启动定时器(self, 'menuInitDelay', false, [0.5])
  })
  .on('定时器触发时', (evt, f) => {
    // 确认闪烁重置
    if (bool(evt.timerName == 'menuFlashReset')) {
      f.设置自定义变量(self, '_menuFlash', 0n)
      return
    }
    if (bool(evt.timerName != 'menuInitDelay')) return

    f.设置自定义变量(stage, '_menu_fld1', list('str', ['*', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))
    f.设置自定义变量(stage, '_menu_fld3', list('str', [' ', ' ', ' ', ' ', ' ']))
    f.设置自定义变量(stage, '_menu_fld4', list('str', SUB_0))
  })
  .on('界面控件组触发时', (evt, f) => {
    // 事件已由 Menu_按键转发 (ID 1073742448) 过滤后转发至此，无需守卫
    const btnId = evt.uiControlGroupIndex
    const row = f.获取自定义变量(self, '_menuRow').asType('int')
    const col = f.获取自定义变量(self, '_menuCol').asType('int')
    const mainIdx = f.获取自定义变量(self, '_menuMainIdx').asType('int')
    const confirm = f.获取自定义变量(self, '_menuConfirm').asType('int')
    const flash = f.获取自定义变量(self, '_menuFlash').asType('int')
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

    const maxRow = bool(col === 0n) ? MAIN_MAX_ROW : gstsServerSubmenuMaxRow(mainIdx)

    switch (btnId) {
      case 1073742339n: // 上（循环）
        newRow = bool(row > 0n) ? (row - 1n) : maxRow
        if (col === 0n) newMainIdx = newRow
        break
      case 1073742340n: // 下（循环）
        newRow = bool(row < maxRow) ? (row + 1n) : 0n
        if (col === 0n) newMainIdx = newRow
        break
      case 1073742341n: // 左：返回上级，保存子光标
        switch (mainIdx) {
          case 0n: newSub0 = row; break
          case 1n: newSub1 = row; break
          case 2n: newSub2 = row; break
          case 3n: newSub3 = row; break
        }
        newCol = 0n
        newRow = mainIdx
        break
      case 1073742342n: // 右：进入子菜单，恢复子光标
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
      case 1073742343n: // 空格 → 确认选中（结果写在 self=元件7，桥接图监听后转发到球）
        if (col === 1n) {
          newConfirm = confirm + 1n
          f.设置自定义变量(self, '_menuConfirm', newConfirm, true)
          f.设置自定义变量(self, '_menuResult', mainIdx * 10n + row, true)
          f.设置自定义变量(self, '_menuResultMain', gstsServerCol1Text(mainIdx), true)
          f.设置自定义变量(self, '_menuResultSub', gstsServerSubText(mainIdx, row), true)
          // 闪烁标记：选中的 * 短暂变为 •
          f.设置自定义变量(self, '_menuFlash', 1n)
          f.启动定时器(self, 'menuFlashReset', false, [0.2])
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
    // 选中标记：正常=*，按空格后短暂显示•（200ms 后 _menuFlash 复位）
    const marker = bool(flash > 0n) ? '•' : '*'

    const c1r0 = bool(bool(newRow === 0n) && bool(newCol === 0n)) ? marker : ' '
    const c1r1 = bool(bool(newRow === 1n) && bool(newCol === 0n)) ? marker : ' '
    const c1r2 = bool(bool(newRow === 2n) && bool(newCol === 0n)) ? marker : ' '
    const c1r3 = bool(bool(newRow === 3n) && bool(newCol === 0n)) ? marker : ' '
    const c1r4 = bool(bool(newRow === 4n) && bool(newCol === 0n)) ? marker : ' '
    f.设置自定义变量(stage, '_menu_fld1', list('str', [c1r0, c1r1, c1r2, c1r3, c1r4]))
    f.设置自定义变量(stage, '_menu_fld2', list('str', COL1))

    const c2r0 = bool(bool(newRow === 0n) && bool(newCol === 1n)) ? marker : ' '
    const c2r1 = bool(bool(newRow === 1n) && bool(newCol === 1n)) ? marker : ' '
    const c2r2 = bool(bool(newRow === 2n) && bool(newCol === 1n)) ? marker : ' '
    const c2r3 = bool(bool(newRow === 3n) && bool(newCol === 1n)) ? marker : ' '
    const c2r4 = bool(bool(newRow === 4n) && bool(newCol === 1n)) ? marker : ' '
    f.设置自定义变量(stage, '_menu_fld3', list('str', [c2r0, c2r1, c2r2, c2r3, c2r4]))
    // 字段4：第二列内容（内联 submenuContent — gstsServer 返回 str_list 不支持）
    let f4r0 = ''; let f4r1 = ''; let f4r2 = ''; let f4r3 = ''; let f4r4 = ''
    switch (newMainIdx) {
      case 0n: f4r0 = '单步完整';    f4r1 = '恢复运行'; f4r2 = '慢速切换'; f4r3 = '';     f4r4 = '';     break
      case 1n: f4r0 = '强制静止';    f4r1 = '强制滚动'; f4r2 = '强制滑动'; f4r3 = '强制空中'; f4r4 = '强制锁定'; break
      case 2n: f4r0 = '打印诊断';    f4r1 = '守卫评估'; f4r2 = '';         f4r3 = '';     f4r4 = '';     break
      case 3n: f4r0 = '重置足球';    f4r1 = '单步转移'; f4r2 = '单步物理'; f4r3 = '';     f4r4 = '';     break
    }
    f.设置自定义变量(stage, '_menu_fld4', list('str', [f4r0, f4r1, f4r2, f4r3, f4r4]))
  })
