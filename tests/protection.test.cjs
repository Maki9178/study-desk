'use strict';
// Runs real application event handlers against a minimal DOM and failure-capable storage.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const nodes=new Map(),storage=new Map(),events=new Map();
const node=id=>{
 if(!nodes.has(id))nodes.set(id,{value:id==='#statusFilter'?'open':'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,style:{},listeners:new Map(),classList:{add(){},remove(){},toggle(){}},addEventListener(name,callback){this.listeners.set(name,callback);},reset(){},showModal(){this.open=true;},close(){this.open=false;this.listeners.get('close')?.({});},click(){},elements:{namedItem(){return null;}}});return nodes.get(id);
};
const context=vm.createContext({
 crypto:webcrypto,StudyDeskCore:require('../core.js'),StudyDeskRadar:require('../radar.js'),structuredClone,TextEncoder,TextDecoder,btoa,atob,URL,Blob,
 document:{querySelector:node,querySelectorAll:selector=>selector==='dialog[open]'?[...nodes.values()].filter(n=>n.open):[],body:{classList:{add(){},remove(){}}},addEventListener(name,handler){events.set(name,handler);},createElement:()=>({click(){}})},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 window:{addEventListener(){}},navigator:{},setTimeout:()=>1,setInterval:()=>1,clearTimeout(){},confirm:()=>true,console
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8')+'\nglobalThis.getState=()=>({data,key,envelope,unlocked,storedVersion});globalThis.save=persist;globalThis.prepare=prepareBackup;',context);
const submit=id=>node(id).onsubmit({preventDefault(){}});
(async()=>{
 await node('#skipProtectionBtn').onclick();assert.equal(context.getState().envelope.format,'study-desk-plain');assert(context.getState().unlocked);
 vm.runInContext("data.sites.push({id:'s',name:'示例',url:'https://example.com/',password:'fixture-secret',account:'fixture-account'});data.tasks.push({id:'t',siteId:'s',title:'测试任务',status:'doing',due:'',est:20});",context);
 await context.save();
 await events.get('click')({target:{closest:()=>({dataset:{action:'toggle',id:'t'}})}});
 assert.equal(context.getState().data.tasks[0].status,'done');
 await events.get('click')({target:{closest:()=>({dataset:{action:'toggle',id:'t'}})}});
 assert.equal(context.getState().data.tasks[0].status,'open');
 vm.runInContext("data.tasks[0].status='doing';",context);await context.save();
 const plain=storage.get('study-desk.v1');assert(plain.includes('fixture-secret'));
 node('#protectionBtn').onclick();node('#protectionMode').value='encrypted';node('#newProtectionPassword').value='test-only-vault-pass';node('#newProtectionConfirm').value='test-only-vault-pass';await submit('#protectionForm');
 const encrypted=storage.get('study-desk.v1');assert(!encrypted.includes('fixture-secret'));assert.equal(context.getState().envelope.format,'study-desk-vault');assert.equal(context.getState().data.tasks[0].status,'doing');
 node('#protectionBtn').onclick();node('#protectionMode').value='plain';node('#currentProtectionPassword').value='wrong-pass';await submit('#protectionForm');assert.equal(storage.get('study-desk.v1'),encrypted);assert(context.getState().key);
 const originalSetter=context.localStorage.setItem;context.localStorage.setItem=()=>{throw Error('quota-full');};
 node('#currentProtectionPassword').value='test-only-vault-pass';await submit('#protectionForm');assert.equal(storage.get('study-desk.v1'),encrypted);assert(context.getState().key);assert(node('#protectionError').textContent.includes('quota-full'));
 context.localStorage.setItem=originalSetter;await submit('#protectionForm');assert.equal(context.getState().envelope.format,'study-desk-plain');assert.equal(context.getState().data.tasks[0].est,20);assert.equal(context.getState().key,null);
 const current=storage.get('study-desk.v1'),currentState=context.getState().data;
 const restoreHandler=node('#restoreForm').onsubmit;
 context.bad={format:'study-desk-plain',version:1,data:{schemaVersion:99,sites:[],tasks:[]}};
 vm.runInContext('pendingRestore=bad;',context);await restoreHandler({preventDefault(){}});assert.equal(storage.get('study-desk.v1'),current);assert.equal(context.getState().data,currentState);
 context.bad=JSON.parse(encrypted);context.bad.ciphertext=context.bad.ciphertext.slice(4);vm.runInContext('pendingRestore=bad;',context);node('#restorePassword').value='test-only-vault-pass';await restoreHandler({preventDefault(){}});assert.equal(storage.get('study-desk.v1'),current);
 context.good=JSON.parse(encrypted);vm.runInContext('pendingRestore=good;',context);context.confirm=()=>false;await restoreHandler({preventDefault(){}});assert.equal(storage.get('study-desk.v1'),current);
 context.confirm=()=>true;context.localStorage.setItem=()=>{throw Error('quota-full');};await restoreHandler({preventDefault(){}});assert.equal(storage.get('study-desk.v1'),current);assert.equal(context.getState().data,currentState);
 context.localStorage.setItem=originalSetter;await restoreHandler({preventDefault(){}});assert.equal(storage.get('study-desk.v1'),encrypted);assert.equal(context.getState().unlocked,false);
 console.log('PASS: plain-to-encrypted-to-plain retention; wrong password, corrupt backup, cancellation and write failure preserve original; successful restore locks');
})().catch(error=>{console.error(error);process.exitCode=1;});
