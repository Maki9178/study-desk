'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const app=read('app.js');

// 1. 网站账号 / 密码的填写入口必须移除；本地资料库主密码除外。
const siteForm=html.match(/<dialog id="siteDialog">[\s\S]*?<\/dialog>/)[0];
assert(!/name="account"/.test(siteForm));
assert(!/name="password"/.test(siteForm));
const credentialCopyTitles=/复制账号|复制密码|显示密码|查看密码|copyAccount|copyPassword|togglePassword/;
assert(!credentialCopyTitles.test(html));
assert(!credentialCopyTitles.test(app));
assert(!/s\.url\?'[^']*复制/.test(app));
assert(!html.includes('可复制账号'));

// 2. PTA 读取工具入口与实现必须存在，并且只读取当前页面可见内容。
assert(html.includes('id="ptaToolBtn"'));
assert(html.includes('id="ptaToolDialog"'));
assert(html.includes('id="ptaBookmark"'));
assert(html.includes('<script src="pta.js"></script>'));
assert(app.includes('StudyDeskPTA.bookmark()'));
const pta=read('pta.js');
assert(pta.includes('pintia.cn'));
assert(!/fetch\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage/.test(pta));

// 3. 页脚可见版本号必须为 0.6.0，并与 package.json 一致。
assert(html.includes('id="appVersion"'));
assert(html.includes('版本 v0.6.0'));
const footer=html.match(/<footer>[\s\S]*?<\/footer>/)[0];
assert(footer.includes('版本 v0.6.0'));
assert.equal(JSON.parse(read('package.json')).version,'0.6.0');

// 4. 构建后的离线包必须内嵌全部脚本、样式和 PTA 工具。
const dist=path.join(root,'dist','课桌-本地原型.html');
assert(fs.existsSync(dist));
const offline=fs.readFileSync(dist,'utf8');
assert(!/<script src=|<link rel="stylesheet"/.test(offline));
for(const marker of ['StudyDeskCore','StudyDeskRadar','StudyDeskPTA','StudyDeskAdapters','版本 v0.6.0','--blue:#2d57da'])assert(offline.includes(marker));
assert(offline.includes('function capture(doc,loc)'));
assert(offline.includes('id="ptaToolBtn"'));
assert(offline.includes('<dialog id="siteDialog">'));
assert(!/name="account"/.test(offline.match(/<dialog id="siteDialog">[\s\S]*?<\/dialog>/)[0]));

console.log('PASS: 网站账号密码入口已移除、PTA 读取工具存在、页脚版本 0.6.0、离线包内嵌全部脚本与样式');
