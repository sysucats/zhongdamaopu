const events = {};

export default {
  $on(eventName, callback) {
    if (!events[eventName]) events[eventName] = [];
    events[eventName].push(callback);
  },
  
  $emit(eventName, data) {
    const callbacks = events[eventName];
    callbacks && callbacks.forEach(cb => cb(data));
  },
  
  $off(eventName, callback) {
    const callbacks = events[eventName];
    if (callbacks) {
      events[eventName] = callbacks.filter(cb => cb !== callback);
    }
  }
};