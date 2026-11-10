Component({
  properties: {
    front: {
      type: String,
      value: '',
      observer() {
        this.setData({ flipped: false });
      },
    },
    back: String,
    size: {
      type: Number,
      value: 240,
    },
  },
  data: {
    flipped: false,
  },
  methods: {
    flip() {
      this.setData({ flipped: !this.data.flipped });
    },
  },
});
