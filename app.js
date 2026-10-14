/* Local prototype. No requests to external services. See HANDOFF.md for adapter contracts. */
'use strict';
const DEMO_MODE=typeof location!=='undefined'&&new URLSearchParams(location.search).get('demo')==='1';
const STORAGE_KEY=DEMO_MODE?'study-desk.demo.v1':'study-desk.v1', ITERATIONS=250000;
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(), empty=()=>({schemaVersion:1,sites:[],tasks:[]});
let data=empty(), key=null, envelope=null, view='overview', plannerDay='', candidates=[], idleTimer, saveQueue=Promise.resolve(), committed=empty(), pendingRestore=null, saving=false, unlocked=false, storedVersion=null, radarPreview=null, reminderHandle=null, reminderQueue=Promise.resolve();
const b64=a=>{let text='';for(let i=0;i<a.length;i+=0x8000)text+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(text);}, unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const safeUrl=v=>{if(!v)return '';if(typeof v!=='string')throw Error('网址格式不正确');const u=new URL(v);if(!['https:','http:'].includes(u.protocol))throw Error('网址需要使用 http 或 https');return u.href;};
const localDate=d=>{const t=new Date(d);return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}T${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;};
async function derive(pass,salt){const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptState(snapshot,k,salt){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify(snapshot)));return {format:'study-desk-vault',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt,iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};}
function validateState(s){
 if(s?.schemaVersion!==1||!Array.isArray(s.sites)||!Array.isArray(s.tasks))throw Error('数据格式不受支持');
 const ids=new Set(), taskIds=new Set();
 const strings=(x,names)=>{for(const n of names)if(x[n]!=null&&typeof x[n]!=='string')throw Error('字段格式不正确：'+n);};
 for(const x of s.sites){
  if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim())throw Error('网站数据不完整');
  strings(x,['url','assignmentUrl','category','purpose','account','password','notes','loginHint']);
  ids.add(x.id);x.url=safeUrl(x.url);x.assignmentUrl=safeUrl(x.assignmentUrl);
 }
 for(const t of s.tasks){
  if(!t||typeof t.id!=='string'||!t.id||taskIds.has(t.id)||typeof t.title!=='string'||!t.title.trim())throw Error('作业数据不完整');
  strings(t,['url','siteId','course','due','notes','source','externalId']);taskIds.add(t.id);t.url=safeUrl(t.url);
  if(!['open','doing','done'].includes(t.status))throw Error('作业状态不受支持');
  if(t.due&&Number.isNaN(new Date(t.due).getTime()))throw Error('截止时间不正确');
  if(t.est!=null&&t.est!==''&&(!Number.isFinite(Number(t.est))||Number(t.est)<0||Number(t.est)>100000))throw Error('预计耗时不正确');
  if(t.siteId&&!ids.has(t.siteId))throw Error('作业关联的网站不存在');
 }return s;
}
function validateEnvelope(v){
 if(v?.format!=='study-desk-vault'||v.version!==1||v.kdf!=='PBKDF2-SHA256'||v.iterations!==ITERATIONS||typeof v.ciphertext!=='string'||unb64(v.ciphertext).length<16||unb64(v.salt).length!==16||unb64(v.iv).length!==12)throw Error('不是有效的加密备份');return v;
}
async function decryptVault(v,pass){
 validateEnvelope(v);const k=await derive(pass,unb64(v.salt));
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.ciphertext));
 return {key:k,data:validateState(StudyDeskCore.migrateState(JSON.parse(new TextDecoder().decode(plain))))};
}
function persist(){
 if(!unlocked||saving) return Promise.reject(Error('请等待当前保存完成'));
 const snapshot=structuredClone(data),k=key,salt=envelope.salt,expected=storedVersion;
 saving=true;$('#saveState').textContent='正在保存…';
 const job=saveQueue.catch(()=>{}).then(async()=>{
  try{
   validateState(snapshot);const next=k?await encryptState(snapshot,k,salt):{format:'study-desk-plain',version:1,data:snapshot};
   const current=localStorage.getItem(STORAGE_KEY);
   if(current!==expected)throw Error('资料库已在其他窗口更新，请锁定并重新解锁');
   const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);storedVersion=raw;envelope=next;committed=structuredClone(snapshot);queueReminder(snapshot);
   $('#saveState').textContent=k?'已加密保存到本地':'未开启保护 · 明文保存到本地';
  }catch(err){data=structuredClone(committed);render();$('#saveState').textContent='保存失败，请重试或导出备份';throw err;}
  finally{saving=false;}
 });saveQueue=job;return job;
}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3500);}
function protectionView(){
 const protectedMode=!!key;$('#quickLockBtn').hidden=!protectedMode;$('#lockBtn').hidden=!protectedMode;
 $('#exportBtn').textContent=protectedMode?'导出加密备份':'导出明文备份';
 $('#saveState').textContent=protectedMode?'已加密保存到本地':'未开启保护 · 明文保存到本地';
}
function openPlain(v,raw){
 if(v?.format!=='study-desk-plain'||v.version!==1)throw Error('明文备份版本不受支持');
 data=validateState(StudyDeskCore.migrateState(v.data));key=null;envelope=v;storedVersion=raw;committed=structuredClone(data);unlocked=true;
 if($('#vaultDialog').open)$('#vaultDialog').close();document.body.classList.remove('locked');render();protectionView();
}
function showVault(){
 document.body.classList.add('locked');const raw=localStorage.getItem(STORAGE_KEY);storedVersion=raw;
 $('#vaultForm').reset();$('#vaultError').textContent='';
 if(raw){try{const v=JSON.parse(raw);if(v.format==='study-desk-plain'){openPlain(v,raw);return;}}catch(err){$('#vaultError').textContent='资料库读取失败：'+err.message;}}
 $('#vaultTitle').textContent=raw?'解锁你的资料库':'创建本地资料库';
 $('#vaultDesc').textContent=raw?'输入主密码，查看网站和作业。':'可设置主密码加密，或不开启密码直接使用。';
 $('#confirmLabel').hidden=!!raw;$('#confirmPassword').required=!raw;$('#masterPassword').minLength=raw?1:10;
 $('#skipProtectionBtn').hidden=!!raw;if(!$('#vaultDialog').open)$('#vaultDialog').showModal();
}
async function prepareBackup(v,pass=''){
 if(v?.format==='study-desk-plain'){
  if(v.version!==1)throw Error('明文备份版本不受支持');
  return {data:validateState(StudyDeskCore.migrateState(v.data)),key:null,envelope:v};
 }
 const restored=await decryptVault(v,pass);return {...restored,envelope:v};
}
async function lock(){await saveQueue.catch(()=>{});clearTimeout(idleTimer);key=null;unlocked=false;data=empty();committed=empty();pendingRestore=null;radarPreview=null;$('#radarMergeForm').reset();$('#radarMergeInfo').textContent='';$('#radarMergeError').textContent='';$('#restoreForm').reset();$('#protectionForm').reset();for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#siteForm').reset();$('#taskForm').reset();$('#search').value='';$('#categoryFilter').value='';$('#statusFilter').value='open';$('#dueFilter').value='';$('#courseFilter').value='';plannerDay='';siteSelect($('#taskSiteSelect'));siteSelect($('#readerSite'));$('#restoreInfo').textContent='';clearTimeout(toast.timer);$('#toast').textContent='';$('#toast').style.display='none';$('#readerText').value='';$('#readerCourse').value='';$('#readerResults').innerHTML='';candidates=[];render();showVault();if(DEMO_MODE){$('#modeNote').textContent='独立演示模式 · 与正式资料库分开保存';document.title='课桌 · 独立演示';}}
function touch(){clearTimeout(idleTimer);if(key)idleTimer=setTimeout(()=>lock(),10*60*1000);}
$('#vaultDialog').addEventListener('cancel',e=>e.preventDefault());
$('#vaultForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=$('#unlockBtn');btn.disabled=true;
 try{
  if(!crypto.subtle)throw Error('浏览器不支持本地加密，请用新版 Chrome 或 Edge');
  const pass=$('#masterPassword').value,raw=localStorage.getItem(STORAGE_KEY);
  if(raw){const restored=await prepareBackup(JSON.parse(raw),pass);envelope=restored.envelope;key=restored.key;data=restored.data;storedVersion=raw;committed=structuredClone(data);unlocked=true;}
  else{
   if(pass!==$('#confirmPassword').value)throw Error('两次密码不一致');
   const salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pass,salt);envelope={salt:b64(salt)};data=empty();unlocked=true;await persist();
  }
  $('#vaultForm').reset();$('#vaultDialog').close();document.body.classList.remove('locked');render();protectionView();touch();
 }catch(err){key=null;unlocked=false;data=empty();committed=empty();$('#vaultError').textContent=err.name==='OperationError'?'主密码不正确，或备份已损坏。':err.message;}
 finally{btn.disabled=false;}
});
$('#skipProtectionBtn').onclick=async()=>{
 const btn=$('#skipProtectionBtn');btn.disabled=true;
 try{
  if(localStorage.getItem(STORAGE_KEY))throw Error('已有资料库，请解锁或恢复备份');
  data=empty();envelope={format:'study-desk-plain',version:1,data};key=null;unlocked=true;await persist();
  $('#vaultForm').reset();$('#vaultDialog').close();document.body.classList.remove('locked');render();protectionView();
 }catch(err){unlocked=false;$('#vaultError').textContent=err.message;}finally{btn.disabled=false;}
};
function siteSelect(el,selected=''){el.innerHTML='<option value="">未关联网站</option>'+data.sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');el.value=selected;}
function openSite(id){const s=data.sites.find(s=>s.id===id);$('#siteForm').reset();$('#siteDialogTitle').textContent=s?'编辑网站':'添加网站';if(s)for(const [k,v]of Object.entries(s)){const el=$('#siteForm').elements.namedItem(k);if(el)el.value=v??'';}$('#siteDialog').showModal();}
function openTask(id,siteId=''){const t=data.tasks.find(t=>t.id===id);$('#taskForm').reset();siteSelect($('#taskSiteSelect'),t?.siteId||siteId);$('#taskDialogTitle').textContent=t?'编辑作业':'添加作业';if(t)for(const[k,v]of Object.entries(t)){const el=$('#taskForm').elements.namedItem(k);if(el)el.value=k==='due'&&v?localDate(v):v??'';}$('#taskDialog').showModal();}
function dateLabel(t){if(!t.due)return '<span>未设置截止日期</span>';const d=new Date(t.due),late=t.status!=='done'&&d<Date.now();return `<span class="due ${late?'overdue':''}">${late?'已逾期 · ':''}${esc(d.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</span>`;}
function taskDestination(t){
 const site=data.sites.find(s=>s.id===t.siteId);
 return {url:t.url||site?.assignmentUrl||site?.url||'',label:t.url?'打开作业':site?.assignmentUrl?'打开作业列表':'打开平台'};
}
function taskTitle(t){
 const link=taskDestination(t);
 return link.url?`<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t.title+' · '+link.label+'（新窗口）')}">${esc(t.title)}</a>`:esc(t.title);
}
function taskCard(t){
 const site=data.sites.find(s=>s.id===t.siteId),link=taskDestination(t);
 return `<article class="task ${t.status==='done'?'done':''}"><button class="check" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.status==='done'?'标记未完成':'标记已完成'}">${t.status==='done'?'✓':''}</button><div class="task-body"><h3>${taskTitle(t)}</h3><div class="meta">${dateLabel(t)}<span>${esc(t.course||'未设置课程')}</span><span>${esc(site?.name||'未关联网站')}</span>${t.status==='doing'?'<span class="pill">进行中</span>':''}${t.est?`<span>预计 ${esc(t.est)} 分钟</span>`:''}${['text','radar'].includes(t.source)?`<span class="pill">${t.source==='radar'?'旧版迁移':'文本导入'}</span>`:''}</div>${t.notes?`<div class="task-notes">${esc(t.notes)}</div>`:''}</div><div class="mini-actions">${link.url?`<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${link.label}</a>`:''}<button data-action="editTask" data-id="${esc(t.id)}">编辑</button><button data-action="deleteTask" data-id="${esc(t.id)}">删除</button></div></article>`;
}
function renderWorkload(tasks,now){
 const workload=StudyDeskCore.weekWorkload(tasks,now);
 $('#plannerSection').hidden=view==='sites';
 $('#workloadSummary').textContent=`此前逾期 ${workload.overdue} 份 · 未设截止 ${workload.undated} 份`;
 $('#weekWorkload').innerHTML=workload.days.map((day,i)=>{
  const label=i===0?'今天':new Date(day.date+'T12:00:00').toLocaleDateString('zh-CN',{weekday:'short',month:'numeric',day:'numeric'});
  return `<button class="workload-day ${day.count?'has-tasks':''}" data-action="focusDay" data-date="${day.date}" aria-pressed="${plannerDay===day.date}"><span>${label}</span><strong>${day.count} 份</strong><small>${day.minutes?`已估 ${day.minutes} 分钟`:'暂无耗时估计'}${day.unknown?` · ${day.unknown} 份未估`:''}</small></button>`;
 }).join('');
 $('#filterNote').textContent=plannerDay?`仅显示 ${plannerDay} 截止的作业`:'';
 $('#courseFilter').hidden=view==='sites';
}
function render(){
 const q=$('#search').value.trim().toLowerCase(),category=$('#categoryFilter').value,status=$('#statusFilter').value,dueGroup=$('#dueFilter').value,now=new Date();
 const selectedCourse=$('#courseFilter').value,courses=[...new Set(data.tasks.map(t=>t.course||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 $('#courseFilter').innerHTML='<option value="">全部课程</option><option value="uncategorized">未设置课程</option>'+courses.map(c=>`<option value="${esc('course:'+c)}">${esc(c)}</option>`).join('');
 $('#courseFilter').value=selectedCourse==='uncategorized'||courses.some(c=>'course:'+c===selectedCourse)?selectedCourse:'';
 const course=$('#courseFilter').value;
 const scoped=data.tasks.filter(t=>{const site=data.sites.find(s=>s.id===t.siteId);return (!course||(course==='uncategorized'?!t.course:'course:'+t.course===course))&&(!category||site?.category===category)&&[t.title,t.course,t.notes,site?.name].join(' ').toLowerCase().includes(q);});
 renderWorkload(scoped,now);render.lastDay=StudyDeskCore.dayKey(now);
 const open=data.tasks.filter(t=>t.status!=='done'),soon=open.filter(t=>['today','tomorrow','soon'].includes(StudyDeskRadar.groupOf(t,now))),late=open.filter(t=>StudyDeskRadar.groupOf(t,now)==='late');
 $('#stats').innerHTML=[['平台 / 网站',data.sites.length],['未完成',open.length],['三天内截止',soon.length],['已逾期',late.length]].map(([l,n],i)=>`<div class="stat ${i===3&&n?'urgent':''}"><strong>${n}</strong><span>${l}</span></div>`).join('');
 const sites=data.sites.filter(s=>(!category||s.category===category)&&[s.name,s.purpose,s.loginHint,s.notes].join(' ').toLowerCase().includes(q));
 const tasks=StudyDeskCore.sortTasks(scoped.filter(t=>(!plannerDay||(t.due&&StudyDeskCore.dayKey(t.due)===plannerDay))&&(status==='all'||(status==='open'?t.status!=='done':t.status===status))&&(!dueGroup||(dueGroup==='soon'?['today','tomorrow','soon'].includes(StudyDeskRadar.groupOf(t,now)):dueGroup==='week'?['today','tomorrow','soon','week'].includes(StudyDeskRadar.groupOf(t,now)):StudyDeskRadar.groupOf(t,now)===dueGroup))),now);
 $('#taskCount').textContent=`· ${tasks.length}`;$('#siteCount').textContent=`· ${sites.length}`;
 $('#taskList').innerHTML=tasks.length?StudyDeskRadar.groups.map(([group,label])=>{const rows=tasks.filter(t=>StudyDeskRadar.groupOf(t,now)===group);return rows.length?`<h3 class="task-group">${label} <span>${rows.length}</span></h3>`+rows.map(taskCard).join(''):'';}).join(''):'<div class="empty">这里暂时没有符合条件的作业。<br><button data-action="newTask">添加第一份作业</button></div>';
 $('#siteList').innerHTML=sites.length?sites.map(s=>`<article class="site"><div class="site-top"><span class="site-icon">${esc(s.name.slice(0,1))}</span><div><h3>${esc(s.name)}</h3><div class="site-domain">${esc(s.url?new URL(s.url).hostname:'群聊 / 手动入口')}</div></div></div><div class="site-purpose">${esc(s.purpose||'点击编辑，记录用途')}</div><div><span class="pill">${esc(s.category||'课程')}</span> <span class="muted">${data.tasks.filter(t=>t.siteId===s.id&&t.status!=='done').length} 份未完成作业</span></div>${s.loginHint?`<div class="muted">登录方式：${esc(s.loginHint)}</div>`:''}<div class="mini-actions">${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">打开网站</a>`:''}<button data-action="newSiteTask" data-id="${esc(s.id)}">加作业</button><button data-action="editSite" data-id="${esc(s.id)}">编辑</button><button data-action="deleteSite" data-id="${esc(s.id)}">删除</button></div></article>`).join(''):'<div class="empty">把常用平台集中到这里。<br><button data-action="newSite">添加第一个网站</button></div>';
 $('#suggestionSection').hidden=view!=='overview';$('#suggestionList').innerHTML=StudyDeskCore.suggestions(tasks,now).map(t=>`<article class="suggestion"><strong>${taskTitle(t)}</strong>${dateLabel(t)}<button data-action="editTask" data-id="${esc(t.id)}">编辑</button></article>`).join('')||'<p class="muted">当前筛选下没有待完成作业。可以重置筛选，或添加作业。</p>';$('#taskSection').hidden=view==='sites';$('#siteSection').hidden=view==='tasks';$('#viewTitle').textContent={overview:'今天先做什么？',sites:'常用平台，一处找到',tasks:'把作业安排清楚'}[view];
}
async function copy(v){try{await navigator.clipboard.writeText(v);toast('已复制');}catch{toast('浏览器禁止复制，请在编辑窗口中手动复制。');}}
document.addEventListener('click',async e=>{touch();const b=e.target.closest('button');if(!b)return;if(b.dataset.close){$('#'+b.dataset.close).close();return;}if(b.dataset.view){view=b.dataset.view;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));render();return;}const a=b.dataset.action,id=b.dataset.id;if(!a||!unlocked)return;if(saving){toast('请等待保存完成');return;}try{if(a==='focusDay'){plannerDay=plannerDay===b.dataset.date?'':b.dataset.date;$('#statusFilter').value='open';$('#dueFilter').value='';render();$('#taskSection').scrollIntoView({behavior:'smooth',block:'start'});return;}if(a==='newSite')openSite();if(a==='newTask')openTask();if(a==='editSite')openSite(id);if(a==='editTask')openTask(id);if(a==='newSiteTask')openTask(null,id);if(a==='toggle'){const t=data.tasks.find(t=>t.id===id);t.status=t.status==='done'?'open':'done';await persist();render();}if(a==='deleteTask'&&confirm('删除这份作业？')){data.tasks=data.tasks.filter(t=>t.id!==id);await persist();render();}if(a==='deleteSite'&&confirm('删除网站？关联作业会保留，但取消网站关联。')){data.sites=data.sites.filter(s=>s.id!==id);data.tasks.forEach(t=>{if(t.siteId===id)t.siteId='';});await persist();render();}}catch(err){toast('操作未保存：'+err.message);}});
$('#siteForm').addEventListener('submit',async e=>{e.preventDefault();if(saving){toast('请等待保存完成');return;}try{const values=Object.fromEntries(new FormData(e.target));values.name=values.name.trim();values.url=safeUrl(values.url);values.assignmentUrl=safeUrl(values.assignmentUrl);if(!values.name.trim())throw Error('请输入网站名称');const existing=data.sites.find(s=>s.id===values.id);if(!existing){values.account='';values.password='';}values.id=values.id||uid();values.integration=existing?.integration||{mode:'manual',adapterId:null,lastSyncAt:null};const i=data.sites.findIndex(s=>s.id===values.id);if(i<0)data.sites.push(values);else data.sites[i]={...existing,...values};await persist();$('#siteDialog').close();e.target.reset();render();toast('网站已保存');}catch(err){toast(err.message);}});
$('#taskForm').addEventListener('submit',async e=>{e.preventDefault();if(saving){toast('请等待保存完成');return;}try{const values=Object.fromEntries(new FormData(e.target));values.est=values.est===''?'':Number(values.est);values.title=values.title.trim();if(!values.title)throw Error('请输入作业名称');values.url=safeUrl(values.url);values.due=values.due?new Date(values.due).toISOString():'';const old=data.tasks.find(t=>t.id===values.id);values.id=values.id||uid();values.source=old?.source||'manual';values.externalId=old?.externalId||null;const i=data.tasks.findIndex(t=>t.id===values.id);if(i<0)data.tasks.push(values);else data.tasks[i]={...old,...values};await persist();$('#taskDialog').close();e.target.reset();render();toast('作业已保存');}catch(err){toast(err.message);}});
$('#addSiteBtn').onclick=()=>openSite();$('#addTaskBtn').onclick=()=>openTask();$('#lockBtn').onclick=lock;$('#quickLockBtn').onclick=lock;['search','categoryFilter','courseFilter','statusFilter','dueFilter'].forEach(id=>$('#'+id).addEventListener('input',()=>{if(id==='dueFilter')plannerDay='';render();}));
$('#resetFiltersBtn').onclick=()=>{plannerDay='';for(const id of ['search','categoryFilter','courseFilter','dueFilter'])$('#'+id).value='';$('#statusFilter').value='open';render();};
// Refresh calendar boundaries after a sleeping tab is reopened.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&unlocked)render();});
setInterval(()=>{if(unlocked&&!document.hidden&&render.lastDay!==StudyDeskCore.dayKey(new Date()))render();},60000);
function downloadBackup(v,label=v.format==='study-desk-plain'?'明文备份':'加密备份'){
 const blob=new Blob([JSON.stringify(v,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`课桌-${label}-${localDate(new Date()).replace(/[:T]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#exportBtn').onclick=async()=>{try{await saveQueue;downloadBackup(envelope);toast(key?'已导出加密备份，恢复时仍需主密码':'已导出明文备份，请妥善保管');}catch(err){toast(err.message);}};
$('#importBtn').onclick=()=>$('#backupInput').click();$('#recoverVaultBtn').onclick=()=>$('#backupInput').click();
$('#backupInput').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>10*1024*1024)throw Error('备份文件过大');
  const parsed=JSON.parse(await f.text());if(parsed?.format==='study-desk-plain'){if(parsed.version!==1)throw Error('备份版本不受支持');validateState(StudyDeskCore.migrateState(parsed.data));pendingRestore=parsed;}else pendingRestore=validateEnvelope(parsed);$('#restoreForm').reset();$('#restoreError').textContent='';
  $('#restorePasswordLabel').hidden=pendingRestore.format==='study-desk-plain';$('#restorePassword').required=pendingRestore.format!=='study-desk-plain';$('#restoreInfo').textContent='已选择：'+f.name+(pendingRestore.format==='study-desk-plain'?'（明文备份，不需要密码）':'。请输入这份备份的主密码。');$('#restoreDialog').showModal();
 }catch(err){pendingRestore=null;toast('导入失败：'+err.message);}finally{e.target.value='';}
};
$('#restoreDialog').addEventListener('close',()=>{pendingRestore=null;radarPreview=null;$('#radarMergeForm').reset();$('#radarMergeInfo').textContent='';$('#radarMergeError').textContent='';$('#restoreForm').reset();});
$('#restoreForm').onsubmit=async e=>{
 e.preventDefault();const btn=$('#restoreBtn');btn.disabled=true;
 try{
  const imported=pendingRestore,restored=await prepareBackup(imported,$('#restorePassword').value);
  if(!confirm(`验证成功：${restored.data.sites.length} 个网站、${restored.data.tasks.length} 份作业。确认替换当前资料库？`))return;
  await saveQueue.catch(()=>{});
  const current=localStorage.getItem(STORAGE_KEY);
  if(current)downloadBackup(JSON.parse(current),'恢复前备份');
  localStorage.setItem(STORAGE_KEY,JSON.stringify(imported));await lock();toast(imported.format==='study-desk-plain'?'明文备份已恢复':'备份已恢复，请用原主密码解锁');
 }catch(err){$('#restoreError').textContent=err.name==='OperationError'?'密码不正确或备份已损坏，当前资料库未替换。':err.message;}
 finally{btn.disabled=false;}
};
$('#demoBtn').onclick=async()=>{if(!unlocked||saving)return;if(data.sites.some(s=>s.demo)){toast('示例已存在');return;}const sid=uid();data.sites.push({id:sid,name:'示例课程平台',url:'https://example.com/',assignmentUrl:'',category:'课程',purpose:'示例：看课件与提交作业',account:'',password:'',notes:'请替换成你实际使用的网站。',demo:true,integration:{mode:'manual',adapterId:null,lastSyncAt:null}});data.tasks.push({id:uid(),siteId:sid,title:'示例：完成运动学练习',course:'大学物理',due:new Date(Date.now()+48*3600000).toISOString(),status:'open',url:'',notes:'这是一条示例任务，可以编辑或删除。',source:'manual',externalId:null});try{await persist();render();toast('示例已添加');}catch(err){toast(err.message);}};
// Adapter boundary: parsing stays separate from persistence; candidates always require user confirmation.
function parseTaskText(text){return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,100).map(line=>{const m=line.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?(?:\s*(\d{1,2}):(\d{2}))?/);let due='';if(m){const y=+m[1],month=+m[2],day=+m[3],h=m[4]===undefined?23:+m[4],min=m[5]===undefined?59:+m[5],d=new Date(y,month-1,day,h,min);if(d.getFullYear()===y&&d.getMonth()===month-1&&d.getDate()===day&&h<24&&min<60)due=localDate(d);}return {title:line,due};});}
$('#readTasksBtn').onclick=()=>{siteSelect($('#readerSite'));$('#readerText').value='';$('#readerCourse').value='';$('#readerResults').innerHTML='';candidates=[];$('#readerDialog').showModal();};
$('#readerSite').onchange=()=>{candidates=[];$('#readerResults').innerHTML='';};
$('#readerForm').onsubmit=e=>{e.preventDefault();try{const parsed=StudyDeskRadar.parseQuick($('#readerText').value,data.sites);const marked=StudyDeskCore.previewCandidates(data.tasks,parsed.map(t=>({...t,siteId:t.siteId||$('#readerSite').value,due:t.due?new Date(t.due).toISOString():''})));candidates=parsed.map((t,i)=>({...t,duplicate:marked[i].duplicate,possibleDuplicate:marked[i].possibleDuplicate}));}catch(err){toast(err.message);return;}$('#readerResults').innerHTML=candidates.map((t,i)=>`<div class="candidate"><label><input type="checkbox" data-candidate="${i}" ${t.duplicate?'':'checked'}><span>${esc(t.title)}${t.duplicate?'<small class="error">重复（默认不选）</small>':t.possibleDuplicate?'<small class="error">可能重复，请核对</small>':''}${t.warning?`<small class="error"> · ${esc(t.warning)}</small>`:''}${t.siteId?`<small> · ${esc(data.sites.find(s=>s.id===t.siteId)?.name)}</small>`:''}</span></label><input type="datetime-local" aria-label="候选作业截止时间" data-due="${i}" value="${esc(t.due)}"></div>`).join('')+(candidates.length?'<button type="button" class="primary" id="confirmCandidates" style="margin-top:16px">确认并加入清单</button>':'<p class="muted">先粘贴网页上的作业文字。</p>');};
function taskFingerprint(t){return JSON.stringify([t.siteId||'',t.title.trim().replace(/\s+/g,' '),t.due?new Date(t.due).toISOString():'']);}
function mergeCandidates(tasks,incoming){return StudyDeskCore.mergeTasks(tasks,incoming);}
$('#readerResults').onclick=async e=>{
 if(e.target.id!=='confirmCandidates'||saving||!unlocked)return;
 try{
  const selected=[...document.querySelectorAll('[data-candidate]:checked')];if(!selected.length){toast('请选择至少一份作业');return;}
  const incoming=selected.map(input=>{const i=+input.dataset.candidate,due=document.querySelector(`[data-due="${i}"]`).value;return {id:uid(),siteId:candidates[i].siteId||$('#readerSite').value,title:candidates[i].title,course:$('#readerCourse').value.trim(),due:due?new Date(due).toISOString():'',status:'open',url:candidates[i].url||'',notes:candidates[i].notes||'',source:'text',externalId:null};});
  const result=mergeCandidates(data.tasks,incoming);data.tasks.push(...result.added);
  if(result.added.length)await persist();$('#readerDialog').close();$('#readerResults').innerHTML='';$('#readerText').value='';candidates=[];render();toast(`已导入 ${result.added.length} 份作业，跳过 ${result.skipped} 份重复作业`);
 }catch(err){toast(err.message);}
};
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY&&unlocked){lock().then(()=>toast('资料库在其他窗口发生变化，请重新解锁'));}});
// Extension registration for a later localhost service or browser extension. No credentials enter this API.
window.StudyDeskAdapters={version:1,registry:new Map(),register(id,adapter){if(typeof id!=='string'||typeof adapter?.readTasks!=='function')throw Error('适配器需要 readTasks 方法');this.registry.set(id,adapter);},parseTaskText};
function protectionFields(){
 const encrypted=$('#protectionMode').value==='encrypted';
 $('#currentProtectionLabel').hidden=!key;$('#currentProtectionPassword').required=!!key;
 for(const id of ['newProtectionLabel','newProtectionConfirmLabel'])$('#'+id).hidden=!encrypted;
 $('#newProtectionPassword').required=encrypted;$('#newProtectionConfirm').required=encrypted;
}
$('#protectionBtn').onclick=()=>{
 $('#protectionForm').reset();$('#protectionMode').value=key?'encrypted':'plain';
 $('#protectionInfo').textContent=key?'当前使用主密码加密。可更换主密码，或关闭保护。':'当前未开启保护，数据以明文保存。开启加密会保留现有资料。';
 $('#protectionError').textContent='';protectionFields();$('#protectionDialog').showModal();
};
$('#protectionMode').onchange=protectionFields;
$('#protectionDialog').addEventListener('close',()=>$('#protectionForm').reset());
$('#protectionForm').onsubmit=async e=>{
 e.preventDefault();if(!unlocked||saving)return;const btn=$('#saveProtectionBtn');btn.disabled=true;
 try{
  await saveQueue;
  if(key)await prepareBackup(envelope,$('#currentProtectionPassword').value);
  const snapshot=validateState(StudyDeskCore.migrateState(data)),expected=storedVersion;
  let next,nextKey=null;
  if($('#protectionMode').value==='encrypted'){
   const pass=$('#newProtectionPassword').value;if(pass.length<10)throw Error('主密码至少 10 位');
   if(pass!==$('#newProtectionConfirm').value)throw Error('两次新密码不一致');
   const salt=crypto.getRandomValues(new Uint8Array(16));nextKey=await derive(pass,salt);next=await encryptState(snapshot,nextKey,b64(salt));
  }else{
   if(key&&snapshot.sites.some(s=>s.password)&&!confirm('关闭保护后，已保存的网站密码也会变成明文。仍要关闭保护吗？'))return;
   next={format:'study-desk-plain',version:1,data:snapshot};
  }
  if(localStorage.getItem(STORAGE_KEY)!==expected)throw Error('资料库已在其他窗口更新，请重新打开');
  const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);
  storedVersion=raw;envelope=next;key=nextKey;data=snapshot;committed=structuredClone(snapshot);
  clearTimeout(idleTimer);touch();protectionView();$('#protectionDialog').close();toast(nextKey?'已启用加密保护，资料保留':'已切换为明文保存，资料保留');
 }catch(err){$('#protectionError').textContent=err.name==='OperationError'?'当前主密码不正确，保存方式未改变。':err.message;}
 finally{btn.disabled=false;}
};
function downloadText(name,text,type){
 const blob=new Blob([text],{type}),href=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=href;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function queueReminder(snapshot){
 if(!reminderHandle)return;
 const handle=reminderHandle,content=JSON.stringify(StudyDeskRadar.reminderData(snapshot),null,2);
 reminderQueue=reminderQueue.catch(()=>{}).then(async()=>{
  try{const stream=await handle.createWritable();await stream.write(content);await stream.close();$('#reminderState').textContent='提醒文件已更新';}
  catch(err){$('#reminderState').textContent='提醒文件写入失败，请重新绑定；加密库已保存';reminderHandle=null;}
 });
}
$('#briefBtn').onclick=()=>copy(StudyDeskRadar.brief(data));
$('#icsBtn').onclick=()=>{
 const calendar=StudyDeskRadar.calendar(data,true);if(!calendar.includes('BEGIN:VEVENT')){toast('没有设置截止时间的未完成作业');return;}
 downloadText('作业提醒.ics',calendar,'text/calendar;charset=utf-8');toast('已导出未完成作业，带提前一天和两小时提醒；日历导入后才生效');
};
$('#reminderExportBtn').onclick=()=>{
 downloadText('作业雷达提醒数据.json',JSON.stringify(StudyDeskRadar.reminderData(data),null,2),'application/json');toast('提醒数据为明文，不含网站账号和密码，请妥善保管');
};
$('#bindReminderBtn').onclick=async()=>{
 try{
  if(!window.showSaveFilePicker)throw Error('当前浏览器不支持绑定，请用导出提醒数据');
  reminderHandle=await window.showSaveFilePicker({suggestedName:'作业雷达提醒数据.json',types:[{description:'JSON',accept:{'application/json':['.json']}}]});
  queueReminder(data);await reminderQueue;toast('提醒文件仅含平台和作业信息，当前会话自动更新，重新打开需再次绑定');
 }catch(err){if(err.name!=='AbortError')toast(err.message);}
};
$('#radarMergeBtn').onclick=()=>{
 $('#radarMergeForm').reset();radarPreview=null;$('#radarMergeInfo').textContent='';$('#radarMergeError').textContent='';$('#radarCommitBtn').hidden=true;$('#radarMergeDialog').showModal();
};
$('#radarMergeDialog').addEventListener('close',()=>{radarPreview=null;$('#radarMergeForm').reset();});
$('#radarJson').addEventListener('input',()=>{radarPreview=null;$('#radarCommitBtn').hidden=true;$('#radarMergeInfo').textContent='';});
$('#radarFileBtn').onclick=()=>$('#radarInput').click();
$('#radarInput').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>10*1024*1024)throw Error('文件超过 10 MB');$('#radarJson').value=await file.text();radarPreview=null;$('#radarCommitBtn').hidden=true;$('#radarMergeInfo').textContent='已读取：'+file.name;}
 catch(err){$('#radarMergeError').textContent=err.message;}finally{e.target.value='';}
};
$('#radarMergeForm').onsubmit=e=>{
 e.preventDefault();radarPreview=null;$('#radarCommitBtn').hidden=true;$('#radarMergeError').textContent='';
 try{
  if(!unlocked||saving)throw Error('请先解锁并等待保存完成');
  const raw=$('#radarJson').value;if(raw.length>10*1024*1024)throw Error('JSON 超过 10 MB');
  radarPreview=StudyDeskRadar.mergeLegacy(data,JSON.parse(raw),uid);validateState(radarPreview.state);
  $('#radarMergeInfo').textContent=`将追加 ${radarPreview.sitesAdded} 个平台、${radarPreview.tasksAdded} 份作业，跳过 ${radarPreview.skipped} 份重复作业。现有资料和完成状态保留。`;
  $('#radarMergeInfo').textContent+='\n'+radarPreview.state.tasks.filter(t=>!data.tasks.some(old=>old.id===t.id)).map(t=>t.title+' · '+(t.due?new Date(t.due).toLocaleString('zh-CN'):'截止待核对')+' · '+(t.status==='doing'?'进行中':'待完成')+' · '+t.notes).join('\n');$('#radarCommitBtn').hidden=false;
 }catch(err){$('#radarMergeError').textContent=err.message;}
};
$('#radarCommitBtn').onclick=async()=>{
 if(!radarPreview||!unlocked||saving)return;const btn=$('#radarCommitBtn');btn.disabled=true;
 try{const result=radarPreview;data=result.state;await persist();$('#radarMergeDialog').close();render();toast(`已追加 ${result.sitesAdded} 个平台、${result.tasksAdded} 份作业`);}
 catch(err){$('#radarMergeError').textContent=err.message;}finally{btn.disabled=false;}
};
window.addEventListener('beforeunload',e=>{if(saving){e.preventDefault();e.returnValue='';}});
['pointerdown','keydown'].forEach(event=>document.addEventListener(event,touch));
render();showVault();if(DEMO_MODE){$('#modeNote').textContent='独立演示模式 · 与正式资料库分开保存';document.title='课桌 · 独立演示';}

// Optional agent tools expose task metadata only; credentials are never returned.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const tools=[
  {name:'read_tasks',description:'Read the unlocked homework list. Does not expose account credentials.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!unlocked)throw Error('资料库已锁定');if(!input||Object.keys(input).length)throw Error('不接受参数');return {tasks:data.tasks.map(({id,title,course,due,status,siteId})=>({id,title,course,due,status,siteId}))};}},
  {name:'start_task_creation',description:'Open the homework form; the user reviews and saves it.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){if(!unlocked)throw Error('资料库已锁定');if(!input||Object.keys(input).length)throw Error('不接受参数');openTask();return {opened:true};}}
 ];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

$('#ptaToolBtn').onclick=()=>{const code=StudyDeskPTA.bookmark();$('#ptaBookmark').href=code;$('#ptaBookmarkCode').value=code;$('#ptaToolDialog').showModal();};
$('#copyPtaBookmark').onclick=()=>copy($('#ptaBookmarkCode').value);
