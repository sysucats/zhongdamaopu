// components/newsModal/newsModal.js
Component({
    options: {
      multipleSlots: true // 在组件定义时的选项中启用多slot支持
    },
    /**
     * 组件的属性列表
     * 用于组件自定义设置
     */
    properties: {
      // 公告标题
      title: {
        type: String,     
        value: '公告标题'
      },
      // 公告正文
      content :{
        type : String ,
        value : '公告内容'
      },
      // 关闭按钮
      cancelText :{
        type : String ,
        value : '关闭'
      },
      // 确认按钮
      confirmText :{
        type : String ,
        value : '查看详情'
      },
      // 图片路径
      imagePath :{
        type : String ,
        value : ''
      },
      // 时间
      time :{
        type : String ,
        value : ''
      },
      // 分类
      newsClass :{
        type : String ,
        value : ''
      },
      // 用户名
      user :{
        type : String ,
        value : ''
      },
    },

  
    /**
     * 私有数据,组件的初始数据
     * 可用于模版渲染
     */
    data: {
      // 弹窗显示控制
      isShow: false
    },
  
    /**
     * 组件的方法列表
     * 更新属性和数据的方法与更新页面数据的方法类似
     */
    methods: {
      /*
       * 公有方法
       */
  
      //隐藏弹框
      hideNewsModal(){
        this.setData({
          isShow: false
        })
      },
      //展示弹框
      showNewsModal(){
        this.setData({
          isShow: true
        })
      },
       /*
       * 内部私有方法建议以下划线开头
       * triggerEvent 用于触发事件
       */
      _cancelEvent(){
        this.hideNewsModal();
        //触发取消回调
        this.triggerEvent("cancelEvent")
      },
      _confirmEvent(){
        this.hideNewsModal();
        //触发成功回调
        this.triggerEvent("confirmEvent");
      }
    }
  })