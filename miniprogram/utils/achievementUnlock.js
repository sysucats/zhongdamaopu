// 解锁提示的会话队列。各页面仅挂载展示组件，发放仍由服务端负责。
const seen = new Set();
let pending = [];
let presenter = null;

function render() {
  if (!presenter) return;
  try {
    presenter.show(pending.slice());
  } catch (error) {
    console.warn('展示成就解锁提示失败', error);
  }
}

function queueAchievementUnlocks(defs = [], keys = []) {
  const definitions = new Map(defs.map(def => [def.key, def]));
  let changed = false;
  for (const key of keys) {
    const def = definitions.get(key);
    if (!def || seen.has(key)) continue;
    seen.add(key);
    pending.push({
      key,
      name: def.name,
      materialKey: def.materialKey || '',
      description: def.description || '',
      frontImage: def.frontImage || '',
    });
    changed = true;
  }
  if (changed) render();
}

function activateUnlockPresenter(owner, show) {
  if (presenter && presenter.owner !== owner) {
    try { presenter.show([]); } catch (error) { /* 旧页面已销毁时继续交接。 */ }
  }
  presenter = { owner, show };
  render();
}

function deactivateUnlockPresenter(owner) {
  if (presenter?.owner === owner) presenter = null;
}

function dismissAchievementUnlocks(owner) {
  if (presenter?.owner !== owner) return;
  pending = [];
  render();
}

module.exports = {
  queueAchievementUnlocks,
  activateUnlockPresenter,
  deactivateUnlockPresenter,
  dismissAchievementUnlocks,
};
