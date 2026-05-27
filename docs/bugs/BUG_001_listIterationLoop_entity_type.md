# BUG-001: 列表迭代循环回调内 entity 类型无法用于 getEntityLocationAndRotation

> 发现日期：2026-05-27
> 状态：待修复
> 影响范围：`main2.ts` Graph 3（玩家扫描器）

## 症状

`f.列表迭代循环(players, callback)` 的回调函数内，从 `getAllCharacterEntitiesOfSpecifiedPlayer(playerEntity)` 返回的列表中取 `chars[0]`，将其传给 `getEntityLocationAndRotation(char)` 时 GIA 编译失败：

```
Error: 无效的值类型: entity
at parseValue (.../nodes.ts:402:9)
at ServerExecutionFlowFunctions.getEntityLocationAndRotation
at 扫描球员回调 (main2.gs.ts:243:31)
```

## 复现步骤

在 beyond 模式的 `g.server()` 中：

```typescript
function 扫描球员回调(playerEntity: any, _breakLoop: any): void {
  const chars = gsts.f.getAllCharacterEntitiesOfSpecifiedPlayer(playerEntity)
  const char = chars[0]
  const charLocRot = gsts.f.getEntityLocationAndRotation(char)  // ❌ 无效的值类型: entity
}

g.server({ id: ..., lang: 'zh' })
  .on('定时器触发时', (evt, f) => {
    f.列表迭代循环(players, 扫描球员回调)
  })
```

## 已尝试的修复（均失败）

| 尝试 | 结果 |
|------|------|
| `const char = chars[0]` | `无效的值类型: entity` |
| `let char = chars[0]` | 同上 |
| `f.获取实体位置与旋转(chars[0])`（无中间变量） | 同上 |
| `chars[0].asType("entity")` | `TypeError: Cannot read properties of undefined (reading 'asType')` — asType 在 list element 上不可用 |
| `gsts.f.getActiveCharacterOfSpecifiedPlayer(playerEntity)` | 可行，但需要 `mode: 'classic'`，与项目的 beyond 模式不兼容 |

## 根因分析

在 beyond 模式中：
1. **外部作用域**：`const p0 = p0Chars[0]` 会被编译器包装为 `gsts.f.initLocalVariable("entity")`，后续通过 `p0.value` 访问，entity 类型正常
2. **列表迭代循环 / gstsServer 回调内**：`const char = chars[0]` 编译为直接赋值（无 localVariable 包装），GIA 编译器无法将其解析为有效的 entity pin 传给 `getEntityLocationAndRotation`
3. `.asType("entity")` 方法仅在 `f.获取自定义变量()` 返回值上可用，list element 上不可用

## 当前绕过方案

使用 8 固定索引展开替代 `列表迭代循环`（`main3.ts` 中已验证可行）：

```typescript
// 展开 8 个固定索引（节点图不支持 for 循环）
const p0Chars = f.获取指定玩家所有角色实体(players[0])
const p0: any = p0Chars[0]
const p0Pos = f.获取实体位置与旋转(p0).location
// ... 重复 8 次
```

## 建议修复

GIA 编译器应支持 `列表迭代循环` 回调内的 list indexing 产生有效的 entity pin，或提供 `.asType("entity")` 在 list element 上的支持。
