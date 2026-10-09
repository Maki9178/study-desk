'use strict';
const assert = require('node:assert/strict');
const {createServer} = require('../server.cjs');
let port;
const http = require('node:http');
const request = (url, options={}) => new Promise((resolve, reject) => {
  const req = http.request(`http://127.0.0.1:${port}`+url, options, res => {
    let body=''; res.setEncoding('utf8'); res.on('data', s=>body+=s);
    res.on('end', ()=>resolve({status:res.statusCode,headers:res.headers,body}));
  });req.on('error',reject);req.end();
});
(async()=>{
  const server=createServer();
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    port=server.address().port;
    const home=await request('/');assert.equal(home.status,200);assert(home.body.includes('课桌'));
    assert.equal(home.headers['x-frame-options'],'DENY');assert(home.headers['content-security-policy'].includes("connect-src 'none'"));
    assert.equal(JSON.parse((await request('/health')).body).app,'study-desk');
    assert.equal((await request('/app.js')).status,200);assert.equal((await request('/radar.js')).status,200);assert.equal((await request('/core.js')).status,200);
    assert.equal((await request('/style.css',{method:'HEAD'})).body,'');
    for(const url of ['/README.md','/.git/config','/../README.md','/%2e%2e/README.md'])assert.equal((await request(url)).status,404);
    assert.equal((await request('/',{headers:{Host:'evil.example'}})).status,403);
    assert.equal((await request('/',{method:'POST'})).status,405);
    console.log('PASS: local HTTP, UTF-8, allowed assets, host checks, private-file rejection');
  } finally {await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
