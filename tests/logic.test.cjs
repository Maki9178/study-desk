'use strict';
const assert=require('node:assert/strict');
const core=require('../core.js');
const snapshot={schemaVersion:1,sites:[],tasks:[],custom:{future:'retained'}};
const migrated=core.migrateState(snapshot);assert.deepEqual(migrated,snapshot);migrated.custom.future='changed';assert.equal(snapshot.custom.future,'retained');
assert.throws(()=>core.migrateState({...snapshot,schemaVersion:2}));
const task={siteId:'a',title:'物理  练习',due:'2026-10-08T23:59+08:00',externalId:'42',status:'done'};
assert(core.duplicateOf([task],{...task,title:'different title',externalId:'42'}));
assert(!core.duplicateOf([task],{...task,siteId:'b'}));
assert(!core.duplicateOf([task],{...task,externalId:'43'}));
assert(core.duplicateOf([task],{...task,externalId:null,title:' 物理 练习 ',due:'2026-10-08T15:59:00Z'}));
const preview=core.previewCandidates([task],[{...task,externalId:null},{...task,externalId:null,due:'2026-10-09T15:59:00Z'},{...task,externalId:null,due:'2026-10-09T15:59:00Z'}]);
assert(preview[0].duplicate);assert(preview[1].possibleDuplicate);assert(preview[2].duplicate);
const merged=core.mergeTasks([task],preview);assert.equal(merged.added.length,1);assert.equal(merged.skipped,2);assert.equal(task.status,'done');
const now=Date.parse('2026-10-03T00:00:00Z'),make=(id,h,status='open')=>({id,title:id,due:h==null?'':new Date(now+h*3600000).toISOString(),status});
const ordered=core.sortTasks([make('later',170),make('unknown',null),make('week',168),make('soon',72),make('today',24),make('late',-1),make('done',-2,'done')],now);
assert.deepEqual(ordered.map(x=>x.id),['late','today','soon','week','unknown','later','done']);
assert.equal(core.priority(make('24-plus',24.01),now),2);assert.equal(core.priority(make('72-plus',72.01),now),3);assert.equal(core.priority(make('7-plus',168.01),now),5);
assert.deepEqual(core.suggestions(ordered,now).map(x=>x.id),['late','today','soon']);
console.log('PASS: extension-preserving migration, source-ID deduplication, candidate markers, priority boundaries and three recommendations');

// Calendar-day buckets must survive UTC offsets and daylight-saving transitions.
process.env.TZ='Asia/Shanghai';
const fixture=[
 {title:'今天',due:'2026-10-15T01:00:00+08:00',status:'doing',est:'30'},
 {title:'今天未估',due:'2026-10-15T23:59:00+08:00',status:'open',est:''},
 {title:'昨天',due:'2026-10-14T23:59:00+08:00',status:'open'},
 {title:'已完成',due:'2026-10-15T12:00:00+08:00',status:'done',est:500},
 {title:'最后一天',due:'2026-10-21T23:59:00+08:00',status:'open',est:20},
 {title:'第八天',due:'2026-10-22T00:00:00+08:00',status:'open'},
 {title:'未设截止',due:'',status:'open'},
];
const before=structuredClone(fixture),week=core.weekWorkload(fixture,new Date('2026-10-15T12:00:00+08:00'));
assert.deepEqual(week.days[0],{date:'2026-10-15',count:2,minutes:30,unknown:1});
assert.equal(week.days[6].count,1);assert.equal(week.overdue,1);assert.equal(week.undated,1);
assert.equal(week.days.reduce((n,d)=>n+d.count,0),3);assert.deepEqual(fixture,before);
process.env.TZ='America/New_York';
const dst=core.weekWorkload([{due:'2026-11-02T00:30:00-05:00',status:'open',est:45}],new Date('2026-10-31T12:00:00-04:00'));
assert.deepEqual(dst.days.map(d=>d.date),['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);
assert.equal(dst.days[2].count,1);
console.log('PASS: seven local calendar days, DST boundary, completed exclusions, unknown estimates and input retention');
