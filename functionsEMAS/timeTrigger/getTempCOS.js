module.exports = async (ctx) => {
  return await ctx.mpserverless.function.invoke('unionOp', {
    unionAction: 'getTempCOS',
  });
};
