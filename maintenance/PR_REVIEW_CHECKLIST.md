# PR Review Checklist（笃行猫谱）

> 适用于每个 PR。方法：先 `gh pr checkout <N>`，以下所有 git 命令基于 `master...HEAD`。

## 1. 颜色 / 常量是否分散

**原则**：颜色、间距、圆角、阴影只在 `miniprogram/app.wxss` 的 `page` 变量区定义；页面/组件 wxss 一律 `var(--xxx)` 引用。

```bash
# 1.1 app.wxss 改动内容（看是否只加变量、是否改了既有变量的值）
git diff master...HEAD -- miniprogram/app.wxss

# 1.2 各 wxss 文件新增的硬编码 hex 颜色数量（排除 app.wxss 本身）
for f in $(git diff master...HEAD --name-only -- '*.wxss' | grep -v 'app.wxss'); do \
  n=$(git diff master...HEAD -- "$f" | grep -E '^\+' | grep -oE '#[0-9a-fA-F]{3,8}\b' | wc -l); \
  [ "$n" -gt 0 ] && echo "$n $f"; done | sort -rn

# 1.3 看具体写死了哪些值（替换成上一步的文件名）
git diff master...HEAD -- <file> | grep -E '^\+.*#[0-9a-fA-F]{3,8}'
```

**判定标准**：
- [ ] app.wxss 未修改既有变量的值（改值 = 全局视觉变更，必须单独说明理由，如 `--color-red` 换色）
- [ ] 页面 wxss 新增硬编码 hex ≤ 少量兜底值，且写法为 `var(--token, #fallback)`；裸 hex 视为分散常量
- [ ] 不允许在组件里定义"看起来是主题色"的局部变量（如 `--mainNode: #ffb347` 却注释 `/* var(--color-primary) */`），主题相关一律引用全局 token
- [ ] 新颜色如果多个页面要用，必须先在 app.wxss 建新 token（含注释说明用途），而不是各自写死
- [ ] 间距/圆角/阴影优先用 `--space-*` / `--radius-*` / `--shadow-*`

## 2. config / 配置兼容性

```bash
# 2.1 找出本 PR 改了哪些配置类文件
git diff master...HEAD --stat | grep -iE 'config|settings|app\.js'

# 2.2 config.js 是否被改动
git diff master...HEAD -- '**/config.js' '**/pageSettings/*.js' '**/deployConfig.js'
```

**判定标准**：
- [ ] `miniprogram/config.js` 无破坏性修订（删 key、改 key 名、改默认值语义、改返回结构 = 破坏；新增 key = 兼容）
- [ ] pageSettings / jsData 只增字段不改字段名，旧版本客户端读到新字段应忽略不崩
- [ ] app.json：`tabBar`、`pages`、`subPackages` 的路径改动 = 老客户端 breaking（见第 4 节）

## 3. 硬编码名称 / logo

```bash
# 3.1 产品名、校名等文字硬编码
git diff master...HEAD -- '*.js' '*.wxml' '*.json' | grep -E '^\+' | grep -E '笃行|猫谱|sysu|中大'

# 3.2 图片路径硬编码（重点关注 logo / avatar 兜底图是否写死）
git diff master...HEAD -- '*.js' '*.wxml' | grep -E '^\+' | grep -oE "['\"][^'\"]*\.(png|jpg|svg)['\"]" | sort -u

# 3.3 新增图片资源里有没有 logo 类文件
git diff master...HEAD --name-only | grep -iE 'logo|icon' 
```

**判定标准**：
- [ ] 产品名/校名等文案不新增硬编码，已有出现需确认是否必须
- [ ] logo / 兜底头像等路径应集中管理（config 或常量文件），不在页面里散落写死
- [ ] 徽章/成就等运营内容名称由服务端下发，前端不内置文案
- [ ] 新增静态资源确认无版权/来源问题

## 4. 路由 / 页面增删（老版本兼容）

```bash
# 4.1 对比 app.json 页面清单变化
git diff master...HEAD -- miniprogram/app.json

# 4.2 改名/删除的旧路径是否还有代码残留引用（替换 <oldPath>）
git grep -n "<oldPath>" -- 'miniprogram/**/*.js' 'miniprogram/**/*.wxml' 'miniprogram/**/*.json'
```

**判定标准**：
- [ ] 无页面路径改名或删除；若有，必须评估：历史分享卡片、收藏、公众号菜单、订阅消息、二维码中携带的旧路径在发布后是否失效
- [ ] tabBar 页面路径不可变更（直接导致老版本入口失效）
- [ ] 代码内无对已删除路径的残留引用
- [ ] `window` 全局配色改动（navigationBarBackgroundColor / backgroundColor）需说明，避免全局视觉意外

## 5. 组件复用（不重复造轮子）

```bash
# 5.1 本 PR 新增了哪些组件
git diff master...HEAD --name-only --diff-filter=A -- 'miniprogram/components/**'

# 5.2 现有组件清单（对照看是否有同功能组件）
ls miniprogram/components
```

**判定标准**：
- [ ] 新写组件前已检查 `miniprogram/components/` 下是否有类似功能组件；有则复用或扩展，不并行造轮子
- [ ] 页面内新写的"局部组件化"片段（如自定义弹窗、卡片、选择器），如与现有组件功能重叠，应改为复用
- [ ] 对现有组件的扩展（加 props/slot）优先于新建组件；若确需新建，PR 中说明为何不复用

## 6. 数据集合与字段设计

```bash
# 6.1 本 PR 是否新增了数据集合引用（替换为实际 collection 名逐一判断）
git diff master...HEAD -- 'functionsEMAS/**' | grep -E '^\+' | grep -oE "collection\(['\"][^'\"]+['\"]\)" | sort -u

# 6.2 云函数侧新增写入的字段（判断哪些是"原始数据"、哪些是可计算字段）
git diff master...HEAD -- 'functionsEMAS/**' | grep -E '^\+' | grep -iE 'add|update|\$set'

# 6.3 小程序侧本地存储新增 key
git diff master...HEAD -- 'miniprogram/**' | grep -E '^\+' | grep -oE "(setStorageSync|getStorageSync)\(['\"][^'\"]+['\"]" | sort -u
```

**判定标准**：
- [ ] 新建数据集合 = 重决策。必须逐一检查：现有集合能否复用？所需数据能否由已有集合的字段计算得出？两者皆否才允许新建，且 PR 中说明理由
- [ ] 新增字段前先判断是否"原始数据"：能通过其他字段/集合计算得出的，一律不落库，读时计算或查询后聚合
- [ ] 新增字段对旧数据默认值为 `undefined/null` 时，读写两侧逻辑均不崩（云函数侧判断 + 前端侧兜底）
- [ ] 历史数据是否需要回填/迁移脚本？若需要，脚本在 PR 中或附单独 PR，不允许"只管新数据、旧数据静默丢弃"

## 7. 云函数改动

```bash
# 7.1 云函数改动范围与规模
git diff master...HEAD --stat -- 'functionsEMAS/**'

# 7.2 是否有循环内逐条 await 查询（N+1，数据量大时的性能隐患）
git diff master...HEAD -- 'functionsEMAS/**' | grep -nE '^\+.*(for|while).*' 
```

**判定标准**：
- [ ] 云函数改动有足够必要性：能在前端完成、或已有函数可扩展完成的，不新写/不改云函数
- [ ] 兼容线上旧版本前端：接口返回结构只增不改不删；旧版本客户端调新函数不报错（返回字段名、类型不变）
- [ ] 性能：无循环内逐条 `await db.collection(...)`（N+1 查询），批量操作用 `where + skip/limit` 分页或聚合；新增查询考虑数据量增长后的耗时与索引
- [ ] 新增/修改的 SECRET_KEY、环境依赖已在 settings 系统配置，未硬编码

## 8. NPM 依赖安装与构建

```bash
# 8.1 本 PR 是否改动了依赖清单
git diff master...HEAD -- package.json miniprogram/package.json package-lock.json

# 8.2 新增依赖后本地安装（小程序侧依赖装在 miniprogram/ 下，不是仓库根目录）
npm install                      # 根目录：工程/脚本类依赖
cd miniprogram && npm install    # 小程序侧：会被打包进 miniprogram_npm 的依赖

# 8.3 用 miniprogram-ci 构建 npm（对应开发者工具的"工具-构建npm"，产物在 miniprogram_npm/）
miniprogram-ci pack-npm --pp ./miniprogram

# 8.4 构建产物是否被误提交（miniprogram_npm/ 应在 .gitignore，除非团队约定提交）
git status --short | grep miniprogram_npm
```

**判定标准**：
- [ ] 新增依赖先确认必要性：标准库/已有依赖能做的不引新包；能 `require` 云函数侧已有实现的不重复装
- [ ] 依赖装对位置：仅小程序运行时用的装到 `miniprogram/package.json`，工程/脚本类装根目录，不混装
- [ ] `miniprogram-ci pack-npm` 构建成功、无报错；`miniprogram_npm/` 产物与 `miniprogram/package.json` 一致（改了依赖必须重新构建）
- [ ] 新增依赖不引入超包体积风险：确认依赖体积与 tree-shaking 情况，主包大小未逼近 2M 上限
- [ ] `package-lock.json` 同步提交，锁版本；不允许他人拉代码后 `npm install` 结果不一致
- [ ] 真机验证：引用新包的页面在真机预览可用（开发者工具的"构建npm"与 CI 构建产物需保持同源）

## 9. 编译校验：miniprogram-ci preview

**原则**：preview 走的是和「上传」同一条云端编译链路，WXML/WXSS/JS 语法错误、依赖缺失、包体积超限都会在这一步直接抛错。所以 review 时用它替代「打开开发者工具点预览」。

```bash
# 9.1 推荐：走仓库脚本（自动读 project.config.json 的 appid、产出 preview-qrcode.png）
node wb_code/preview.mjs                          # 默认首页
node wb_code/preview.mjs pages/catDetail/catDetail            # 指定页面
node wb_code/preview.mjs pages/catDetail/catDetail "id=123"   # 页面 + 启动参数

# 9.2 兜底：纯命令行（脚本不可用时）
miniprogram-ci preview \
  --pp . \
  --appid wx5bd705b2bc91c73b \
  --pkp ./private.wx5bd705b2bc91c73b.key \
  --uv 0.0.0 \
  --qrcode-format image \
  --qrcode-output-dest ./preview-qrcode.png

# 9.3 需要和开发者工具编译设置完全一致时加 --use-project-config
miniprogram-ci preview --pp . --appid <appid> --pkp ./private.<appid>.key --uv 0.0.0 \
  --use-project-config --qrcode-format image --qrcode-output-dest ./preview-qrcode.png
```

Node API 关键参数（脚本里就是传这些）：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `project` | 是 | ci.Project 实例（appid / projectPath / privateKeyPath / ignores） |
| `qrcodeOutputDest` | 是 | 二维码落地路径，配合 `qrcodeFormat: 'image'` 生成 png |
| `qrcodeFormat` | 否 | `image` / `base64` / `terminal`（默认 terminal，仅供调试） |
| `desc` | 否 | 显示在「小程序助手」开发版列表里的备注 |
| `setting` | 否 | 编译设置（es6/es7/minify/autoPrefixWXSS 等） |
| `robot` | 否 | 使用哪个 ci 机器人，1~30 |
| `pagePath` | 否 | 预览指定页面路径 |
| `searchQuery` | 否 | 页面启动参数 |
| `scene` | 否 | 场景值，默认 1011 |
| `onProgressUpdate` | 否 | 进度回调 |

**判定标准**：
- [ ] `preview` 编译通过、无报错（报错 = 直接阻塞合并，不看代码质量了）
- [ ] 生成 `preview-qrcode.png` 并扫码进真机：目标页面无白屏、无样式错乱、无接口报错
- [ ] PR 新增/改动页面的，必须用 `pagePath`（必要时带 `searchQuery`）直连该页预览，不能只靠手点导航
- [ ] 私钥不入库：`private.*.key` 已在 `.gitignore`，CI 环境用 `MP_PRIVATE_KEY_PATH` 注入
- [ ] 改动依赖或 `app.json` 后必须重新 preview，确认包体积与分包加载正常
- [ ] `preview-qrcode.png` 属临时产物，不提交

## 10. 通用收尾

- [ ] 交叉核对：涉及数据计算/统计的改动，结果抽样验证
- [ ] 改配置文件前有备份习惯：合并前 `git tag` 或记录 commit hash
- [ ] wxs/云函数两侧字段名同步（EMAS 云函数侧对应改动的兼容性）
- [ ] PR 说明覆盖代码改动：逐条对照 diff 中的功能点，PR 描述未提及的功能改动必须补充说明（含动机、影响范围、验证方式）；"PR 说改了 A，代码还顺手动了 B"视为不合规
- [ ] 无新增无用文件：diff 中新增的每个文件都被引用（工具/测试/文档类需说明保留原因）；顺手删除已无引用的死代码文件，不留孤儿文件
