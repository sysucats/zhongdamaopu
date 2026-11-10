import { signCosUrl } from '../../utils/common';
import {
  activateUnlockPresenter,
  deactivateUnlockPresenter,
  dismissAchievementUnlocks,
} from '../../utils/achievementUnlock';

const COLORS = ['#e74e49', '#ffc043', '#55bfa1', '#6699ed', '#ae84da', '#f594b2'];

function makeConfetti() {
  return Array.from({ length: 40 }, (_, index) => {
    const left = index % 2 === 0;
    const dx = (left ? 1 : -1) * (15 + Math.random() * 70);
    const spin = Math.round(180 + Math.random() * 540);
    return {
      id: index,
      style: [
        `left:${left ? 0 : 100}%`,
        `--dx:${dx}vw`,
        `--peak:-${30 + Math.random() * 45}vh`,
        `--end-x:${dx + (Math.random() - 0.5) * 20}vw`,
        `--spin:${spin}deg`,
        `--spin-end:${spin * 2}deg`,
        `background:${COLORS[index % COLORS.length]}`,
        `width:${8 + Math.random() * 8}rpx`,
        `height:${10 + Math.random() * 12}rpx`,
        `border-radius:${index % 3 === 0 ? '50%' : '2rpx'}`,
        `animation-delay:${Math.round(Math.random() * 200)}ms`,
        `animation-duration:${2200 + Math.round(Math.random() * 800)}ms`,
      ].join(';'),
    };
  });
}

Component({
  data: {
    visible: false,
    unlocks: [],
    activeIndex: 0,
    confetti: [],
  },

  lifetimes: {
    attached() {
      this._renderVersion = 0;
      this.activate();
    },
    detached() {
      this.suspend();
    },
  },

  pageLifetimes: {
    show() { this.activate(); },
    hide() { this.suspend(); },
  },

  methods: {
    activate() {
      activateUnlockPresenter(this, unlocks => this.present(unlocks));
    },

    suspend() {
      deactivateUnlockPresenter(this);
      this._renderVersion = (this._renderVersion || 0) + 1;
      clearTimeout(this._confettiTimer);
      this.setData({ visible: false, confetti: [] });
    },

    present(unlocks) {
      const version = this._renderVersion = (this._renderVersion || 0) + 1;
      if (!unlocks.length) {
        clearTimeout(this._confettiTimer);
        this.setData({ visible: false, unlocks: [], activeIndex: 0, confetti: [] });
        return;
      }
      const opening = !this.data.visible;
      const previous = new Map(this.data.unlocks.map(item => [item.key, item]));
      this.setData({
        visible: true,
        unlocks: unlocks.map(item => ({ ...item, frontImage: previous.get(item.key)?.frontImage || '' })),
        activeIndex: Math.min(this.data.activeIndex, unlocks.length - 1),
        ...(opening ? { confetti: makeConfetti() } : {}),
      });
      if (opening) {
        clearTimeout(this._confettiTimer);
        this._confettiTimer = setTimeout(() => this.setData({ confetti: [] }), 3400);
      }
      // 图片签名不阻塞弹窗；失败时保留文字和占位图形。
      Promise.all(unlocks.map(async item => {
        try { return { ...item, frontImage: item.frontImage ? await signCosUrl(item.frontImage) : '' }; }
        catch (error) { return { ...item, frontImage: '' }; }
      })).then(items => {
        if (this._renderVersion === version && this.data.visible) this.setData({ unlocks: items });
      });
    },

    close() {
      dismissAchievementUnlocks(this);
    },

    onBadgeChange(e) {
      this.setData({ activeIndex: e.detail.current });
    },

    onPageTap(e) {
      this.setData({ activeIndex: Number(e.currentTarget.dataset.index) });
    },

    onImageError(e) {
      const index = this.data.unlocks.findIndex(item => item.key === e.currentTarget.dataset.key);
      if (index >= 0) this.setData({ [`unlocks[${index}].frontImage`]: '' });
    },

    noop() {},
  },
});
