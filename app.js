const R=window.RACES||[];
const $=id=>document.getElementById(id);
const MS=86400000;

const groups={
  "수도권":["서울","경기","인천"],
  "충청권":["대전","세종","충남","충북"],
  "전라권":["광주","전남","전북"],
  "경상권":["부산","대구","울산","경남","경북"],
  "강원권":["강원"],
  "제주권":["제주"]
};
const provinceOrder=["서울","경기","인천","대전","세종","충남","충북","광주","전남","전북","부산","대구","울산","경남","경북","강원","제주"];

let selectedMonth=9;
let favOnly=false;
let applied=null;
let favs=new Set(JSON.parse(localStorage.getItem('race-favs')||'[]'));

const pad=n=>String(n).padStart(2,'0');
function localToday(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function parse(s){if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function diff(s){const d=parse(s);return d?Math.ceil((d-localToday())/MS):null}
function dlabel(n){if(n===null)return '날짜 미확인';if(n<0)return `D+${Math.abs(n)}`;if(n===0)return 'D-DAY';return `D-${n}`}
function regState(r){
  if(r.name.includes('[취소]'))return 'cancel';
  const rs=diff(r.registrationStart),re=diff(r.registrationEnd),rd=diff(r.date);
  if(r.registrationEnd&&parse(r.registrationEnd)>parse(r.date))return 'check';
  if(r.registrationEnd){if(re<0)return 'closed';if(rs!==null&&rs>0)return 'upcoming';return re<=7?'soon':'open'}
  if(r.registrationType==='선착순'&&rd>=0)return 'open';
  return 'unknown';
}
function regLabel(r){
  const s=regState(r),n=diff(r.registrationEnd);
  if(s==='cancel')return '취소';
  if(s==='check')return '확인 필요';
  if(s==='closed')return '접수마감';
  if(s==='upcoming')return '접수예정';
  if(r.registrationEnd)return dlabel(n);
  if(r.registrationType==='선착순')return '선착순';
  return '마감일 미확인';
}
function groupOf(p){return Object.keys(groups).find(g=>groups[g].includes(p))||'기타'}
function matchesDist(r,v){if(!v)return true;const d=r.distances.toUpperCase();if(v==='TRAIL')return /[2-9][0-9]K|100K|TRAIL|트레일/.test(d)&&!d.includes('FULL');return d.includes(v)}
function fmtDate(s){const d=parse(s),w='일월화수목금토'[d.getDay()];return `${d.getMonth()+1}월 ${d.getDate()}일(${w})`}
function setDirty(on=true){$('applyHint').hidden=!on;$('applyBtn').classList.toggle('dirty',on)}

function init(){
  const t=localToday();
  $('todayText').textContent=`오늘 ${t.getFullYear()}.${pad(t.getMonth()+1)}.${pad(t.getDate())} · 9~12월 통합 일정`;

  $('monthTabs').innerHTML=[9,10,11,12].map(m=>`<button data-m="${m}">${m}월</button>`).join('');
  document.querySelectorAll('#monthTabs button').forEach(b=>b.onclick=()=>{selectedMonth=+b.dataset.m;paintMonthTabs();setDirty()});

  $('groupFilter').innerHTML='<option value="">전체 권역</option>'+Object.keys(groups).map(x=>`<option value="${x}">${x}</option>`).join('');
  $('groupFilter').value='전라권';
  syncProvince(true);

  $('groupFilter').onchange=()=>{syncProvince(true);setDirty()};
  ['provinceFilter','distanceFilter','daysFilter','regFilter','sortFilter'].forEach(id=>$(id).onchange=()=>setDirty());
  $('searchInput').oninput=()=>setDirty();
  $('favOnly').onclick=()=>{favOnly=!favOnly;$('favOnly').classList.toggle('active',favOnly);setDirty()};
  $('applyBtn').onclick=()=>applyFilters();
  $('resetBtn').onclick=()=>resetFilters();
  $('refreshBtn').onclick=()=>location.reload();
  $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')applyFilters()});

  paintMonthTabs();
  applied=readControls();
  render();
  setDirty(false);

  if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{})}
}

function paintMonthTabs(){
  document.querySelectorAll('#monthTabs button').forEach(b=>b.classList.toggle('active',+b.dataset.m===selectedMonth));
}

function syncProvince(resetSelection=false){
  const g=$('groupFilter').value;
  let ps=g?groups[g]:provinceOrder.filter(p=>R.some(r=>r.province===p));
  const old=resetSelection?'':$('provinceFilter').value;
  $('provinceFilter').innerHTML='<option value="">전체 지역</option>'+ps.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(old&&ps.includes(old))$('provinceFilter').value=old;
  else $('provinceFilter').value='';
}

function readControls(){
  return {
    month:selectedMonth,
    group:$('groupFilter').value,
    province:$('provinceFilter').value,
    distance:$('distanceFilter').value,
    days:$('daysFilter').value,
    reg:$('regFilter').value,
    sort:$('sortFilter').value,
    q:$('searchInput').value.trim().toLowerCase(),
    favOnly
  };
}

function applyFilters(){applied=readControls();render();setDirty(false);$('list').scrollIntoView({behavior:'smooth',block:'start'})}

function resetFilters(){
  selectedMonth=9;
  $('groupFilter').value='전라권';
  syncProvince(true);
  $('distanceFilter').value='';
  $('daysFilter').value='';
  $('regFilter').value='';
  $('sortFilter').value='race';
  $('searchInput').value='';
  favOnly=false;
  $('favOnly').classList.remove('active');
  paintMonthTabs();
  applied=readControls();
  render();
  setDirty(false);
}

function querySummary(a){
  const parts=[`${a.month}월`,a.group||'전체 권역',a.province||'전체 지역'];
  if(a.distance)parts.push(a.distance==='TRAIL'?'트레일·울트라':a.distance);
  if(a.days)parts.push(`${a.days}일 이내`);
  if(a.reg){const labels={open:'접수중',soon:'마감 7일↓',upcoming:'접수예정',closed:'접수마감',unknown:'마감일 미확인'};parts.push(labels[a.reg]||a.reg)}
  if(a.favOnly)parts.push('★ 관심대회');
  return parts.join(' · ');
}

function render(){
  const a=applied||readControls();
  let arr=R.filter(r=>parse(r.date).getMonth()+1===a.month);
  arr=arr.filter(r=>(!a.group||groupOf(r.province)===a.group)&&(!a.province||r.province===a.province)&&matchesDist(r,a.distance)&&(!a.days||(diff(r.date)>=0&&diff(r.date)<=+a.days))&&(!a.reg||regState(r)===a.reg)&&(!a.q||(r.name+' '+r.venue+' '+r.province).toLowerCase().includes(a.q))&&(!a.favOnly||favs.has(r.id)));

  if(a.sort==='reg')arr.sort((x,y)=>{let A=diff(x.registrationEnd),B=diff(y.registrationEnd);A=A===null?9999:A;B=B===null?9999:B;return A-B||diff(x.date)-diff(y.date)});
  else arr.sort((x,y)=>x.date.localeCompare(y.date)||x.name.localeCompare(y.name));

  $('currentQuery').textContent=`현재 조회 · ${querySummary(a)}`;
  $('countAll').textContent=arr.length;
  $('countOpen').textContent=arr.filter(r=>['open','soon'].includes(regState(r))).length;
  $('countSoon').textContent=arr.filter(r=>regState(r)==='soon').length;
  $('countFav').textContent=favs.size;
  $('list').innerHTML=arr.map(card).join('');
  $('empty').hidden=arr.length>0;

  document.querySelectorAll('.fav').forEach(b=>b.onclick=()=>{
    const id=b.dataset.id;
    if(favs.has(id))favs.delete(id);else favs.add(id);
    localStorage.setItem('race-favs',JSON.stringify([...favs]));
    render();
  });
}

function card(r){
  const rd=diff(r.date),rs=regState(r);
  let regClass='reg';if(rs==='soon')regClass='warn';if(['closed','check'].includes(rs))regClass='danger';
  const period=r.registrationStart&&r.registrationEnd?`${r.registrationStart.replaceAll('-','.')} ~ ${r.registrationEnd.replaceAll('-','.')}`:r.registrationType;
  const sourceUrl=s=>s==='고러닝'?'https://gorunning.kr/':s==='마라톤온라인'?'http://www.marathon.pe.kr/':'https://www.marathonplus.co.kr/';
  const src=r.source.map(s=>`<a href="${sourceUrl(s)}" target="_blank" rel="noopener">${s}</a>`).join(' · ');
  const note=(r.note||rs==='check')?`<span class="flag">정보확인</span>`:'';
  return `<article class="card ${rs==='cancel'?'cancel':''}"><div class="cardtop"><div><div class="date">${fmtDate(r.date)} ${r.time||''} · ${r.province} · ${groupOf(r.province)}</div><div class="title">${r.name}</div><div class="place">📍 ${r.venue}</div></div><button class="fav ${favs.has(r.id)?'on':''}" data-id="${r.id}" aria-label="관심대회">★</button></div><div class="badges"><div class="dday"><small>대회까지</small><strong>${dlabel(rd)}</strong></div><div class="dday ${regClass}"><small>접수마감까지</small><strong>${regLabel(r)}</strong></div></div><div class="dist">${r.distances.split(',').map(x=>`<span>${x}</span>`).join('')}</div><div class="meta"><div><b>접수</b> ${period||'확인 필요'}</div></div><div class="source">출처 ${src}${note}</div></article>`;
}

init();
