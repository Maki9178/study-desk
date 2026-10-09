'use strict';
(function(root){
 // Reads visible PTA cards only. No network, cookies, passwords, or hidden app state.
 function capture(doc,loc){
  if(loc.hostname!=='pintia.cn')throw Error('请在 PTA 作业列表或作业概览页使用');
  function deadline(text){
   const m=text.match(/(?:关闭时间[:：]?|将于|答题结束时间)\s*(20\d{2})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
   if(!m)return '';
   const stamp=m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+(m[6]||'00')+'+08:00',d=new Date(stamp);
   if(Number.isNaN(d.getTime())||+m[4]>23||+m[5]>59||+m[6]>59||new Date(d.getTime()+8*3600000).toISOString().slice(0,10)!==stamp.slice(0,10))throw Error('PTA 截止日期无效');
   return d.toISOString();
  }
  const tasks=[],seen=new Set();
  function add(id,title,text,overview){
   if(seen.has(id)||!title.trim())return;seen.add(id);
   const due=deadline(text),progress=overview&&text.match(/(\d+)\s*%\s*答题进度/);
   tasks.push({id:'pta:'+id,title:title.trim(),platformId:'pta',course:'',due,status:overview&&/答题中/.test(text)?'doing':'todo',url:'https://pintia.cn/problem-sets/'+id+'/exam/overview',note:(due?'PTA 页面读取；北京时间。':'页面仅有相对时间或未显示截止，请打开概览核对后手动填写。')+(progress?' 答题进度 '+progress[1]+'%；不自动标记完成。':''),est:''});
  }
  const overview=loc.pathname.match(/^\/problem-sets\/(\d+)\/exam\/overview\/?$/);
  if(overview){add(overview[1],doc.title.replace(/^概览\s*-\s*/,''),doc.body.innerText,true);}
  else{
   for(const a of doc.querySelectorAll('a[href]')){
    const u=new URL(a.getAttribute('href'),loc.href),m=u.pathname.match(/^\/problem-sets\/(\d+)\/(?:overview|exam)\/?$/),text=a.innerText;
    if(u.hostname!=='pintia.cn'||!m||!/(?:关闭时间|将于[\s\S]*关闭)/.test(text))continue;
    const titled=a.querySelector('[title]'),title=titled?.getAttribute('title')||text.split(/(?:关闭时间|将于)/)[0];add(m[1],title,text,false);
   }
  }
  if(!tasks.length)throw Error('未找到可见的课程作业。请打开 PTA 首页、活跃题目集或作业概览；列表只读取当前页。');
  return {version:1,platforms:[{id:'pta',name:'拼题A PTA（程序设计上机练习和作业）',url:'https://pintia.cn/',login:'使用 Edge 登录',note:''}],tasks,settings:{}};
 }
 function bookmark(){return 'javascript:'+encodeURIComponent('void(function(){try{const data=('+capture.toString()+')(document,location);const href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=href;a.download="PTA作业.json";a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);alert("已读取 "+data.tasks.length+" 份作业。到课桌的导入平台作业 JSON 中预览追加。无精确截止时间的作业请核对。");}catch(e){alert(e.message);}})()');}
 const api={capture,bookmark};root.StudyDeskPTA=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
