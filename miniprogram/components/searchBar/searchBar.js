// 公共搜索框：搜索图标 + 输入框 + 清除按钮 + 尾部插槽（如拍照识别）
// variant: glass 磨砂玻璃（浮在内容上）/ surface 白底描边（灰底页面上）/ fill 灰底（白色容器里）
Component({
  properties: {
    value: {
      type: String,
      value: '',
      observer(value) {
        if (value !== this.data.inputValue) this.setData({ inputValue: value || '' });
      },
    },
    placeholder: { type: String, value: '搜索' },
    focus: { type: Boolean, value: false },
    maxlength: { type: Number, value: 20 },
    // 键盘确认键：搜索后可能新建的场景用 done
    confirmType: { type: String, value: 'search' },
    variant: { type: String, value: 'surface' },
  },

  data: {
    inputValue: '',
  },

  methods: {
    onInput(e) {
      const value = e.detail.value;
      this.setData({ inputValue: value });
      this.triggerEvent('input', { value });
    },

    onConfirm(e) {
      this.triggerEvent('confirm', { value: e.detail.value });
    },

    // 清空后先抛 input 再抛 clear，页面在 clear 里决定是否重新搜索
    onClear() {
      this.setData({ inputValue: '' });
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
    },
  },
});
