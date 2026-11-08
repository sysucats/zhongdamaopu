// 一次 invoke 的时间预算。约束链：云端总预算 < 客户端 invoke 超时(55s) < EMAS 硬上限(60s)。
// 之前把 BATCH_TIMEOUT_MS 设成 55s、客户端也等 55s，云端必然比客户端晚收工，
// 于是"最后一批"几乎每次都表现为客户端超时（云端其实还在写），这是超时的主要来源。
module.exports = Object.freeze({
  // 从进入 handler 起算的总预算，留 10s 给客户端网络往返 + 收尾
  BATCH_TIMEOUT_MS: 45000,
  // 返回前必须留下的时间：状态统计、写同步记录、上报错误
  RESPONSE_RESERVE_MS: 4000,
  // 单个工作单元的预估耗时，用于判断"还有没有时间再做一个"
  CAT_COST_MS: 3000,
  PHOTO_COST_MS: 9000,
  TASK_COST_MS: 150,
  // 单次上游请求上限：不能再让一个卡住的请求吃掉整批预算
  REQUEST_TIMEOUT_MS: 20000,
  // 识猫推理单次要等模型跑完，保留原有节奏（仍受总预算约束）
  SEARCH_TIMEOUT_MS: 40000,
  READ_TIMEOUT_MS: 15000,
  DOWNLOAD_TIMEOUT_MS: 12000,
  // 必须明显大于 BATCH_TIMEOUT_MS，保证正在跑的批次不会自己掉锁
  LEASE_TIMEOUT_MS: 70000,
});
