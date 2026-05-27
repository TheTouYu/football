// @gsts:entry
// signal_test.ts — 发送信号全类型测试
// 覆盖 sendSignal 的所有参数类型：str / int / float / bool / entity / vec3 / str_list / int_list
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { g } from 'genshin-ts-touyu/runtime/core'

g.server({
  id: 1073742444,
  name: 'SignalTest_全类型',
  lang: 'zh',
})
  .on('实体创建时', (_evt, f) => {

    // 先初始化各类型自定义变量
    f.设置自定义变量(self, 'vStr', 'hello', false)
    f.设置自定义变量(self, 'vInt', 42n, false)
    f.设置自定义变量(self, 'vFloat', 3.14, false)
    f.设置自定义变量(self, 'vBool', true, false)

    // 1. str conn — 从变量读取 + asType
    const strVal = f.获取自定义变量(self, 'vStr').asType('str')

    // 2. int conn — 从变量读取 + asType
    const intVal = f.获取自定义变量(self, 'vInt').asType('int')

    // 3. float conn — 从变量读取 + asType
    const floatVal = f.获取自定义变量(self, 'vFloat').asType('float')

    // 4. bool conn — 从变量读取 + asType
    const boolVal = f.获取自定义变量(self, 'vBool').asType('bool')

    // 5. entity — 自身实体
    const entityVal = self

    // 6. vec3 — 三维向量
    const vec3Val = f.创建三维向量(1, 2, 3)

    // 7. str_list — 字符串列表 (conn 参数)
    const strListVal = f.拼装列表(['a', 'b', 'c'])

    // 8. int_list — 整数列表 (conn 参数)
    const intListVal = f.拼装列表([1n, 2n, 3n])

    // 发送信号：包含所有类型
    f.发送信号(
      'test',
      strVal as any,
      intVal as any,
      floatVal as any,
      boolVal as any,
      entityVal as any,
      vec3Val as any,
      strListVal as any,
      intListVal as any
    )
  })
