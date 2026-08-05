// 客户提交通道令牌配置（提交到独立收件箱仓库 AIesse/inbox）。
// - 留空时，页面会让使用者在浏览器内一次性输入令牌并存入 localStorage（适合测试 / 内部小范围使用）。
// - 正式对外开放前：在此填入一枚「仅限 inbox 仓库（Contents: read/write）」的经典 PAT，
//   这样令牌随站点下发、客户无需输入；即便泄露也碰不到管理数据仓库 AIesse/work。
// 生成方法：GitHub → Settings → Developer settings → Personal access tokens →
//   Tokens (classic) → Generate new token (classic) → 仅勾选下方指定仓库的 Contents 读写。
window.INBOX_TOKEN = ''
window.INBOX_REPO = { owner: 'AIesse', name: 'inbox', branch: 'main', file: 'inbox.json' }
