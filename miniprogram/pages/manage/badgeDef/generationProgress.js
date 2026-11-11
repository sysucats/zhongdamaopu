const app = getApp();

// Poll only the current save; late responses from a previous save are ignored.
export function watchGeneration(page, key, generationId) {
  stopGenerationWatch(page);
  const watch = page._generationWatch = {};
  const poll = async () => {
    try {
      const { result } = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'manageAchievementCatalog', action: 'generationStatus', data: { key },
      });
      if (page._generationWatch !== watch) return;
      if (result?.ok && result.progress?.generationId === generationId) page.setData({ generation: result.progress });
    } catch (error) {
      if (page._generationWatch === watch) page.setData({ generation: { label: '暂时无法读取生成进度，保存仍在进行' } });
    }
    if (page._generationWatch === watch) watch.timer = setTimeout(poll, 1000);
  };
  watch.timer = setTimeout(poll, 500);
}

export function stopGenerationWatch(page) {
  clearTimeout(page._generationWatch?.timer);
  page._generationWatch = null;
}
