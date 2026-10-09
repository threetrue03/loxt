const {AsyncLocalStorage}=require('node:async_hooks'),{performance}=require('node:perf_hooks');
const context=new AsyncLocalStorage();
function run(requestId,method,work){const trace={requestId,method,start:performance.now(),stages:{received:0}};return context.run(trace,async()=>{const value=await work();return {value,trace};});}
function mark(stage){const trace=context.getStore();if(trace)trace.stages[stage]=Math.round((performance.now()-trace.start)*10)/10;}
function current(){const trace=context.getStore();return trace?{requestId:trace.requestId,stages:{...trace.stages}}:{};}
module.exports={run,mark,current};
