'use strict';
(function(root){
 function migrateState(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.sites)||!Array.isArray(value.tasks))throw Error('不支持的资料版本或数据结构');
  return structuredClone(value);
 }
 const normalized=value=>String(value||'').trim().replace(/\s+/g,' ');
 function duplicateOf(existing,candidate){
  return existing.find(task=>{
   if((task.siteId||'')!==(candidate.siteId||''))return false;
   if(task.externalId&&candidate.externalId)return task.externalId===candidate.externalId;
   return normalized(task.title)===normalized(candidate.title)&&(task.due?new Date(task.due).toISOString():'')===(candidate.due?new Date(candidate.due).toISOString():'');
  });
 }
 function previewCandidates(existing,incoming){
  const accepted=[];return incoming.map(task=>{
   const exact=duplicateOf(existing.concat(accepted),task);
   const possible=!exact&&existing.concat(accepted).some(x=>(x.siteId||'')===(task.siteId||'')&&normalized(x.title)===normalized(task.title));
   if(!exact)accepted.push(task);return {...task,duplicate:!!exact,possibleDuplicate:possible};
  });
 }
 function mergeTasks(existing,incoming){
  const added=[];let skipped=0;for(const task of incoming){if(duplicateOf(existing.concat(added),task)){skipped++;continue;}added.push(task);}return {added,skipped};
 }
 function priority(task,now=Date.now()){
  if(task.status==='done')return 6;if(!task.due)return 4;
  const left=new Date(task.due).getTime()-Number(now);
  return left<0?0:left<=86400000?1:left<=72*3600000?2:left<=7*86400000?3:5;
 }
 function sortTasks(tasks,now=Date.now()){
  return tasks.slice().sort((a,b)=>priority(a,now)-priority(b,now)||((a.due?new Date(a.due).getTime():Infinity)-(b.due?new Date(b.due).getTime():Infinity))||normalized(a.title).localeCompare(normalized(b.title),'zh-CN'));
 }
 function suggestions(tasks,now=Date.now()){return sortTasks(tasks.filter(x=>x.status!=='done'),now).slice(0,3);}
 const api={migrateState,duplicateOf,previewCandidates,mergeTasks,priority,sortTasks,suggestions};
 root.StudyDeskCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
