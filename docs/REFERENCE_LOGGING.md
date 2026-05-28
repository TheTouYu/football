# 信号日志系统

> **注意**：本文档从 `AGENT_SHARED_KNOWLEDGE.md` Section 9 提取，独立维护。

---

## 9.1 统一日志工具 `src/logger.ts`

所有日志统一通过 `src/logger.ts` 中的 `log()` 函数发送：

```typescript
// src/logger.ts
export function log(f: any, channel: string, items: any[]): void
```

**功能**：同一调用同时完成两件事：
1. `f.发送信号('日志操作', channel, assemblyList)` → 发给游戏中「日志操作」信号接收器
2. `print(str(channel))` + `f.列表迭代循环(assemblyList, 打印回调)` → 逐段打印到 GIA 控制台

**设计约束**：
- `items` 必须是数组字面量 `[...]`，编译器才能展开为 `gsts.f.assemblyList([...])`
- 内部通过 `f.列表迭代循环` 逐项 `print(str(...))`，不受 GIA 不支持列表→str 转换的限制

## 9.2 标准用法

```typescript
// 标准模式：log(f, '通道', ['内容1', str(val1), '内容2', str(val2)])
log(f, '物理', ['地面碰撞 Vy=', str(ballVy), '→', str(bouncedVy)])

// 状态转移
log(f, '状态机', ['状态 ', str(currentState), '→', str(newState)])

// 锁定事件
log(f, '锁定', ['进入锁定 距离=', str(nearestPlayerDist)])
log(f, '锁定', ['LOCK初始踢球 V=7.5'])

// 球员扫描
log(f, '扫描', ['扫描 最近球员 距离=', str(scanDist)])

// 调试诊断（只在条件满足时触发）
if (bool(nearestPlayerDist < 5.0)) {
  log(f, '诊断', ['诊断 状态=', str(state), ' xz=', str(xzSpeed), ' 最近=', str(dist)])
}
```

## 9.3 改造对比（旧模式 → 新模式）

```
旧：f.发送信号('日志操作', '物理' as any, f.拼装列表([...]) as any)
新：log(f, '物理', [...])

差异：消除 '日志操作' 字面量、消除 2 处 as any、消除 f.拼装列表 包装、
     自动增加控制台 print 输出
```

## 9.4 底层 API（直接使用场景较少）

```typescript
// f.发送信号 — 低层 API，仅在 log() 不够用时直接使用
f.sendSignal(signalName: StrValue, ...args: value[]): void
f.发送信号(signalName: StrValue, ...args: value[]): void
```

- `signalName`：仅支持字面量字符串，须先在编辑器的信号管理器中注册
- `...args`：必须是 `value` 类型（`str`/`int`/`float`/`entity`/`vec3` 等 class 的实例）

## 9.5 类型陷阱：`str()` 返回 `string` 而非 `str value`

全局函数 `str(x)` 返回的是原生 JS `string` 类型（`server_globals.d.ts: str: (v: ...) => string`），而 `f.拼装列表` 接受 `StrValue[]`（`StrValue = str | string`），所以 `str(x)` 的返回值可以用在拼装列表中。

## 9.6 为什么用 `f.拼装列表` 而非字符串拼接

GIA 节点图中不支持 `+` 运算符做字符串拼接（`addition` 只支持数值类型）。`str("a") + str("b")` 会报错：

```
Error: Generic parameter not matched: str type × addition numeric overload
```

正确做法是将所有日志片段用数组字面量 `[...]` 传给 `log()`，内部自动 `f.拼装列表` 组装。

## 9.7 日志通道汇总

| 通道 | 触发点 | 所在文件 | 频率 |
|------|--------|---------|------|
| `'物理'` | 地面碰撞 | main2.ts / main3.ts | 碰撞发生时 |
| `'物理'` | 球员碰撞 | main3.ts / collision.ts | 碰撞发生时 |
| `'状态机'` | 球状态转移 | main2.ts / main3.ts | 状态变化时 |
| `'状态机'` | 球员状态变化 | main3.ts | 状态变化时 |
| `'锁定'` | 进入 LOCK | main2.ts / main3.ts | 进入时 |
| `'锁定'` | 退出 LOCK | main2.ts / main3.ts | 退出时 |
| `'锁定'` | LOCK 初帧踢球 | ball_physics.ts | 踢球时 |
| `'扫描'` | 扫描到最近球员 | main2.ts | 每次扫描（1s） |
| `'诊断'` | 球员在 5m 内时的关键值 | main2.ts | 条件满足时每 tick（节流 ~2.4s） |
| `'守卫'` | 7 个守卫 true/false 评估 | main2.ts | _debugGuardEval 触发时 |

状态编号映射：`0=静止` `1=滚动` `2=滑动` `3=空中` `4=锁定`
