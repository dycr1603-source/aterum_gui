'use strict';
const http = require('node:http');
function request(socketPath, action, payload = {}) {
  return new Promise((resolve,reject)=>{
    const req=http.request({socketPath,path:`/${action}`,method:'POST',timeout:12000,
      headers:{'content-type':'application/json'}},res=>{
      let body='';res.on('data',chunk=>{body+=chunk;if(body.length>4096)req.destroy()});
      res.on('end',()=>{try{const result=JSON.parse(body);if(!res.statusCode||res.statusCode>=300||!result.ok)
        return reject(new Error(result.error||'SHUTDOWN_SCHEDULER_UNAVAILABLE'));resolve(result)}
        catch(error){reject(error)}});
    });
    req.on('timeout',()=>req.destroy(new Error('SHUTDOWN_SCHEDULER_TIMEOUT')));
    req.on('error',()=>reject(new Error('SHUTDOWN_SCHEDULER_UNAVAILABLE')));
    req.end(JSON.stringify(payload));
  });
}
module.exports={request};
