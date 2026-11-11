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
    swiping: false,
    confetti: [],
  },

  lifetimes: {
    attached() {
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
      this._switchVersion = (this._switchVersion || 0) + 1;
      this._switching = false;
      this._swipeStart = null;
      clearTimeout(this._confettiTimer);
      this.setData({ visible: false, swiping: false, confetti: [] });
    },

    present(unlocks) {
      if (!unlocks.length) {
        this._switchVersion = (this._switchVersion || 0) + 1;
        this._switching = false;
        this._swipeStart = null;
        clearTimeout(this._confettiTimer);
        this.setData({ visible: false, unlocks: [], activeIndex: 0, swiping: false, confetti: [] });
        return;
      }
      const opening = !this.data.visible;
      this.setData({
        visible: true,
        unlocks,
        activeIndex: Math.min(this.data.activeIndex, unlocks.length - 1),
        ...(opening ? { swiping: false, confetti: makeConfetti() } : {}),
      });
      if (opening) {
        this._switchVersion = (this._switchVersion || 0) + 1;
        this._switching = false;
        clearTimeout(this._confettiTimer);
        this._confettiTimer = setTimeout(() => this.setData({ confetti: [] }), 3400);
      }
    },

    close() {
      dismissAchievementUnlocks(this);
    },

    onBadgeChange(e) {
      this.setData({ activeIndex: e.detail.current });
    },

    onBadgeTransition(e) {
      if (Math.abs(e.detail.dx) > .5 && !this.data.swiping) this.setData({ swiping: true });
    },

    onBadgeSettled(e) {
      this._switching = false;
      this.setData({ activeIndex: e.detail.current, swiping: false });
    },

    async switchBadge(index) {
      if (this._switching || index < 0 || index >= this.data.unlocks.length || index === this.data.activeIndex) return;
      this._switching = true;
      const version = this._switchVersion;
      const viewer = this.selectComponent(`#unlock-badge-${this.data.activeIndex}`);
      await viewer?.resetToFront();
      if (!this.data.visible || version !== this._switchVersion) return;
      this.setData({ activeIndex: index, swiping: true });
    },

    onSwipeStart(e) { this._swipeStart = e.touches[0]; this._swipeLast = null; },
    onSwipeMove(e) { this._swipeLast = e.touches[0]; },
    onSwipeCancel() { this._swipeStart = null; },
    onSwipeEnd(e) {
      const start = this._swipeStart;
      this._swipeStart = null;
      if (!start) return;
      const end = e.changedTouches[0] || this._swipeLast;
      if (!end) return;
      const dx = end.clientX - start.clientX, dy = end.clientY - start.clientY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) this.switchBadge(this.data.activeIndex + (dx < 0 ? 1 : -1));
    },

    onPageTap(e) { return this.switchBadge(Number(e.currentTarget.dataset.index)); },
  },
});
