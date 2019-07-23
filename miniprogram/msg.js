// 发送多条通知，需要先判断这些用户的设置有没有开
function sendNotice(notice_list) {
  const openids = Object.keys(notice_list);
  if(!openids.length) {
    return false;
  }
  const db = wx.cloud.database();
  const _ = db.command;
  // 获取需要发送的list
  db.collection('user').where({'openid': _.in(openids)}).get().then(res => {
    for(const user of res.data) {
      if (user.notice) {
        sendSingleNotice(user.openid, notice_list[user.openid]);
      }
    }
  });
}

// 发送一条通知
function sendSingleNotice(openid, content) {
  // 获取对应的notice formId
  // 这里假设获取到的都是有效的，因为每天晚上1点自动清除失效formId
  const db = wx.cloud.database();
  db.collection('formId').where({'_openid': openid}).limit(3).get().then(res => {
    const formId = res.data[0];
    if(!formId) {
      console.log('发送失败，没有可用的formId了，用户: ' + openid);
      return false;
    }
    // 可以发送了
    console.log('调用发送云函数,formId: ', formId);
    wx.cloud.callFunction({
      name:'sendMsg',
      data: {
        openid: openid,
        formId: formId.formId,
        content, content
      }
    });
    // 发送完删除一下用过的formId
    db.collection('formId').doc(formId._id).remove(res => {
      console.log('remove done. ', res);
    })
  });
}

export {
  sendNotice,
}