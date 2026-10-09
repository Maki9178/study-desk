'use strict';
(function(root){
 const groups=[['late','已逾期'],['today','今天截止'],['tomorrow','明天截止'],['soon','未来三天'],['week','未来七天'],['none','未设截止'],['later','更远'],['done','已完成']];
 function groupOf(t,now=new Date()){
  if(t.status==='done')return 'done';if(!t.due)return 'none';
  const due=new Date(t.due);if(due<now)return 'late';
  const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  const left=(day(due)-day(now))/86400000;
  const hours=(due-now)/3600000;return left===0?'today':left===1?'tomorrow':hours<=72?'soon':hours<=168?'week':'later';
 }
 function url(value){if(!value)return '';if(typeof value!=='string')throw Error('网址字段不正确');const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error('网址只支持 http / https');return u.href;}
 function text(value){if(value==null)return '';if(typeof value!=='string')throw Error('文字字段不正确');return value;}
 function dueISO(value){
  if(!value)return '';if(typeof value!=='string')throw Error('截止时间字段不正确');
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/);
  if(!m)throw Error('截止时间格式不正确');
  const y=+m[1],mo=+m[2],d=+m[3],h=+m[4],mi=+m[5],sec=+(m[6]||0),check=new Date(Date.UTC(y,mo-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||h>23||mi>59||sec>59)throw Error('截止日期不存在');
  const date=new Date(value);if(Number.isNaN(date.getTime()))throw Error('截止时间不正确');return date.toISOString();
 }
 const fingerprint=t=>JSON.stringify([t.siteId||'',t.title.trim().replace(/\s+/g,' '),t.due?dueISO(t.due):'']);
 function mergeLegacy(current,legacy,newId){
  if(legacy?.version!==1||!Array.isArray(legacy.platforms)||!Array.isArray(legacy.tasks))throw Error('需要作业雷达 v1 JSON');
  const state=structuredClone(current),map=new Map(),pids=new Set(),tids=new Set();let sitesAdded=0,tasksAdded=0,skipped=0;
  for(const p of legacy.platforms){
   if(!p||typeof p.id!=='string'||!p.id||pids.has(p.id)||!text(p.name).trim())throw Error('平台数据不完整或 ID 重复');pids.add(p.id);
   const name=p.name.trim(),address=url(p.url),login=text(p.login),notes=text(p.note);
   let hit=state.sites.find(s=>(address&&s.url===address)||(s.name===name&&(!address||!s.url)));
   if(!hit){hit={id:newId(),name,url:address,category:'课程',purpose:'从作业雷达迁移',assignmentUrl:'',account:'',password:'',loginHint:login,notes,integration:{mode:'manual',adapterId:null,lastSyncAt:null}};state.sites.push(hit);sitesAdded++;}
   map.set(p.id,hit.id);
  }
  const seen=new Set(state.tasks.map(fingerprint));
  for(const t of legacy.tasks){
   if(!t||typeof t.id!=='string'||!t.id||tids.has(t.id)||!text(t.title).trim()||!['todo','doing','done'].includes(t.status))throw Error('作业数据不完整或状态不受支持');tids.add(t.id);
   const platformId=text(t.platformId);if(platformId&&!map.has(platformId))throw Error('作业关联的平台不存在');
   const estimate=t.est===''||t.est==null?'':Number(t.est);if(estimate!==''&&(!Number.isFinite(estimate)||estimate<0||estimate>100000))throw Error('预计耗时不正确');
   const incoming={id:newId(),siteId:map.get(platformId)||'',title:t.title.trim(),course:text(t.course),due:dueISO(t.due),status:t.status==='todo'?'open':t.status,url:url(t.url),notes:text(t.note),est:estimate,source:'radar',externalId:t.id};
   const stamp=fingerprint(incoming);
   if(seen.has(stamp)||state.tasks.some(x=>x.source==='radar'&&x.externalId===t.id&&x.siteId===incoming.siteId)){skipped++;continue;}
   seen.add(stamp);state.tasks.push(incoming);tasksAdded++;
  }
  return {state,sitesAdded,tasksAdded,skipped};
 }
 function reminderData(state){
  return {version:1,platforms:state.sites.map(s=>({id:s.id,name:s.name,url:s.url||''})),tasks:state.tasks.map(t=>({id:t.id,title:t.title,platformId:t.siteId||'',course:t.course||'',due:t.due||'',est:t.est||'',status:t.status==='open'?'todo':t.status,url:t.url||'',note:t.notes||''})),settings:{}};
 }
 const escapeICS=value=>String(value??'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r\n|\r|\n/g,'\\n');
 const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 function fold(line){
  const encoder=new TextEncoder();let result='',chunk='',bytes=0;
  for(const ch of line){const size=encoder.encode(ch).length;if(bytes+size>75){result+=chunk+'\r\n';chunk=' ';bytes=1;}chunk+=ch;bytes+=size;}return result+chunk;
 }
 function calendar(state,onlyOpen=true,now=new Date()){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StudyDesk Radar//CN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:作业雷达'];
  for(const t of state.tasks.filter(t=>t.due&&(!onlyOpen||t.status!=='done'))){
   const site=state.sites.find(s=>s.id===t.siteId),description=[t.course&&'课程：'+t.course,site&&'平台：'+site.name,t.est&&'预计耗时：'+t.est+' 分钟',t.notes].filter(Boolean).join('\n');
   lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(t.id)+'@study-desk','DTSTAMP:'+utc(now),'DTSTART:'+utc(t.due),'DTEND:'+utc(new Date(new Date(t.due).getTime()+30*60000)),'SUMMARY:'+escapeICS('【作业截止】'+t.title));
   if(description)lines.push('DESCRIPTION:'+escapeICS(description));if(t.url)lines.push('URL:'+escapeICS(url(t.url)));
   for(const trigger of ['-P1D','-PT2H'])lines.push('BEGIN:VALARM','TRIGGER:'+trigger,'ACTION:DISPLAY','DESCRIPTION:'+escapeICS('作业提醒：'+t.title),'END:VALARM');
   lines.push('END:VEVENT');
  }
  return lines.concat('END:VCALENDAR').map(fold).join('\r\n')+'\r\n';
 }
 function brief(state,now=new Date()){
  const lines=['【作业简报】'+now.toLocaleDateString('zh-CN')];
  for(const [group,label] of groups){if(['done','week','later'].includes(group))continue;const tasks=state.tasks.filter(t=>groupOf(t,now)===group);if(!tasks.length)continue;lines.push('',`${label} ${tasks.length} 项`);for(const t of tasks)lines.push('· '+t.title+(t.due?' — '+new Date(t.due).toLocaleString('zh-CN'):''));}
  if(lines.length===1)lines.push('近期没有待完成作业。');return lines.join('\n');
 }
 function parseQuick(input,sites=[],now=new Date()){
  const local=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  return input.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,100).map(line=>{
   const radar=line.startsWith('RADAR|'),parts=line.split('|').map(x=>x.trim());let title=radar?parts[1]:parts[0],link='',siteId='',notes='',due='',warning='';
   if(radar){link=url(parts[2]);notes=parts.slice(3).join('|');}
   else if(parts.length>1){for(const segment of parts.slice(1)){if(/^https?:\/\//i.test(segment))link=url(segment);const site=sites.find(s=>s.name===segment);if(site)siteId=site.id;}notes=parts.slice(1).filter(x=>!/^https?:\/\//i.test(x)).join(' | ');}
   const m=line.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?(?:\s*(\d{1,2})[:：](\d{2}))?/);
   if(m){try{const iso=dueISO(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4]===undefined?'23':m[4].padStart(2,'0')}:${m[5]||'59'}`);due=local(new Date(iso));}catch{warning='日期无效，请核对';}}
   else{const short=line.match(/(?:^|[^\d])(\d{1,2})[-月/.](\d{1,2})日?(?:\s*(\d{1,2})[:：](\d{2}))?/);if(short){try{due=local(new Date(dueISO(`${now.getFullYear()}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}T${short[3]===undefined?'23':short[3].padStart(2,'0')}:${short[4]||'59'}`)));warning='年份暂按今年，请核对';}catch{warning='日期无效，请核对';}}}
   return {title:title||line,url:link,siteId,notes,due,warning};
  });
 }
 const api={groups,groupOf,mergeLegacy,reminderData,calendar,brief,parseQuick,dueISO};
 root.StudyDeskRadar=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
