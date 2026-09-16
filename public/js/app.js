import {
  initStore, onAuthChange, currentUser, sendMagicLink, signOut,
  fetchRecords, addRecord, removeRecord, removeAllRecords, importRecords,
  migrateLegacyRecords, hasLegacyRecords,
} from './store.js';

/* ---------- constants & state ---------- */
var WD = ['일','월','화','수','목','금','토'];
var CLUB_ORDER = ['드라이버','3W','3U','5I','6I','7I','8I','9I','PW','AW','SW','LW'];

var records = [];
var state = { view:'calendar', y:0, m:0, selectedDate:null, selectedClub:null, lastClub:'', pendingDel:null };
var sheetState = null;
var saving = false;        // 저장 중 중복 실행 막기 (버튼 연타 / 음성 중복 인식)
var enteredFor = null;     // 이미 진입한 사용자 id (auth 이벤트 중복 방지)

/* ---------- helpers ---------- */
function esc(s){return String(s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad(n){return String(n).padStart(2,'0');}
function ymd(dt){return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function todayStr(){return ymd(new Date());}
function parseYmd(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function longDate(s){var d=parseYmd(s);return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+WD[d.getDay()]+')';}
function clubRank(c){var i=CLUB_ORDER.indexOf(c);return i<0?999:i;}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function fmtNum(n){if(n==null||isNaN(n))return '—';return Number.isInteger(n)?String(n):String(+n.toFixed(1));}
function fmt1(n){return (n==null||isNaN(n))?'—':(+n).toFixed(1);}
function fmt2(n){return (n==null||isNaN(n))?'—':(+n).toFixed(2);}
function smashOf(r){return r.head>0 ? r.ball/r.head : NaN;}
function averages(shots){
  var n=shots.length; if(!n) return null;
  var b=0,h=0,d=0,s=0,sc=0;
  shots.forEach(function(r){b+=r.ball;h+=r.head;d+=r.dist;var sm=smashOf(r);if(!isNaN(sm)){s+=sm;sc++;}});
  return {ball:b/n, head:h/n, dist:d/n, smash: sc?s/sc:NaN, n:n};
}

/* ---------- storage ----------
   기록의 원본은 Supabase에 있습니다. 아래 records는 화면을 그리기 위한 사본이고,
   추가/삭제는 항상 DB에 먼저 반영한 뒤 사본을 고칩니다.
   실제 통신은 store.js가 담당합니다. */
async function reloadRecords(){
  records = await fetchRecords();
}

/* ---------- toast ---------- */
var toastTimer = null;
function toast(msg, kind){
  var el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg;
  el.className='toast'+(kind==='err'?' err':'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ el.className='toast hidden'; }, kind==='err'?5200:2800);
}
function errMsg(e){ return (e&&e.message)?e.message:'알 수 없는 오류가 발생했습니다.'; }

/* ---------- views ---------- */
function renderTopbar(){
  if(state.view==='calendar'){
    return '<div class="tb-cal"><div class="tb-title"><div class="eyebrow">SWING LOG</div>'+
      '<h1>골프 스윙 기록</h1></div>'+
      '<button class="tb-btn" data-action="openData">데이터</button></div>';
  }
  if(state.view==='data'){
    return '<div class="tb-sub"><button class="back" data-action="back" aria-label="뒤로">‹</button>'+
      '<div class="t"><div class="h">데이터 관리</div><div class="s">계정 · 백업</div></div></div>';
  }
  if(state.view==='clubs'){
    var ds=state.selectedDate, cnt=records.filter(function(r){return r.date===ds;}).length;
    return '<div class="tb-sub"><button class="back" data-action="back" aria-label="뒤로">‹</button>'+
      '<div class="t"><div class="h">'+longDate(ds)+'</div><div class="s">'+
      (ds===todayStr()?'오늘 · ':'')+cnt+'샷</div></div></div>';
  }
  var d=state.selectedDate, club=state.selectedClub;
  var c=records.filter(function(r){return r.date===d&&r.club===club;}).length;
  return '<div class="tb-sub"><button class="back" data-action="back" aria-label="뒤로">‹</button>'+
    '<div class="t"><div class="h">'+esc(club)+'</div><div class="s">'+longDate(d)+' · '+c+'샷</div></div></div>';
}

function calendarView(){
  var y=state.y, m=state.m;
  var startDow=new Date(y,m,1).getDay();
  var dim=new Date(y,m+1,0).getDate();
  var counts={};
  records.forEach(function(r){var d=parseYmd(r.date);
    if(d.getFullYear()===y&&d.getMonth()===m) counts[d.getDate()]=(counts[d.getDate()]||0)+1;});
  var daysWith=Object.keys(counts).length;
  var shots=Object.values(counts).reduce(function(a,b){return a+b;},0);

  var cells=''; var i;
  for(i=0;i<startDow;i++) cells+='<div class="day empty"></div>';
  for(var d=1;d<=dim;d++){
    var dstr=y+'-'+pad(m+1)+'-'+pad(d);
    var dow=new Date(y,m,d).getDay();
    var cls=['day'];
    if(dstr===todayStr())cls.push('today');
    if(dstr===state.selectedDate)cls.push('sel');
    if(dow===0)cls.push('sun'); if(dow===6)cls.push('sat');
    cells+='<button class="'+cls.join(' ')+'" data-action="selDate" data-date="'+dstr+'">'+
      '<span class="dnum">'+d+'</span>'+(counts[d]?'<span class="dot"></span>':'')+'</button>';
  }
  var wd=WD.map(function(w,i){var c=i===0?' sun':(i===6?' sat':'');return '<div class="wd'+c+'">'+w+'</div>';}).join('');
  var summary = shots>0
    ? '<div class="summary"><span class="dotb"></span>이번 달 '+daysWith+'일 연습 · '+shots+'샷</div>'
    : '<div class="summary"><span class="dotb"></span>이번 달 기록이 아직 없어요</div>';

  return '<div class="card">'+
      '<div class="cal-head"><button class="nav" data-action="prevMonth" aria-label="이전 달">‹</button>'+
        '<div class="m">'+y+' · '+(m+1)+'월</div>'+
        '<button class="nav" data-action="nextMonth" aria-label="다음 달">›</button></div>'+
      '<div class="cal">'+wd+cells+'</div>'+
    '</div>'+summary+
    '<p class="hint">날짜를 누르면 그날의 클럽별 기록을 볼 수 있어요. 새 기록은 아래 버튼으로 추가하세요.</p>';
}

function clubsView(){
  var date=state.selectedDate;
  var dayRecs=records.filter(function(r){return r.date===date;});
  if(!dayRecs.length){
    return '<div class="empty"><div class="emo">⛳</div><div class="msg">이 날짜엔 아직 기록이 없어요.<br>아래 버튼으로 첫 스윙을 남겨보세요.</div></div>';
  }
  var seen={}, clubs=[];
  dayRecs.forEach(function(r){if(!seen[r.club]){seen[r.club]=1;clubs.push(r.club);}});
  clubs.sort(function(a,b){return (clubRank(a)-clubRank(b))||a.localeCompare(b,'ko');});
  var cards=clubs.map(function(c){
    var shots=dayRecs.filter(function(r){return r.club===c;});
    var a=averages(shots);
    return '<button class="club-card" data-action="selClub" data-club="'+esc(c)+'">'+
      '<div class="cc-l"><div class="name">'+esc(c)+'</div>'+
      '<div class="meta">평균 '+fmt1(a.dist)+'m · 스매시 '+fmt2(a.smash)+'</div></div>'+
      '<div class="cc-r"><span class="count">'+shots.length+'샷</span><span class="chev">›</span></div></button>';
  }).join('');
  return '<div class="section-title">클럽 선택</div><div class="list">'+cards+'</div>';
}

function detailView(){
  var date=state.selectedDate, club=state.selectedClub;
  var shots=records.filter(function(r){return r.date===date&&r.club===club;})
    .sort(function(a,b){return a.createdAt-b.createdAt;});
  if(!shots.length){
    return '<div class="empty"><div class="emo">⛳</div><div class="msg">기록이 없습니다.</div></div>';
  }
  var a=averages(shots);
  var rows=shots.map(function(r,i){
    return '<div class="sc-row"><span class="seq">'+(i+1)+'</span>'+
      '<span class="val">'+fmtNum(r.ball)+'</span>'+
      '<span class="val">'+fmtNum(r.head)+'</span>'+
      '<span class="val">'+fmtNum(r.dist)+'</span>'+
      '<span class="val sf">'+fmt2(smashOf(r))+'</span>'+
      '<button class="del" data-action="delShot" data-id="'+r.id+'" aria-label="삭제">✕</button></div>';
  }).join('');
  return '<div class="panel">'+
      '<div class="eyebrow">'+shots.length+' SHOTS · AVERAGE</div>'+
      '<div class="sf-label">SMASH FACTOR</div>'+
      '<div class="sf">'+fmt2(a.smash)+'</div>'+
      '<div class="divider"></div>'+
      '<div class="subs">'+
        '<div class="sub"><div class="l">볼스피드</div><div class="v">'+fmt1(a.ball)+'</div></div>'+
        '<div class="sub"><div class="l">헤드스피드</div><div class="v">'+fmt1(a.head)+'</div></div>'+
        '<div class="sub"><div class="l">거리</div><div class="v">'+fmt1(a.dist)+'<em>m</em></div></div>'+
      '</div>'+
    '</div>'+
    '<div class="score"><div class="sc-title">샷 기록</div>'+
      '<div class="sc-head"><span>#</span><span>볼</span><span>헤드</span><span>거리</span><span>스매시</span><span></span></div>'+
      rows+
    '</div>';
}

function render(){
  document.getElementById('topbar').innerHTML = renderTopbar();
  var v;
  if(state.view==='calendar') v=calendarView();
  else if(state.view==='clubs') v=clubsView();
  else if(state.view==='data') v=dataView();
  else v=detailView();
  document.getElementById('view').innerHTML = v;
  var pill=document.getElementById('pill');
  if(pill) pill.classList.toggle('hidden', state.view==='data');
  window.scrollTo(0,0);
}

/* ---------- data / backup screen ---------- */
function dataView(){
  var n=records.length;
  var days={}; records.forEach(function(r){ days[r.date]=1; });
  var dayCount=Object.keys(days).length;
  var u=currentUser();
  var legacyNote = hasLegacyRecords()
    ? '<p class="data-note">이 기기에 남아 있던 예전 기록은 로그인할 때 계정으로 옮겨졌어요. 원본은 그대로 두었으니 안심하셔도 됩니다.</p>'
    : '';
  return ''+
    '<div class="data-card account">'+
      '<h3>로그인 계정</h3>'+
      '<p class="acct-mail">'+esc(u?(u.email||''):'')+'</p>'+
      '<p>기록은 이 계정에 저장됩니다. 휴대폰에서 적은 것이 PC에서도 그대로 보이고, 브라우저를 지워도 사라지지 않아요.</p>'+
      '<button class="btn-line" data-action="signOut">로그아웃</button>'+
    '</div>'+
    '<div class="count-line">저장된 기록 '+n+'개 · 연습일 '+dayCount+'일</div>'+
    legacyNote+
    '<div class="data-card">'+
      '<h3>백업 코드 만들기</h3>'+
      '<p>기록 전체를 코드 한 줄로 받아 따로 보관해 둘 수 있어요. 이제는 계정에 저장되니 평소엔 필요 없고, 전체 삭제 전이나 다른 계정으로 옮길 때만 쓰세요.</p>'+
      '<button class="btn-primary" data-action="exportData">코드 만들어 공유 / 복사</button>'+
      '<textarea id="export-out" readonly placeholder="여기에 백업 코드가 표시됩니다." style="margin-top:10px;"></textarea>'+
      '<div id="export-msg" class="data-msg"></div>'+
    '</div>'+
    '<div class="data-card">'+
      '<h3>코드로 가져오기</h3>'+
      '<p>예전 버전을 쓰던 다른 기기의 코드나 백업해 둔 코드를 붙여넣으면 지금 계정에 합쳐집니다. 같은 코드를 여러 번 넣어도 중복되지 않아요.</p>'+
      '<textarea id="import-in" placeholder="내보내기로 만든 코드를 여기에 붙여넣으세요."></textarea>'+
      '<button class="btn-line" data-action="importData">가져오기</button>'+
      '<div id="import-msg" class="data-msg"></div>'+
    '</div>'+
    '<div class="data-card">'+
      '<h3>사진으로 입력 <span class="ex-badge">예시 데이터</span></h3>'+
      '<p>사진 속 계기판 숫자를 자동으로 읽어 볼스피드·헤드스피드·거리를 채우는 기능이에요. 다음 차시에 제공될 예정이며, 아래는 완성 화면을 보여주는 예시입니다.</p>'+
      '<button class="btn-line" data-action="openImageDemo">예시 화면 보기</button>'+
    '</div>'+
    '<div class="data-card danger">'+
      '<h3>전체 기록 삭제</h3>'+
      '<p>이 계정에 저장된 모든 연습 기록을 서버에서 지웁니다. 되돌릴 수 없으니, 필요하면 먼저 백업 코드를 만들어 두세요.</p>'+
      '<button class="btn-danger" style="width:100%;" data-action="clearAll">전체 기록 삭제</button>'+
    '</div>';
}

/* ---------- add sheet ---------- */
function openAddSheet(pre){
  pre = pre || {};
  var seed = pre.club || state.lastClub || '';
  var preset = seed && CLUB_ORDER.indexOf(seed)>=0;
  sheetState = { date: pre.date||todayStr(), club: seed, isCustom: !!(seed && !preset),
                 pickerOpen: !seed, savedCount: 0 };

  var html =
  '<div class="sheet" role="dialog" aria-label="기록 추가">'+
    '<div class="sheet-head"><h2>기록 추가</h2><button class="x" data-action="closeSheet" aria-label="닫기">✕</button></div>'+
    '<label class="fld"><span>날짜</span><input id="f-date" type="date" value="'+sheetState.date+'"></label>'+
    '<div class="fld"><span>클럽</span><div id="f-club"></div></div>'+
    '<div class="grid2">'+
      '<label class="fld"><span>볼스피드</span><input id="f-ball" type="number" inputmode="decimal" step="0.1" placeholder="0"></label>'+
      '<label class="fld"><span>헤드스피드</span><input id="f-head" type="number" inputmode="decimal" step="0.1" placeholder="0"></label>'+
    '</div>'+
    '<label class="fld"><span>거리 <em>m</em></span><input id="f-dist" type="number" inputmode="decimal" step="0.1" placeholder="0"></label>'+
    '<div class="smash-live"><span>스매시팩터</span><strong id="f-smash">—</strong></div>'+
    '<div class="voice">'+
      '<button id="mic" class="mic" data-action="voiceToggle">🎤 음성으로 입력</button>'+
      '<div id="voice-status" class="voice-status hidden"></div>'+
      '<p class="voice-hint">이어폰을 끼고 볼·헤드·거리를 순서대로 말한 뒤 "저장"이라고 하면 저장돼요. (예: "육십오, 사십오, 이백십오, 저장")</p>'+
    '</div>'+
    '<p id="f-saved" class="saved-note hidden"></p>'+
    '<p id="f-err" class="err hidden"></p>'+
    '<button class="save" data-action="save">저장하고 계속</button>'+
    '<button class="btn-ghost" data-action="doneAdd">완료</button>'+
  '</div>';

  var ov=document.getElementById('overlay');
  ov.innerHTML=html; ov.classList.remove('hidden'); document.body.classList.add('noscroll');
  renderClubField();
  bindSheet();
  if(!sheetState.pickerOpen){ var bEl=ov.querySelector('#f-ball'); if(bEl) bEl.focus(); }
}

/* Club field renders compact (a picked club + 변경) or the full chip picker,
   and can be re-rendered on its own without touching the number inputs. */
function clubFieldHTML(){
  if(!sheetState.pickerOpen && sheetState.club){
    return '<div class="club-picked"><span class="cp-name">'+esc(sheetState.club)+'</span>'+
      '<button class="change-club" data-action="changeClub">변경</button></div>';
  }
  var chips = CLUB_ORDER.map(function(c){
    var on = (!sheetState.isCustom && sheetState.club===c) ? ' active' : '';
    return '<button class="chip'+on+'" data-action="chip" data-club="'+esc(c)+'">'+esc(c)+'</button>';
  }).join('');
  return '<div class="chips">'+chips+'</div>'+
    '<div id="f-custom-wrap" class="'+(sheetState.isCustom?'':'hidden')+'">'+
    '<input id="f-custom" type="text" placeholder="예: 2H, 60도 웨지" value="'+(sheetState.isCustom?esc(sheetState.club):'')+'"></div>';
}
function renderClubField(){
  var host=document.getElementById('f-club');
  if(!host) return;
  host.innerHTML=clubFieldHTML();
  var cu=host.querySelector('#f-custom');
  if(cu){ cu.addEventListener('input',function(){ sheetState.club=cu.value.trim(); }); }
}

function bindSheet(){
  var ov=document.getElementById('overlay');
  var b=ov.querySelector('#f-ball'), h=ov.querySelector('#f-head'), sm=ov.querySelector('#f-smash');
  function upd(){var bv=parseFloat(b.value),hv=parseFloat(h.value);
    sm.textContent=(bv>0&&hv>0)?(bv/hv).toFixed(2):'—';}
  if(b&&h){b.addEventListener('input',upd);h.addEventListener('input',upd);}
}

async function doSave(){
  if(saving) return false;
  var ov=document.getElementById('overlay');
  if(!sheetState) return false;
  var err=ov.querySelector('#f-err');
  var bEl=ov.querySelector('#f-ball'), hEl=ov.querySelector('#f-head'),
      dEl=ov.querySelector('#f-dist'), dateEl=ov.querySelector('#f-date');
  if(!bEl||!hEl||!dEl||!dateEl) return false;
  [bEl,hEl,dEl].forEach(function(x){x.classList.remove('invalid');});
  err.classList.add('hidden'); err.textContent='';

  var cuEl=ov.querySelector('#f-custom');
  var club = sheetState.isCustom ? (cuEl?cuEl.value.trim():sheetState.club) : sheetState.club;
  var date = dateEl.value || todayStr();
  var b=parseFloat(bEl.value), h=parseFloat(hEl.value), d=parseFloat(dEl.value);

  // await 이후에는 시트가 닫혔을 수 있어서, 요소를 보관하지 않고 매번 다시 찾습니다.
  function fail(msg,sel){
    var e2=ov.querySelector('#f-err');
    if(!e2){ toast(msg,'err'); return; }
    e2.textContent=msg; e2.classList.remove('hidden');
    var el=sel?ov.querySelector(sel):null;
    if(el){ el.classList.add('invalid'); el.focus(); }
  }
  if(!club){ sheetState.pickerOpen=true; renderClubField(); fail('클럽을 먼저 선택하세요.'); return false; }
  if(!(b>0)){fail('볼스피드를 입력하세요.','#f-ball');return false;}
  if(!(h>0)){fail('헤드스피드를 입력하세요.','#f-head');return false;}
  if(!(d>0)){fail('거리를 입력하세요.','#f-dist');return false;}

  var btn=ov.querySelector('[data-action="save"]');
  saving=true;
  if(btn){ btn.disabled=true; btn.textContent='저장 중…'; }
  var saved;
  try{
    saved=await addRecord({date:date, club:club, ball:b, head:h, dist:d});
  }catch(e){
    fail(errMsg(e));
    return false;
  }finally{
    saving=false;
    var btn2=ov.querySelector('[data-action="save"]');
    if(btn2){ btn2.disabled=false; btn2.textContent='저장하고 계속'; }
  }

  records.push(saved);
  state.lastClub=club; state.selectedDate=date; state.selectedClub=club;
  if(!sheetState) return true;            // 저장하는 동안 시트가 닫혔으면 여기까지
  sheetState.club=club; sheetState.savedCount++; sheetState.pickerOpen=false;

  // keep club & date, clear only the numbers so the next shot is ready
  var b2=ov.querySelector('#f-ball'), h2=ov.querySelector('#f-head'), d2=ov.querySelector('#f-dist');
  if(!b2||!h2||!d2) return true;
  b2.value=''; h2.value=''; d2.value='';
  var sm=ov.querySelector('#f-smash'); if(sm) sm.textContent='—';
  renderClubField();
  var note=ov.querySelector('#f-saved');
  if(note){ note.textContent='✓ '+sheetState.savedCount+'개 저장됨 · 이어서 입력하세요'; note.classList.remove('hidden'); }
  b2.focus();
  return true;
}

function finishAdd(){
  var saved = !!(sheetState && sheetState.savedCount>0);
  closeOverlay();
  if(saved) state.view='detail';
  render();
}

/* ---------- backup: export / import / clear ---------- */
function encodeBackup(){
  var payload=JSON.stringify({app:'gsl',v:1,records:records});
  return 'GSL1:'+btoa(unescape(encodeURIComponent(payload)));
}
function decodeBackup(code){
  var s=String(code).trim().replace(/\s+/g,'');
  if(s.indexOf('GSL1:')!==0) return {ok:false,err:'코드 형식이 올바르지 않아요. "GSL1:"로 시작하는 코드 전체를 붙여넣어 주세요.'};
  try{
    var json=decodeURIComponent(escape(atob(s.slice(5))));
    var obj=JSON.parse(json);
    var recs=Array.isArray(obj)?obj:(obj&&obj.records);
    if(!Array.isArray(recs)) return {ok:false,err:'코드에서 기록을 찾지 못했어요. 내보내기로 만든 코드인지 확인해 주세요.'};
    var clean=recs.filter(function(r){ return r&&r.date&&r.club&&isFinite(+r.ball)&&isFinite(+r.head)&&isFinite(+r.dist); })
      .map(function(r){ return {id:r.id||uid(),date:String(r.date),club:String(r.club),
        ball:+r.ball,head:+r.head,dist:+r.dist,createdAt:r.createdAt||Date.now()}; });
    return {ok:true,records:clean};
  }catch(e){ return {ok:false,err:'코드를 해석할 수 없어요. 전체 코드를 다시 복사해 붙여넣어 주세요.'}; }
}
function fallbackCopy(text){
  try{
    var out=document.getElementById('export-out');
    if(out){ out.focus(); out.select(); if(out.setSelectionRange) out.setSelectionRange(0,text.length); }
    return !!(document.execCommand&&document.execCommand('copy'));
  }catch(e){ return false; }
}
function copyText(text,msg,okText){
  function done(ok){ if(!msg) return;
    if(ok){ msg.className='data-msg ok'; msg.textContent=okText; }
    else { msg.className='data-msg err'; msg.textContent='자동 복사가 안 됐어요. 위 코드 칸을 길게 눌러 전체 선택한 뒤 복사해 주세요.'; } }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){done(true);},function(){done(fallbackCopy(text));});
    }else{ done(fallbackCopy(text)); }
  }catch(e){ done(fallbackCopy(text)); }
}
function exportData(){
  var msg=document.getElementById('export-msg'), out=document.getElementById('export-out');
  if(!records.length){ if(msg){msg.className='data-msg err'; msg.textContent='내보낼 기록이 없어요. 먼저 스윙 기록을 추가해 주세요.';} return; }
  var code=encodeBackup();
  if(out) out.value=code;
  if(navigator.share){
    navigator.share({title:'골프 스윙 기록',text:code}).then(function(){
      if(msg){msg.className='data-msg ok'; msg.textContent='공유 창을 열었어요. 다른 기기로 코드를 보낸 뒤 "가져오기"에 붙여넣으세요.';}
    }).catch(function(){ copyText(code,msg,'공유를 닫아서 코드를 복사했어요. 다른 기기의 "가져오기"에 붙여넣으세요.'); });
  }else{
    copyText(code,msg,'이 기기는 공유를 지원하지 않아 코드를 복사했어요. 다른 기기의 "가져오기"에 붙여넣으세요.');
  }
}
async function importData(){
  var msg=document.getElementById('import-msg'), inp=document.getElementById('import-in');
  var raw=inp?inp.value:'';
  if(!raw||!raw.trim()){ if(msg){msg.className='data-msg err'; msg.textContent='코드가 비어 있어요. 다른 기기의 "내보내기"에서 만든 코드를 붙여넣어 주세요.';} return; }
  var res=decodeBackup(raw);
  if(!res.ok){ if(msg){msg.className='data-msg err'; msg.textContent=res.err;} return; }

  var btn=document.querySelector('[data-action="importData"]');
  if(btn){ btn.disabled=true; btn.textContent='가져오는 중…'; }
  var added=0;
  try{
    added=await importRecords(res.records);
    await reloadRecords();
  }catch(e){
    var me=document.getElementById('import-msg');
    if(me){ me.className='data-msg err'; me.textContent=errMsg(e); }
    return;
  }finally{
    var b2=document.querySelector('[data-action="importData"]');
    if(b2){ b2.disabled=false; b2.textContent='가져오기'; }
  }

  render();   // 가져온 것까지 포함해 개수를 다시 그립니다
  var mo=document.getElementById('import-msg');
  if(mo){ mo.className='data-msg ok';
    mo.textContent = added>0 ? (added+'개를 계정에 추가했어요. 이제 총 '+records.length+'개 기록이 있어요.')
                             : '새로 가져올 기록이 없어요. 이미 모두 저장되어 있어요.'; }
}
function openClearConfirm(){
  var html='<div class="sheet confirm" role="dialog" aria-label="전체 삭제">'+
    '<h2>모든 기록을 삭제할까요?</h2><p class="sub">이 기기의 연습 기록 '+records.length+'개가 모두 삭제돼요. 되돌릴 수 없어요.</p>'+
    '<div class="grid2"><button class="btn-ghost" data-action="cancelDel">취소</button>'+
    '<button class="btn-danger" data-action="confirmClear">전체 삭제</button></div></div>';
  var ov=document.getElementById('overlay');
  ov.innerHTML=html; ov.classList.remove('hidden'); document.body.classList.add('noscroll');
}
async function doClearAll(){
  var btn=document.querySelector('[data-action="confirmClear"]');
  if(btn){ btn.disabled=true; btn.textContent='삭제 중…'; }
  try{ await removeAllRecords(); }
  catch(e){ closeOverlay(); toast(errMsg(e),'err'); return; }
  records=[]; closeOverlay(); state.view='data'; render();
  toast('모든 기록을 삭제했습니다.');
}
function openImageDemo(){
  var html='<div class="sheet" role="dialog" aria-label="사진으로 입력 예시">'+
    '<div class="sheet-head"><h2>사진으로 입력 <span class="ex-badge">예시 데이터</span></h2>'+
      '<button class="x" data-action="closeSheet" aria-label="닫기">✕</button></div>'+
    '<p class="ex-note">다음 차시에 제공될 기능입니다. 계기판 사진을 자동 인식해 아래처럼 값을 채워 줍니다. 아래 값은 실제 인식 결과가 아니라 예시입니다.</p>'+
    '<div class="demo-shot">'+
      '<div class="ds-t">인식 결과 · 예시 데이터</div>'+
      '<div class="demo-row"><span class="dl">볼스피드</span><span class="dv">65.2</span></div>'+
      '<div class="demo-row"><span class="dl">헤드스피드</span><span class="dv">45.1</span></div>'+
      '<div class="demo-row"><span class="dl">거리</span><span class="dv">214</span></div>'+
      '<div class="demo-row"><span class="dl">스매시팩터</span><span class="dv">1.45</span></div>'+
    '</div>'+
    '<p class="ex-note">완료되면, 이렇게 인식된 값을 확인한 뒤 저장하는 방식으로 동작할 예정입니다.</p>'+
    '<button class="btn-ghost" style="width:100%;margin-top:12px;" data-action="closeSheet">닫기</button>'+
  '</div>';
  var ov=document.getElementById('overlay');
  ov.innerHTML=html; ov.classList.remove('hidden'); document.body.classList.add('noscroll');
}

/* ---------- delete confirm ---------- */
function openConfirm(id){
  state.pendingDel=id;
  var html='<div class="sheet confirm" role="dialog" aria-label="기록 삭제">'+
    '<h2>이 기록을 삭제할까요?</h2><p class="sub">삭제하면 되돌릴 수 없어요.</p>'+
    '<div class="grid2"><button class="btn-ghost" data-action="cancelDel">취소</button>'+
    '<button class="btn-danger" data-action="confirmDel">삭제</button></div></div>';
  var ov=document.getElementById('overlay');
  ov.innerHTML=html; ov.classList.remove('hidden'); document.body.classList.add('noscroll');
}
async function doDelete(){
  var id=state.pendingDel;
  closeOverlay();
  try{ await removeRecord(id); }
  catch(e){ toast(errMsg(e),'err'); return; }
  records=records.filter(function(r){return r.id!==id;});
  var stillClub=records.some(function(r){return r.date===state.selectedDate&&r.club===state.selectedClub;});
  var stillDate=records.some(function(r){return r.date===state.selectedDate;});
  if(!stillClub) state.view = stillDate ? 'clubs' : 'calendar';
  render();
}

function closeOverlay(){
  stopVoice();
  var ov=document.getElementById('overlay');
  ov.classList.add('hidden'); ov.innerHTML='';
  document.body.classList.remove('noscroll');
  sheetState=null; state.pendingDel=null;
}

/* ---------- voice input ---------- */
var audioCtx=null, recog=null, voiceOn=false, speaking=false, voiceBuf=[], lastHeard='', _voices=[], lastFinalIdx=-1;

function ac(){ if(!audioCtx){ try{ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return audioCtx; }
function tone(freq,dur,when,type,gain){
  var c=ac(); if(!c) return;
  var o=c.createOscillator(), g=c.createGain();
  o.type=type||'sine'; o.frequency.value=freq;
  o.connect(g); g.connect(c.destination);
  var t=c.currentTime+(when||0);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(gain||0.22,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.start(t); o.stop(t+dur+0.03);
}
function beepSuccess(){ tone(880,0.12,0,'sine',0.25); tone(1318.5,0.17,0.11,'sine',0.25); }   // rising ding-ding
function beepError(){ tone(311,0.16,0,'square',0.18); tone(207,0.26,0.15,'square',0.18); }      // low double buzz
function beepTick(){ tone(1046.5,0.05,0,'sine',0.14); }                                          // soft tick per number

function loadVoices(){ try{ _voices=window.speechSynthesis.getVoices()||[]; }catch(e){ _voices=[]; } }
function pickKoVoice(){ if(!_voices.length) loadVoices();
  for(var i=0;i<_voices.length;i++){ if((_voices[i].lang||'').toLowerCase().indexOf('ko')===0) return _voices[i]; } return null; }
function speak(text){
  try{
    if(!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    speaking=true;
    var u=new SpeechSynthesisUtterance(text);
    u.lang='ko-KR'; u.rate=1.06;
    var v=pickKoVoice(); if(v) u.voice=v;
    u.onend=function(){ speaking=false; };
    u.onerror=function(){ speaking=false; };
    window.speechSynthesis.speak(u);
    setTimeout(function(){ speaking=false; }, Math.min(6000, 800+text.length*90));
  }catch(e){ speaking=false; }
}

/* Korean spoken-number parsing: handles digits ("65"), Korean words ("육십오"→65,
   "이백십오"→215), and decimals via "점" ("육십오 점 오"→65.5). */
var _UNIT={일:1,이:2,삼:3,사:4,오:5,육:6,륙:6,칠:7,팔:8,구:9};
var _POW={십:10,백:100,천:1000};
function _koreanInt(s){
  if(s==='') return null;
  if(/^\d+$/.test(s)) return parseInt(s,10);
  if(s.indexOf('만')>=0){
    var mp=s.split('만'); var man=(mp[0]===''?1:_koreanInt(mp[0])); var rest=(mp[1]?_koreanInt(mp[1]):0);
    if(man==null||rest==null) return null; return man*10000+rest;
  }
  var total=0, cur=0, any=false;
  for(var i=0;i<s.length;i++){ var ch=s[i];
    if(_UNIT[ch]!=null){ cur=_UNIT[ch]; any=true; }
    else if(_POW[ch]!=null){ cur=(cur===0?1:cur)*_POW[ch]; total+=cur; cur=0; any=true; }
    else if(/\d/.test(ch)){ cur=cur*10+(+ch); any=true; }
    else { return null; }
  }
  total+=cur; return any?total:null;
}
function _fracDigits(s){
  if(s==='') return ''; if(/^\d+$/.test(s)) return s;
  var out=''; for(var i=0;i<s.length;i++){ var ch=s[i];
    if(_UNIT[ch]!=null) out+=_UNIT[ch];
    else if(ch==='영'||ch==='공') out+='0';
    else if(/\d/.test(ch)) out+=ch;
    else return null; }
  return out;
}
function parseSpokenNumber(tok){
  if(tok==null) return null;
  var s=String(tok).replace(/\s+/g,'');
  s=s.replace(/개$|번$|점수$/,'');
  if(s==='') return null;
  if(/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if(s.indexOf('점')>=0){
    var p=s.split('점'); var ip=(p[0]===''?0:_koreanInt(p[0])); var fd=_fracDigits(p[1]||'');
    if(ip==null) return null; return fd?parseFloat(ip+'.'+fd):ip;
  }
  return _koreanInt(s);
}

function setMicUI(on){
  var m=document.getElementById('mic'), s=document.getElementById('voice-status');
  if(m){ m.classList.toggle('on',on);
    m.innerHTML = on ? '<span class="dot-live"></span> 듣는 중 · 탭하여 중지' : '🎤 음성으로 입력'; }
  if(s){ s.classList.toggle('hidden', !on); }
}
function applyBufToInputs(){
  var ids=['f-ball','f-head','f-dist'];
  for(var i=0;i<3;i++){ var el=document.getElementById(ids[i]);
    if(el) el.value=(voiceBuf[i]!=null)?String(voiceBuf[i]):''; }
  var sm=document.getElementById('f-smash');
  if(sm){ var b=voiceBuf[0],h=voiceBuf[1]; sm.textContent=(b>0&&h>0)?(b/h).toFixed(2):'—'; }
}
function fmtSlot(v){ return v!=null?v:'—'; }
function updateVoiceStatus(heard){
  var s=document.getElementById('voice-status'); if(!s) return;
  if(heard!=null) lastHeard=heard;
  var buf='볼 '+fmtSlot(voiceBuf[0])+' · 헤드 '+fmtSlot(voiceBuf[1])+' · 거리 '+fmtSlot(voiceBuf[2]);
  var h=lastHeard?('<div class="heard">들림: '+esc(lastHeard)+'</div>'):'';
  s.innerHTML='<div>볼·헤드·거리 순서로 말하고 "저장"이라고 하세요</div><div class="vbuf">'+buf+'</div>'+h;
}
function voiceWarn(msg){
  var s=document.getElementById('voice-status');
  if(s){ s.classList.remove('hidden'); s.innerHTML='<div class="voice-warn">'+esc(msg)+'</div>'; }
}

function pushVoiceNumber(n){
  if(voiceBuf.length>=3) return;
  if(voiceBuf.indexOf(n)>=0) return;   // ball/head/distance are always distinct → ignore duplicates
  voiceBuf.push(n); applyBufToInputs(); beepTick(); updateVoiceStatus(null);
}
async function voiceCommit(){
  if(saving) return;
  applyBufToInputs();
  var b=voiceBuf[0], h=voiceBuf[1];
  var smash=(b>0&&h>0)?(b/h):null;
  var ok=await doSave();
  if(ok){
    beepSuccess(); voiceBuf=[]; updateVoiceStatus(null);
    speak(smash!=null?('저장. 스매시 '+smash.toFixed(2)):'저장했어요');
  }else{
    beepError();
    var msg='';
    if(voiceBuf.length<3){
      var need=[]; if(voiceBuf[0]==null)need.push('볼스피드');
      if(voiceBuf[1]==null)need.push('헤드스피드'); if(voiceBuf[2]==null)need.push('거리');
      msg=need.join(', ')+'를 말해 주세요';
    }else{
      var e=document.getElementById('f-err'); msg=(e&&e.textContent)?e.textContent:'입력을 확인해 주세요';
    }
    speak(msg); updateVoiceStatus(null);
  }
}
async function processTranscript(text){
  var tokens=String(text).split(/[\s,]+/).filter(Boolean);
  for(var i=0;i<tokens.length;i++){
    var tok=tokens[i];
    if(tok.indexOf('저장')>=0 || tok==='세이브' || tok==='세이브해'){
      var pre=tok.split('저장')[0];
      if(pre){ var pn=parseSpokenNumber(pre); if(pn!=null) pushVoiceNumber(pn); }
      await voiceCommit(); return;
    }
    if(/취소|지워|지웠|삭제|다시/.test(tok)){
      voiceBuf=[]; applyBufToInputs(); beepTick(); speak('지웠어요'); updateVoiceStatus(text); return;
    }
    var n=parseSpokenNumber(tok);
    if(n!=null) pushVoiceNumber(n);
  }
  updateVoiceStatus(text);
}

function speechSupported(){ return ('SpeechRecognition' in window)||('webkitSpeechRecognition' in window); }
function makeRecog(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  var r=new SR();
  r.lang='ko-KR'; r.continuous=true; r.interimResults=true; r.maxAlternatives=1;
  r.onstart=function(){ lastFinalIdx=-1; };
  r.onresult=function(e){
    if(speaking) return;
    for(var i=e.resultIndex;i<e.results.length;i++){
      var res=e.results[i], txt=(res[0]&&res[0].transcript||'').trim();
      if(res.isFinal){
        if(i>lastFinalIdx){ lastFinalIdx=i; processTranscript(txt); }
      } else {
        updateVoiceStatus(txt);
      }
    }
  };
  r.onerror=function(e){
    if(e.error==='not-allowed'||e.error==='service-not-allowed'){
      voiceOn=false; setMicUI(false);
      voiceWarn('마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요.');
      speak('마이크 권한이 필요해요');
    }
    /* no-speech / aborted / network: let onend restart */
  };
  r.onend=function(){
    if(voiceOn){ try{ r.start(); }catch(e){ setTimeout(function(){ if(voiceOn){ try{ r.start(); }catch(e2){} } },350); } }
    else setMicUI(false);
  };
  return r;
}
function startVoice(){
  if(!speechSupported()){
    voiceWarn('이 브라우저는 음성 입력을 지원하지 않아요. 크롬(안드로이드) 사용을 권장합니다.'); return;
  }
  try{ var c=ac(); if(c&&c.state==='suspended') c.resume(); }catch(e){}
  if(!recog) recog=makeRecog();
  voiceOn=true; setMicUI(true); lastFinalIdx=-1;
  voiceBuf=[]; applyBufToInputs(); updateVoiceStatus(null);
  try{ recog.start(); }catch(e){ /* already running */ }
  speak('음성 입력 시작. 볼, 헤드, 거리를 순서대로 말하고 저장이라고 하세요.');
}
function stopVoice(){
  voiceOn=false;
  if(recog){ try{ recog.stop(); }catch(e){} }
  try{ if('speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(e){}
  speaking=false; setMicUI(false);
}

/* ---------- event delegation ---------- */
document.addEventListener('click', function(e){
  var overlay=document.getElementById('overlay');
  if(e.target===overlay){ finishAdd(); return; }
  var el=e.target.closest('[data-action]'); if(!el) return;
  var a=el.dataset.action;

  if(a==='selDate'){ state.selectedDate=el.dataset.date; state.view='clubs'; render(); }
  else if(a==='selClub'){ state.selectedClub=el.dataset.club; state.view='detail'; render(); }
  else if(a==='back'){ state.view = state.view==='detail'?'clubs':'calendar'; render(); }
  else if(a==='prevMonth'){ state.m--; if(state.m<0){state.m=11;state.y--;} render(); }
  else if(a==='nextMonth'){ state.m++; if(state.m>11){state.m=0;state.y++;} render(); }
  else if(a==='add'){
    var pre;
    if(state.view==='detail') pre={date:state.selectedDate, club:state.selectedClub};
    else if(state.view==='clubs') pre={date:state.selectedDate};
    else pre={date: state.selectedDate||todayStr()};
    openAddSheet(pre);
  }
  else if(a==='chip'){
    var club=el.dataset.club;
    if(club==='__custom__'){
      sheetState.isCustom=true; sheetState.pickerOpen=true;
      renderClubField();
      var cu=document.getElementById('f-custom');
      if(cu){ sheetState.club=cu.value.trim(); cu.focus(); }
    } else {
      sheetState.isCustom=false; sheetState.club=club; sheetState.pickerOpen=false;
      renderClubField();
      var bEl=document.getElementById('f-ball'); if(bEl) bEl.focus();
    }
  }
  else if(a==='changeClub'){ sheetState.pickerOpen=true; renderClubField(); }
  else if(a==='save'){ doSave(); }
  else if(a==='voiceToggle'){ if(voiceOn) stopVoice(); else startVoice(); }
  else if(a==='doneAdd'){ finishAdd(); }
  else if(a==='closeSheet'){ finishAdd(); }
  else if(a==='delShot'){ openConfirm(el.dataset.id); }
  else if(a==='confirmDel'){ doDelete(); }
  else if(a==='cancelDel'){ closeOverlay(); }
  else if(a==='openData'){ state.view='data'; render(); }
  else if(a==='exportData'){ exportData(); }
  else if(a==='importData'){ importData(); }
  else if(a==='openImageDemo'){ openImageDemo(); }
  else if(a==='clearAll'){ openClearConfirm(); }
  else if(a==='confirmClear'){ doClearAll(); }
  else if(a==='signOut'){ doSignOut(); }
  else if(a==='backToLogin'){ showLogin(''); }
  else if(a==='retryBoot'){ boot(); }
});

/* 로그인 폼은 Enter 키로도 보낼 수 있게 submit을 받습니다. */
document.addEventListener('submit', function(e){
  if(e.target && e.target.id==='login-form'){ e.preventDefault(); requestMagicLink(); }
});

/* ---------- 로그인 게이트 ----------
   로그인 전에는 .app / #pill 을 숨기고 #gate 만 보여줍니다. */
function showGate(inner){
  var g=document.getElementById('gate');
  g.innerHTML='<div class="gate-box">'+inner+'</div>';
  g.classList.remove('hidden');
  document.querySelector('.app').classList.add('hidden');
  document.getElementById('pill').classList.add('hidden');
  document.body.classList.remove('noscroll');
}
function hideGate(){
  var g=document.getElementById('gate');
  g.classList.add('hidden'); g.innerHTML='';
  document.querySelector('.app').classList.remove('hidden');
  document.getElementById('pill').classList.remove('hidden');
}

function showBusy(msg){
  showGate('<div class="gate-emo">⛳</div><p class="gate-busy">'+esc(msg)+'</p>');
}
function showLogin(email, msg, kind){
  showGate(
    '<div class="gate-emo">⛳</div>'+
    '<div class="eyebrow">SWING LOG</div>'+
    '<h1>골프 스윙 기록</h1>'+
    '<p class="gate-lead">이메일 주소만 넣으면 로그인 링크를 보내드려요. 비밀번호는 없습니다.</p>'+
    '<form id="login-form" novalidate>'+
      '<input id="login-email" type="email" inputmode="email" autocomplete="email" '+
        'placeholder="you@example.com" value="'+esc(email||'')+'">'+
      '<button class="save" type="submit" id="login-btn">로그인 링크 받기</button>'+
    '</form>'+
    (msg?'<p class="data-msg '+(kind||'err')+'">'+esc(msg)+'</p>':'')+
    '<p class="gate-note">기록은 계정에 저장돼요. 휴대폰에서 적은 게 PC에서도 그대로 보입니다.</p>'
  );
  var el=document.getElementById('login-email'); if(el) el.focus();
}
function showLinkSent(email){
  showGate(
    '<div class="gate-emo">📬</div>'+
    '<h1>메일을 확인해 주세요</h1>'+
    '<p class="gate-lead"><strong>'+esc(email)+'</strong> 으로 로그인 링크를 보냈어요.<br>'+
      '메일 속 링크를 누르면 바로 로그인됩니다.</p>'+
    '<button class="btn-ghost" style="width:100%;" data-action="backToLogin">다른 주소로 다시 보내기</button>'+
    '<p class="gate-note">메일이 안 보이면 스팸함도 확인해 주세요.</p>'
  );
}
function showGateError(msg){
  showGate(
    '<div class="gate-emo">⚠️</div>'+
    '<h1>앱을 시작하지 못했어요</h1>'+
    '<p class="gate-lead">'+esc(msg)+'</p>'+
    '<button class="save" data-action="retryBoot">다시 시도</button>'
  );
}

async function requestMagicLink(){
  var inp=document.getElementById('login-email'), btn=document.getElementById('login-btn');
  var email=inp?inp.value.trim():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    showLogin(email,'이메일 형식이 올바르지 않습니다. (예: name@example.com)','err'); return;
  }
  if(btn){ btn.disabled=true; btn.textContent='보내는 중…'; }
  try{
    await sendMagicLink(email);
    showLinkSent(email);
  }catch(e){
    showLogin(email, errMsg(e), 'err');
  }
}

async function doSignOut(){
  try{ await signOut(); }catch(e){ /* 세션이 이미 없으면 그대로 진행 */ }
  enteredFor=null; records=[]; state.view='calendar';
  showLogin('');
}

/* 로그인 링크가 만료됐을 때 Supabase가 주소에 남기는 오류를 사람 말로 바꿉니다. */
function urlAuthError(){
  try{
    var h=(window.location.hash||'').replace(/^#/,'');
    var q=(window.location.search||'').replace(/^\?/,'');
    var params=new URLSearchParams(h||q);
    var raw=params.get('error_description')||params.get('error');
    if(!raw) return '';
    if(/expired|invalid/i.test(raw)) return '로그인 링크가 만료됐어요. 아래에서 다시 받아 주세요.';
    return raw;
  }catch(e){ return ''; }
}

/* ---------- boot ---------- */
async function enterApp(){
  var u=currentUser(); if(!u) return;
  if(enteredFor===u.id) return;      // 토큰 갱신 등으로 이벤트가 또 와도 다시 들어가지 않음
  enteredFor=u.id;

  // 메일 링크로 들어오면 주소창에 토큰이 붙어 있습니다. 깔끔하게 지웁니다.
  if(window.location.hash || window.location.search){
    try{ history.replaceState(null,'',window.location.pathname); }catch(e){}
  }

  showBusy('기록 불러오는 중…');
  var moved=0;
  try{
    moved=await migrateLegacyRecords();
    await reloadRecords();
  }catch(e){
    enteredFor=null;
    showGateError(errMsg(e));
    return;
  }

  var t=new Date();
  state.y=t.getFullYear(); state.m=t.getMonth(); state.selectedDate=todayStr();
  hideGate(); render();
  if(moved>0) toast('이 기기에 있던 기록 '+moved+'개를 계정으로 옮겼어요.');
}

async function boot(){
  try{ if('speechSynthesis' in window){ loadVoices(); window.speechSynthesis.onvoiceschanged=loadVoices; } }catch(e){}
  var linkErr=urlAuthError();    // Supabase가 주소를 정리하기 전에 먼저 읽어둡니다
  showBusy('불러오는 중…');

  var session;
  try{
    session=await initStore();
  }catch(e){
    showGateError(errMsg(e));
    return;
  }

  onAuthChange(function(next){
    if(next) enterApp();
    else { enteredFor=null; records=[]; showLogin(''); }
  });

  if(session) await enterApp();
  else showLogin('', linkErr, 'err');
}

boot();
