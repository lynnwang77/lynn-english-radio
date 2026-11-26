# Issue #8 私人同步独立测试版

本分支默认没有连接项目。正式 GitHub Pages 不部署此分支，测试只用虚构资料。

## 测试项目

1. 在 Firebase Console 建立独立 Spark 项目，保持未绑定账单。登记 Web App，启用 Authentication 的 Email/Password，创建 Firestore Standard 默认数据库。不要在生产项目操作。
2. 用本仓库 `firestore.rules` 部署到**测试项目**，并配置测试域名。由项目所有者创建测试账户，使用测试邮箱验证后，在 iPhone Safari 与桌面 Chrome 使用同一账户。另用第二个邮箱验证隔离。不要共享密码、管理员密钥或真实备份。
3. 只在独立预览制品中，以 Firebase Console 的 Web App 配置填写 `window.LynnSyncConfig = {firebase: {...}}`。这是公开客户端配置。权限依靠已验证的 Firebase UID 规则，默认拒绝其他路径。用户会话或管理员凭据不得写入配置。

## 验收

- 两台设备各有不同虚构记录，另加同 ID 不同内容的合成备份。登录后先下载各自备份、看差异、再确认迁移。验证两端独有内容保留、冲突保留两个版本，复核后由用户选版本。
- 在一端新增、修改、归档、恢复、删除及回收一句，从另一端查看。分别确认收藏和取消收藏，导入课程并从 Inbox 转入 Library，以及复习记录与当天计划。
- 断网修改一端，再联网观察待同步变为服务器确认。用两个独立账户和未登录会话测试拒绝访问。
- 退出后学习仍在本机。出现问题时先退出同步并导出 Backup，再用原始的双端快照核对。现有 V2 JSON 格式保留。同步冲突版本保存在云端操作历史中，现有导出只含当前显示版本，处理冲突前保留迁移前的两份 JSON。

## 自动测试

- `node --test tests/*.test.cjs`
- 安装 Firebase CLI、`firebase`、`@firebase/rules-unit-testing` 和 Playwright 后，用 `firebase emulators:exec --only firestore,auth --project demo-lynn-sync 'node tests/firestore-rules.cjs && node tests/sync-emulator.cjs'` 运行规则测试。
- 在同一执行环境启动 `python3 -m http.server 8769 --bind 127.0.0.1`，将上一步的测试命令替换为 `node tests/sync-browser.cjs`，执行两套独立 Chromium 配置的模拟器测试。可通过 CHROMIUM_PATH 指定已有的 Chromium。

## 限制和费用

Spark 原型采用每项一条不可变的版本操作。每次本地变更约一次事务读取和一次新增写入，再由已连接的两端各读取新增操作。举例，每天 100 项变更、两端在线时，约 100 写入及 300 次读，另加首次订阅及重连的历史读取。假设积累 3,000 条操作，两端各做一次完整重连，额外约 6,000 读。实际流量需在 Firebase Usage 监测。原型无自动清理或历史压缩，长时间使用前要设计历史归档与增量拉取。Spark 不开启账单，超额时停止或延后云同步，保持本地记录和待同步队列。

同 ID 课程和复习条目的冲突通过选版本处理。原型保留版本，但不会自动复制课程并迁移关联进度。手机测试为 Chromium 视口模拟，iPhone Safari 真机的登录、持久性与后台挂起需要单独验收。网页关闭时没有后台同步。项目管理员可访问云端数据，不是端到端加密。测试阶段不提供用户自助删除整个云账户，正式发布前需完善清除缓存、导出冲突与云账户删除流程。
