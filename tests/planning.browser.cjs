// Optional integration check: requires Playwright and Chromium; npm test remains dependency-free.
const {chromium}=require('playwright');
const {createServer}=require('../server.cjs');
const assert=require('node:assert/strict');
(async()=>{
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({timezoneId:'Asia/Shanghai',viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${server.address().port}`;
await page.goto(base);await page.getByRole('button',{name:'不开启密码，直接使用'}).click();
await page.evaluate(()=>{const today=new Date();today.setHours(23,59,0,0);const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);localStorage.setItem('study-desk.v1',JSON.stringify({format:'study-desk-plain',version:1,data:{schemaVersion:1,sites:[{id:'s',name:'课程平台',url:'https://example.com',assignmentUrl:'https://example.com/assignments',category:'课程'}],tasks:[{id:'a',title:'物理作业',course:'物理',siteId:'s',due:today.toISOString(),status:'doing',est:45,url:'https://example.com/task/a'},{id:'b',title:'数学练习',course:'数学',siteId:'s',due:tomorrow.toISOString(),status:'open',est:''},{id:'c',title:'手动作业',course:'',siteId:'',due:'',status:'open'},{id:'d',title:'已完成',course:'物理',siteId:'s',due:today.toISOString(),status:'done',est:99}]}}));});await page.reload();
assert.equal(await page.locator('.workload-day').count(),7);
assert.match(await page.locator('.workload-day').first().innerText(),/1 份[\s\S]*45 分钟/);
assert.equal(await page.locator('#taskList h3 a').first().getAttribute('href'),'https://example.com/task/a');
assert.equal(await page.locator('#taskList .mini-actions a').nth(1).innerText(),'打开作业列表');
await page.selectOption('#courseFilter','course:数学');assert.equal(await page.locator('#taskList .task').count(),1);assert.equal(await page.locator('#suggestionList strong').innerText(),'数学练习');
assert.match(await page.locator('.workload-day').nth(1).innerText(),/1 份未估/);
await page.locator('.workload-day').nth(1).click();assert.equal(await page.locator('#taskList .task').count(),1);assert(await page.locator('#filterNote').innerText());
await page.click('#resetFiltersBtn');await page.locator('.workload-day').first().click();assert.equal(await page.locator('#taskList .task').count(),1);
await page.getByRole('button',{name:'标记已完成',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('study-desk.v1')).data.tasks.find(t=>t.id==='a').status==='done');assert.equal(await page.locator('#taskList .task').count(),0);
await page.click('#resetFiltersBtn');await page.selectOption('#courseFilter','uncategorized');assert.equal(await page.locator('#taskList .task').count(),1);
await page.click('#resetFiltersBtn');await page.reload();assert.equal(await page.locator('#taskList .task').count(),2);
await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'study-desk-desktop.png'),fullPage:true});
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.workload-day').nth(6).click();assert.match(await page.locator('#filterNote').innerText(),/仅显示/);await page.click('#resetFiltersBtn');await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'study-desk-mobile.png'),fullPage:true});
await page.goto(base+'?demo=1');await page.getByRole('button',{name:'不开启密码，直接使用'}).click();assert.equal(await page.locator('#taskList .task').count(),0);
await page.goto(base);assert.equal(await page.locator('#taskList .task').count(),2);
assert.deepEqual(errors,[]);console.log('PASS: Chromium desktop/mobile, course and day filters, link destinations, doing-to-done persistence, refresh and demo isolation');
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
