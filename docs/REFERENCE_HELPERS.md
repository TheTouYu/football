# 全局 Helper 与类型转换速查

> 来源：`docs/AGENT_SHARED_KNOWLEDGE.md` 第 1.4 节与第 1.5 节

---

## 1.4 全局 Helper 与类型转换速查

### 类型转换 / 构造

| 函数 | 说明 |
|------|------|
| `bool(x)` | 转为布尔类型。条件判断必须用 `bool(...)` 包裹 |
| `int(x)` | 转为整数类型（bigint） |
| `float(x)` | 转为浮点类型（number） |
| `str(x)` | 转为字符串类型。`str()` 返回的是原生 JS `string`，可用于 `拼装列表` |
| `idx(x)` | 帮助 `bigint` / `IntValue` 索引通过 TS 类型检查。**仅类型检查用**，节点图 int 语义不变。用法：`arr[idx(i)]` |
| `vec3(x)` | 创建三维向量。**仅接受字面量**，不接受运行时 float 变量。从 float 变量构建 vec3 必须用 `f.创建三维向量(x, y, z)` |
| `guid(x)` | 创建 GUID 值 |
| `prefabId(x)` | 元件预制体 ID。如 `prefabId(1077936262)` |
| `configId(x)` | 配置 ID |
| `faction(x)` | 阵营值 |
| `entity(x)` | 实体值。导入：`import { entity } from 'genshin-ts-touyu/runtime/value'` |

### 列表 / 字典构造

| 函数 | 说明 |
|------|------|
| `list('int', items)` | 显式列表类型声明，**空数组必须用**此函数指定元素类型。例：`list('int', [])`、`list('entity', [self])` |
| `dict(...)` | 创建**只读**字典。需可变字典时用节点图变量（`f.get` / `f.set`） |

### 编译器控制

| 函数 | 说明 |
|------|------|
| `raw(...)` | 编译器忽略此代码块，按 JS 原生语义执行。用于绕过编译器限制（如 `Object.*` / `JSON.*` 操作） |

### 实体与场景

| 标识符 | 说明 |
|--------|------|
| `self` | 当前节点图所挂载的实体。足球图 = 足球实体，角色图 = 角色实体 |
| `player(n)` | 玩家实体（从 `1` 开始编号） |
| `stage` / `level` | 关卡实体别名 |
| `GameObject.Find(...)` | 按名称查找实体（Unity 风格） |
| `FindWithTag(...)` | 按标签查找实体（Unity 风格） |
| `FindByPrefabId(...)` | 按元件 ID 查找实体（Unity 风格） |

### 数学与向量（全局可用）

| API | 说明 |
|-----|------|
| `Math.*` | 标准数学函数。在 server 作用域内**编译为节点图等效操作** |
| `Mathf.*` | Unity 风格数学 API（`Mathf.Abs`、`Mathf.Clamp` 等） |
| `Vector3.*` | Unity 风格三维向量 API（`Vector3.Distance`、`Vector3.Dot` 等） |
| `Random.*` | Unity 风格随机数 API（`Random.Range` 等） |

> **关键区别**：`Math.*` 在 server scope 内自动编译为 GIA 节点；`vec3()` 是全局值构造函数（仅接受字面量）；`f.创建三维向量(x,y,z)` 是节点图 API（接受运行时变量）。三者不可混用。

---

## 1.5 类型映射与常见编译错误

### 类型映射

| TS 类型 | 节点图类型 | 说明 |
|---------|-----------|------|
| `number` | float | 浮点数 |
| `bigint` | int | 整数，推荐用 `123n` 后缀 |
| `string` | str | 字符串 |

列表/字典元素必须同类型。

### 全局辅助函数（补充 1.4）

| 函数 | 说明 |
|------|------|
| `raw(expr)` | 保留 JS 语义，编译器不做节点图转换。用于绕过编译器限制 |
| `int(123)` | 显式声明整数字面量，但推荐使用 `123n` |
| `idx(x)` | 帮助 bigint/IntValue 索引通过 TS 类型检查。**仅类型检查用**，不改变节点图语义。可直接用 ESLint 自动修复 |
| `vec3([x, y, z])` | 构造 vec3 字面量。多数情况直接 `[x,y,z]` 可自动推断，`vec3()` 主要用于列表场景消除歧义 |

### 常见编译错误速查

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `invalid value type` | 传入了不支持的值类型（如 entity 直接给 getEntityLocationAndRotation） | 检查值类型，entity 需通过 `getCorrespondingValueFromList` 获取 |
| `Generic parameter not matched` | 泛型参数不匹配（如 `+` 用于 str 拼接） | 字符串不用 `+`，用 `list('str', [...])` 拼装列表 |
| `switch case expression must be an integer literal` | switch 的 case 必须用整数**字面量**（不能用变量） | 用 `case 123n:` 而非 `case MY_CONST:` |
| `switch fallthrough with body is not supported` | case 块最后必须显式 break/return/continue | 加 `break` |
| `setTimeout/setInterval callback must be a function` | setTimeout 参数不是顶层函数 | 改用 `f.启动定时器` 替代 setTimeout |

### TS 插件提示

若 VSCode 中仍见 `TS2538` 错误（bigint 不可索引），配置：
```json
"typescript.tsdk": "node_modules/typescript/lib",
"typescript.enablePromptUseWorkspaceTsdk": true
```
若提示为"警告"而非"错误"，表示项目 TS 插件已生效，可按需禁用 `gsts/bigint-index-in-server` 规则。
