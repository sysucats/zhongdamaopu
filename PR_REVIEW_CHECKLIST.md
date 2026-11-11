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
- [ ] `utils/config.js` 无破坏性修订（删 key、改 key 名、改默认值语义、改返回结构 = 破坏；新增 key = 兼容）
- [ ] pageSettings / jsData 只增字段不改字段名，旧版本客户端读到新字段应忽略不崩
- [ ] deployConfig（云数据库 collection 映射）只增 collection，不删不改
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

## 5. 通用收尾

- [ ] 交叉核对：涉及数据计算/统计的改动，结果抽样验证
- [ ] 改配置文件前有备份习惯：合并前 `git tag` 或记录 commit hash
- [ ] wxs/云函数两侧字段名同步（EMAS 云函数侧对应改动的兼容性）
