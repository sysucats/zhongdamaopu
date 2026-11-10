Component({
  properties: {
    title: { type: String, value: '' },
    align: { type: String, value: 'center' },
    closePosition: { type: String, value: 'right' },
    confirm: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  methods: {
    close() {
      if (!this.data.busy) this.triggerEvent('close');
    },
    submit() {
      if (!this.data.disabled && !this.data.busy) this.triggerEvent('confirm');
    },
  },
});
