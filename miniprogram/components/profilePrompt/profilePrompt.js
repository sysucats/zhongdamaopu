Component({
  properties: { context: { type: String, value: '' } },
  methods: { edit() { this.triggerEvent('edit'); } },
});
