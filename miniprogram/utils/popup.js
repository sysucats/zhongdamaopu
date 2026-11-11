// Every exit path asks before the controlled popup starts its closing animation.
export async function confirmDiscard(owner, initialValue, currentValue) {
  if (JSON.stringify(initialValue) === JSON.stringify(currentValue)) return true;
  if (owner._discardConfirmation) return owner._discardConfirmation;
  owner._discardConfirmation = new Promise(resolve => {
    wx.showModal({
      title: '放弃修改？',
      content: '未保存的修改将丢失。',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      success: result => resolve(!!result.confirm),
      fail: () => resolve(false),
    });
  });
  try {
    return await owner._discardConfirmation;
  } finally {
    owner._discardConfirmation = null;
  }
}
