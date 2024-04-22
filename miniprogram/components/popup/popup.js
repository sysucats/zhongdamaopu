Component({
    properties: {
      show: {
        type: Boolean,
        value: false,
      }
    },
    data: {
      
    },
    methods: {
      hide() {
        this.setData({ show: false });
        this.triggerEvent('close');
      }
    }
  });