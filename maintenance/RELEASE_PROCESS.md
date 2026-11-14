# 发版流程（笃行猫谱 · 双平台 Release）

> 版本号规则：`v主.次.修订`，存档点命名统一为「`vX.Y.Z` 存档点」。
> 双平台：GitHub（主）`sysucats/zhongdamaopu` + Gitee（镜像）`sysucats/zhongdamaopu`。

## 0. 前置检查

```bash
git status -sb          # 工作区干净，本地与 origin/master 同步
git log --oneline -5    # 确认 HEAD 就是发版提交
```

## 1. 整理更新内容

```bash
git log <上一tag>..HEAD --oneline --no-merges | grep -viE "bump|dependabot"   # 人工可读的变更
git diff <上一tag>..HEAD --stat | tail -3                                      # 变更规模
```

说明分两节：**功能更新** / **问题修复**。纯 docs / style / chore 不单独列；依赖批量升级合并为一条。

## 2. Release 说明格式（模板）

```markdown
**功能更新**
* <功能>（[PR#N](https://github.com/sysucats/zhongdamaopu/pull/N)）

**问题修复**
* <修复>（[PR#N](...)）

【更新注意（从vX.Y.Z及以前版本更新）】
<历史累积的注意事项，按版本从新到旧排列，只增不删（废弃段落经确认后可删，如 1.13.x 分包迁移段）>

【注意（从B站视频过来）】
<固定段落：B站视频观众需迁移到 EMAS>
```

注意：说明先发给维护者确认，再发布。

## 3. GitHub 发布

```bash
gh release create vX.Y.Z --repo sysucats/zhongdamaopu \
  --target <commit-sha> \
  --title "vX.Y.Z 存档点" \
  --notes-file <说明文件>
```

发布后确认 `gh release list` 中该版本为 Latest。

## 4. Gitee 发布

### 4a. 同步代码

Gitee 的「强制同步」按钮**没有公开 API**，两个等价途径：

- 网页：仓库页 → 管理 → 强制同步（同步分支 + tag）
- 命令行：把 Gitee 加为 remote 直接推（HTTPS 凭据可用 token）

```bash
git remote add gitee https://gitee.com/sysucats/zhongdamaopu.git
git push gitee master --tags
```

### 4b. 创建 Release（API v5）

令牌存于项目根 `private.gitee.key`（已被 `.gitignore` 的 `private.*.key` 覆盖，不会入库）。

```python
import json, urllib.request, pathlib
token = pathlib.Path("private.gitee.key").read_text(encoding="utf-8").strip()
payload = {
    "access_token": token,
    "tag_name": "vX.Y.Z",
    "name": "vX.Y.Z 存档点",
    "body": "<同 GitHub 的说明正文>",
    "prerelease": False,
    "target_commitish": "master",
}
req = urllib.request.Request(
    "https://gitee.com/api/v5/repos/sysucats/zhongdamaopu/releases",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req)
```

发布后用 `GET /repos/{owner}/{repo}/releases/latest` 验证。

## 5. 踩坑记录

- Windows 下 git-bash 的 `/tmp` 对原生 Python 不可见，临时文件一律用 Windows 绝对路径。
- Gitee release 创建成功时响应里 `html_url` 可能为 null，以 latest 接口验证为准。
- 令牌泄露风险：token 只放 `private.gitee.key`，不要写进任何脚本或文档正文；如误发到聊天/日志，用完即去 Gitee 撤销。

## 相关文档

- [PR_REVIEW_CHECKLIST.md](./PR_REVIEW_CHECKLIST.md) — PR 审查清单
- [TODO.md](./TODO.md) — 开发待办问题清单
