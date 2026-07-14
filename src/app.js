// ---------- helpers ----------
const $ = s => document.querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const money = n => '$' + Math.round(n).toLocaleString();
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hl = (s, q) => { s = esc(s); if(!q) return s; const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','ig'); return s.replace(rx,'<mark>$1</mark>'); };
const statusKey = s => 'st-' + String(s).replace(/\s+/g,'');
// KPI count-up + bar fill animation
function num(target,o){ o=o||{}; return `<div class="val" data-target="${target}" data-pre="${o.pre||''}" data-suf="${o.suf||''}" data-dec="${o.dec||0}" data-comma="${o.comma?1:0}">${o.pre||''}0${o.suf||''}</div>`; }
function countUp(e){
  const t=parseFloat(e.dataset.target)||0, pre=e.dataset.pre||'', suf=e.dataset.suf||'', dec=+e.dataset.dec||0, comma=e.dataset.comma==='1';
  const fmt=v=> pre + (comma?Math.round(v).toLocaleString():v.toFixed(dec)) + suf;
  const t0=performance.now(), dur=950;
  function tick(now){ let p=Math.min(1,(now-t0)/dur); p=1-Math.pow(1-p,3); e.textContent=fmt(t*p); if(p<1) requestAnimationFrame(tick); else e.textContent=fmt(t); }
  requestAnimationFrame(tick);
}
function animate(root){
  root.querySelectorAll('[data-w]').forEach(e=>{ e.style.width='0'; const w=e.dataset.w; requestAnimationFrame(()=>requestAnimationFrame(()=>{ e.style.width=w; })); });
  root.querySelectorAll('.val[data-target]').forEach(countUp);
}

const VIEWS = [
  ['live','Live MAVIS Analysis','✦'],
  ['sim','MAVIS Simulator','▶'],
  ['deliverables','What MAVIS Can Do','✧'],
  ['tools','Tools','⚙'],
  ['catalog','Integration Library','◆'],
  ['csa','CSA (Client Systems Architect)','◈'],
  ['prospecting','Prospecting & Lead Gen','◎'],
  ['va','VA Toolkit','☰'],
  ['csatech','CSA Tech Manager','⚠'],
  ['apibanks','API Banks','⛃'],
];
const state = { view:'live', scope:'all', activeId:null, autoReveal:false };
const recent = [];

// ---------- nav (sidebar) ----------
function renderNav(){
  const nav = $('#nav'); nav.innerHTML='';
  VIEWS.forEach(([id,label,icon])=>{
    const t = el(`<div class="navitem ${state.view===id?'active':''}"><span class="ic">${icon}</span>${label}</div>`);
    t.onclick=()=>{ state.view=id; renderNav(); render(); window.scrollTo(0,0); };
    nav.appendChild(t);
  });
}

function filteredWorkflows(){ return DATA.workflows; }
// single entry point: select a task (optional) and open the auto-running Live analysis
function startAnalysis(id){ if(id) state.activeId=id; else if(!state.activeId) state.activeId=DATA.workflows[0].id; state.view='live'; renderNav(); render(); window.scrollTo(0,0); }
function openAnalysis(id){ startAnalysis(id); }

// ---------- global search (task, keyword, tool) ----------
function buildIndex(){
  const idx=[];
  DATA.workflows.forEach(w=>idx.push({type:'wf',label:'Task',cls:'wf',title:w.name,sub:w.dept+' · '+w.frequency,hay:(w.name+' '+w.desc+' '+w.currentProcess+' '+w.dept+' '+w.currentTools+' '+w.recommendedTools+' '+w.autoType+' '+w.repetitive.join(' ')+' '+(w.keywords||[]).join(' ')).toLowerCase(),act:()=>openAnalysis(w.id)}));
  DATA.tools.forEach(t=>idx.push({type:'tool',label:'Tool',cls:'tool',title:t.name,sub:t.cat+' · '+t.useCases.length+' use cases',hay:(t.name+' '+t.cat+' '+t.ai+' '+t.integ+' '+t.useCases.join(' ')).toLowerCase(),act:()=>openTool(t.name)}));
  return idx;
}
let INDEX=[];
const SCOPE_TYPES={all:null,tasks:['wf'],tools:['tool']};
// ---------- capability recommendation engine (relevance x business impact x readiness) ----------
let CAP_TEXT={};
function buildCapText(){
  CAP_TEXT={};
  DATA.workflows.forEach(w=>{
    const probs=(typeof ASK_BANK!=='undefined'?ASK_BANK:[]).filter(b=>b.wf&&b.wf.includes(w.id)).map(b=>b.label+' '+b.kw.join(' ')).join(' ');
    CAP_TEXT[w.id]=(w.name+' '+w.dept+' '+(w.desc||'')+' '+(w.currentProcess||'')+' '+(w.repetitive||[]).join(' ')+' '+(w.keywords||[]).join(' ')+' '+w.autoType+' '+(w.autoRec||'')+' '+w.currentTools+' '+w.recommendedTools+' '+probs).toLowerCase();
  });
}
const RANK_STOP=new Set(['the','for','and','can','you','how','what','with','does','are','was','a','an','to','my','me','our','of','in','on','is','do','we','us','help','automate','automating','automation','mavis','business','company','firm','need','want','some','any','get','let','please','about','tell']);
function rankCaps(query,n){
  const ql=(query||'').toLowerCase().trim(); if(!ql) return [];
  const toks=[...new Set(ql.split(/[^a-z0-9]+/).filter(t=>t.length>2&&!RANK_STOP.has(t)))];
  const maxCost=Math.max(...DATA.workflows.map(w=>w.annualCost))||1;
  const scored=DATA.workflows.map(w=>{
    const txt=CAP_TEXT[w.id]||'', nm=w.name.toLowerCase();
    let rel=0;
    if(txt.includes(ql)) rel+=5;
    if(nm.includes(ql)) rel+=6;
    toks.forEach(t=>{ if(nm.includes(t)) rel+=4; else if(txt.includes(t)) rel+=2; });
    (typeof ASK_BANK!=='undefined'?ASK_BANK:[]).forEach(b=>{ if(b.wf&&b.wf.includes(w.id)&&b.kw.some(k=>ql.includes(k)||toks.includes(k))) rel+=4; });
    const score=rel*100 + (w.annualCost/maxCost)*22 + (w.readiness/100)*14;
    return {w,rel,score};
  }).filter(x=>x.rel>0).sort((a,b)=>b.score-a.score);
  return n?scored.slice(0,n):scored;
}
// broadly-applicable capabilities, ranked by impact x readiness (used for industry/generic asks)
function topCaps(n){
  const maxCost=Math.max(...DATA.workflows.map(w=>w.annualCost))||1;
  return [...DATA.workflows].map(w=>({w,score:(w.annualCost/maxCost)+(w.readiness/100)})).sort((a,b)=>b.score-a.score).slice(0,n||4);
}
// ===== unified search: one knowledge base + index + ranking for Ask MAVIS, CSA, and global search =====
const SYN_CLUSTERS=[
  ['email','emails','newsletter','campaign','blast','inbox','outreach','mailing','drip','sequence','mail','mailer','broadcast','follow-up','nurture'],
  ['invoice','invoicing','billing','receipt','payment','payments','reconcile','collect','payable','ar'],
  ['graphic','graphics','design','image','visual','banner','creative','logo','thumbnail','ad','ads'],
  ['crm','contact','contacts','lead','leads','pipeline','deal','deals','account','prospect','prospecting'],
  ['report','reports','reporting','dashboard','dashboards','kpi','analytics','metric','metrics'],
  ['schedule','scheduling','calendar','meeting','meetings','appointment','appointments','booking'],
  ['support','ticket','tickets','helpdesk','faq','service','chatbot'],
  ['social','post','posts','content','caption','feed','publish'],
  ['onboard','onboarding','provision','welcome','kickoff'],
  ['research','competitor','competitive','market','enrich','enrichment'],
  ['spreadsheet','sheet','sheets','data entry','excel','workbook'],
  ['document','pdf','extract','ocr','contract','statement'],
];
function qHasWord(ql,w){ return new RegExp('(^|[^a-z0-9])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)').test(ql); }
function expandQuery(ql){
  const toks=new Set(ql.split(/[^a-z0-9]+/).filter(t=>t.length>2&&!RANK_STOP.has(t)).map(t=>t.replace(/s$/,'')));
  SYN_CLUSTERS.forEach(cl=>{ if(cl.some(w=>qHasWord(ql,w))) cl.forEach(w=>w.split(/\s+/).forEach(x=>{ if(x.length>2) toks.add(x.replace(/s$/,'')); })); });
  const capBoost={};
  (typeof ASK_BANK!=='undefined'?ASK_BANK:[]).forEach(b=>{ if(b.kw.some(k=>qHasWord(ql,k))){ b.kw.forEach(k=>k.split(/\s+/).forEach(w=>{ if(w.length>2) toks.add(w.replace(/s$/,'')); })); (b.wf||[]).forEach(id=>capBoost[id]=(capBoost[id]||0)+4); } });
  return {toks:[...toks],capBoost};
}
// unified ranked results = capabilities + concrete integration recipes, blended on one relevance scale
function mavisSearch(query,limit){
  const ql=(query||'').toLowerCase().trim(); if(!ql) return [];
  const {toks,capBoost}=expandQuery(ql);
  const maxCost=Math.max(...DATA.workflows.map(w=>w.annualCost))||1;
  const caps=DATA.workflows.map(w=>{
    const txt=CAP_TEXT[w.id]||'', nm=w.name.toLowerCase(); let rel=0;
    if(nm.includes(ql)) rel+=7; if(txt.includes(ql)) rel+=4;
    toks.forEach(t=>{ if(nm.includes(t)) rel+=4; else if(txt.includes(t)) rel+=2; });
    rel+=capBoost[w.id]||0;
    if(!rel) return null;
    return {kind:'capability',w,title:w.name,tools:(w.integrations||[]).slice(),desc:w.autoRec||w.autoType,cat:w.dept,wfId:w.id,rel,score:rel*100+(w.annualCost/maxCost)*22+(w.readiness/100)*14};
  }).filter(Boolean);
  const tools=DATA.catalog&&DATA.catalog.tools||[]; const qn=ql.replace(/[^a-z0-9]/g,'');
  const matchedTool=tools.find(t=>{ const dn=t.display.toLowerCase().replace(/[^a-z0-9]/g,''); if(dn.length>3&&(qn.includes(dn)||(qn.length>=6&&dn.includes(qn)))) return true; return (t.aliases||[]).some(a=>{ const an=a.toLowerCase().replace(/[^a-z0-9]/g,''); return an.length>3&&(qn.includes(an)||(qn.length>=6&&an.includes(qn))); }); });
  const md=matchedTool?matchedTool.display.toLowerCase():null;
  const ints=(DATA.catalog&&DATA.catalog.integrations||[]).map(i=>{
    const tl=i.tools.map(x=>x.toLowerCase()), dl=i.desc.toLowerCase(); let rel=0;
    if(md&&tl.some(x=>x===md||x.includes(md))) rel+=8;
    toks.forEach(t=>{ if(tl.some(x=>x.includes(t))) rel+=4; if(dl.includes(t)) rel+=2; });
    if(!rel) return null;
    return {kind:'integration',tools:i.tools.slice(),desc:i.desc,cat:i.cat,title:sentence(i.desc),rel,score:rel*100};
  }).filter(Boolean);
  const all=caps.concat(ints).sort((a,b)=>b.score-a.score);
  const out=[], seenCap=new Set(), seenDesc=new Set(), seenPartner=new Set();
  for(const r of all){
    if(r.kind==='capability'){ if(seenCap.has(r.wfId)) continue; seenCap.add(r.wfId); out.push(r); }
    else { const key=r.desc.toLowerCase().split(/[^a-z0-9]+/).slice(0,4).join(' '); if(seenDesc.has(key)) continue;
      if(md){ const p=r.tools.map(t=>t.toLowerCase()).find(t=>t!==md)||''; if(p&&seenPartner.has(p)) continue; if(p) seenPartner.add(p); }
      seenDesc.add(key); out.push(r); }
    if(limit&&out.length>=limit) break;
  }
  out.forEach(r=>{ if(r.kind==='integration'&&!r.wfId){ const near=rankCaps(r.desc+' '+r.tools.join(' '),1)[0]; r.wfId=near?near.w.id:DATA.workflows[0].id; } });
  if(!out.length) return topCaps(limit||6).map(x=>({kind:'capability',w:x.w,title:x.w.name,tools:(x.w.integrations||[]).slice(),desc:x.w.autoRec||x.w.autoType,cat:x.w.dept,wfId:x.w.id,rel:0,score:0}));
  return out;
}
// run the full dashboard for a capability (auto-reveals the blueprint)
// select a capability and open the dashboard in a READY state — the user then clicks "Live MAVIS Analysis" to run
// select a capability and run the analysis — reveals the TOP cards; the rest wait for "Launch Automation"
function selectAnalysis(id){ if(!id) return; state.activeId=id; const box=$('#results'); if(box) box.classList.remove('open'); const si=$('#search'); if(si) si.value=''; runAnalysisNow(); }
function runSearch(q){
  const box=$('#results'); q=q.trim();
  if(!q){box.classList.remove('open');box.innerHTML='';return;}
  const ql=q.toLowerCase();
  const allow=SCOPE_TYPES[state.scope];
  let html='';
  // active business-vertical acts as a context filter that biases ranking
  if(activeVertical) html+=`<div class="rgroup rgctx">Focused on ${activeVertical.ic} <b>${esc(activeVertical.name)}</b> <a data-vclear>clear filter</a></div>`;
  const rankQ=activeVertical?(q+' '+activeVertical.seed):q;
  // ranked capabilities / workflows (relevance x business impact x readiness)
  if(!allow||allow.includes('wf')){
    let caps=mavisSearch(rankQ,14).filter(r=>r.kind==='capability').slice(0,8).map(r=>({w:r.w||DATA.workflows.find(x=>x.id===r.wfId)})).filter(x=>x.w);  // unified engine (same as Ask + CSA)
    if(caps.length){
      html+=`<div class="rgroup">Recommended MAVIS capabilities (${caps.length})</div>`;
      caps.forEach(({w})=>{
        html+=`<div class="ritem cap" data-wf="${w.id}"><span class="rtype wf">Capability</span>
          <div class="rmain"><div class="t">${hl(w.name,q)}</div><div class="s"><span class="pill p-${w.priority} rpill">${w.priority}</span> ${esc(w.dept)} &middot; <b>${money(w.annualCost)}/yr</b> &middot; ${w.readiness}% ready</div></div>
          <button class="ritem-run" data-run-wf="${w.id}">&#10022; Run MAVIS Analysis</button></div>`;
      });
    }
  }
  // tools & integrations
  if(!allow||allow.includes('tool')){
    const tools=DATA.tools.filter(t=>(t.name+' '+t.cat+' '+t.ai+' '+t.integ+' '+t.useCases.join(' ')).toLowerCase().includes(ql)).slice(0,5);
    if(tools.length){
      html+=`<div class="rgroup">Core tools (${tools.length})</div>`;
      tools.forEach(t=>{ html+=`<div class="ritem tool" data-tool="${esc(t.name)}"><span class="rtype tool">Tool</span><div class="rmain"><div class="t">${hl(t.name,q)}</div><div class="s">${esc(t.cat)} &middot; ${t.useCases.length} use cases</div></div></div>`; });
    }
    // connected-apps catalog (510 documented integrations)
    const cat=(DATA.catalog&&DATA.catalog.tools)||[];
    const seen=new Set(tools.map(t=>t.name.toLowerCase()));
    const ci=cat.filter(t=>!seen.has(t.display.toLowerCase()) && (t.display+' '+t.slug+' '+(t.aliases||[]).join(' ')+' '+t.cat+' '+(t.caps||[]).join(' ')).toLowerCase().includes(ql)).slice(0,6);
    if(ci.length){
      html+=`<div class="rgroup">Connected integrations (${ci.length})</div>`;
      ci.forEach(t=>{ html+=`<div class="ritem cint" data-slug="${esc(t.slug)}"><span class="rtype tool">Integration</span><div class="rmain"><div class="t">${hl(t.display,q)}</div><div class="s">${esc(t.cat)} &middot; ${(t.caps||[]).length} capabilities</div></div></div>`; });
    }
  }
  if(!html){ html=`<div class="ritem"><div class="s">No direct match for "${esc(q)}". Try a business need like <b>invoicing</b>, <b>scheduling</b>, <b>customer support</b>, <b>CRM</b>, <b>social media</b>, or <b>reporting</b>.</div></div>`; }
  box.innerHTML=html; box.classList.add('open');
  box.querySelectorAll('.ritem-run').forEach(b=>b.onclick=(ev)=>{ ev.stopPropagation(); selectAnalysis(b.dataset.runWf); });
  box.querySelectorAll('.ritem.cap').forEach(r=>r.onclick=()=>{ box.classList.remove('open'); openWorkflow(r.dataset.wf); });
  box.querySelectorAll('.ritem.tool').forEach(r=>r.onclick=()=>{ box.classList.remove('open'); $('#search').value=''; openTool(r.dataset.tool); });
  box.querySelectorAll('.ritem.cint').forEach(r=>r.onclick=()=>{ box.classList.remove('open'); $('#search').value=''; openCatalogTool(r.dataset.slug); });
  box.querySelectorAll('[data-vclear]').forEach(a=>a.onclick=(e)=>{ e.stopPropagation(); clearVertical(); });
}
// Business-vertical explorer under the global search. Selecting a vertical shows a
// compact Industry Overview + top-3 recommendations + collapsible categories + a
// "View all" drawer — and sets a context filter that biases the global search.
let activeVertical=null;
function wfCategory(w){
  const s=((w.name||'')+' '+((w.keywords||[]).join(' '))+' '+(w.dept||'')+' '+(w.autoType||'')).toLowerCase();
  if(/invoice|billing|payment|reconcil|financ|account|expense|payroll/.test(s)) return 'Billing & Finance';
  if(/email|outreach|inbox|follow|newsletter|campaign|cold /.test(s)) return 'Email & Outreach';
  if(/schedul|calendar|meeting|appointment|booking/.test(s)) return 'Scheduling';
  if(/crm|lead|contact|pipeline|deal|prospect|sales/.test(s)) return 'CRM & Sales';
  if(/report|dashboard|kpi|analytic|metric/.test(s)) return 'Reporting';
  if(/document|pdf|extract|contract|statement|ocr|form/.test(s)) return 'Documents';
  if(/content|social|graphic|design|blog|caption|post/.test(s)) return 'Content & Social';
  if(/research|competitor|market|enrich/.test(s)) return 'Research';
  if(/file|drive|folder|organize|storage/.test(s)) return 'Files & Storage';
  if(/support|ticket|faq|q&a|help desk|helpdesk/.test(s)) return 'Support';
  return 'Automation';
}
function verticalWorkflows(v){
  // only industry-RELEVANT capabilities (ranked by the shared engine), so each
  // vertical's overview/opportunity count/savings differ meaningfully.
  const res=(typeof mavisSearch==='function')?mavisSearch(v.seed,40):[];
  const seen=new Set(), list=[];
  res.forEach(r=>{ if(r.kind!=='capability') return; const w=r.w||DATA.workflows.find(x=>x.id===r.wfId); if(w&&!seen.has(w.id)){ seen.add(w.id); list.push(w); } });
  if(!list.length) list.push(...DATA.workflows.slice().sort((a,b)=>b.annualCost-a.annualCost).slice(0,5));
  return list;
}
function ivTopCard(w){
  return `<div class="ivTopCard"><div class="ivTopHd"><span class="ivTopCat">${esc(wfCategory(w))}</span><span class="pill p-${w.priority}">${w.priority}</span></div>
    <div class="ivTopName">${esc(w.name)}</div><div class="ivTopDesc">${esc((w.autoRec||w.desc||'').slice(0,120))}</div>
    <div class="ivTopMeta"><span>&#128176; ${money(w.annualCost)}/yr</span><span>&#9201; ${w.annualHours.toLocaleString()} hrs</span><span>&#9889; ${w.readiness}%</span></div>
    <div class="ivTopBtns"><button class="runbtn" data-run-wf="${w.id}">&#10022; Run Analysis</button><button class="wizghost" data-open-wf="${w.id}">Details</button></div></div>`;
}
function ivRow(w){
  return `<div class="ivRow"><div class="ivRowMain"><div class="ivRowName">${esc(w.name)}</div><div class="ivRowMeta">${esc(w.dept)} &middot; ${money(w.annualCost)}/yr &middot; ${w.readiness}% ready</div></div><button class="ivRowRun" data-run-wf="${w.id}">Run &rarr;</button></div>`;
}
function openVerticalDrawer(v,wfs){
  const rows=wfs.map(w=>`<div class="ivRow"><div class="ivRowMain"><div class="ivRowName">${esc(w.name)}</div><div class="ivRowMeta">${esc(wfCategory(w))} &middot; ${esc(w.dept)} &middot; ${money(w.annualCost)}/yr &middot; ${w.readiness}% ready</div></div><button class="ivRowRun" data-run-wf="${w.id}">Run &rarr;</button></div>`).join('');
  openDrawer(`<div class="dhead"><span class="dclose" data-close>&times;</span><h3>${v.ic} ${esc(v.name)} &mdash; all opportunities</h3><div class="meta">${wfs.length} automation opportunities ranked for this industry</div></div><div class="dbody"><div class="ivDrawerList">${rows}</div></div>`);
  const dr=$('#drawer'); if(dr) dr.querySelectorAll('[data-run-wf]').forEach(b=>b.onclick=()=>{ if(typeof closeDrawer==='function') closeDrawer(); selectAnalysis(b.dataset.runWf); });
}
function clearVertical(){ activeVertical=null; document.querySelectorAll('#vertbar .vchip').forEach(x=>x.classList.remove('active')); const box=$('#vertResults'); if(box) box.innerHTML=''; const si=$('#search'); if(si&&si.value) runDiscovery(si.value); }
function searchVertical(v){
  activeVertical=v;
  document.querySelectorAll('#vertbar .vchip').forEach(c=>c.classList.toggle('active',c.dataset.vert===v.name));
  const box=$('#vertResults'); if(!box) return;
  const wfs=verticalWorkflows(v), top=wfs.slice(0,3), rest=wfs.slice(3);
  const totalCost=wfs.reduce((a,w)=>a+w.annualCost,0), totalHours=wfs.reduce((a,w)=>a+w.annualHours,0);
  const avgReady=wfs.length?Math.round(wfs.reduce((a,w)=>a+w.readiness,0)/wfs.length):0;
  const overview=`<div class="ivCard"><span class="vrclose" id="vrClose">&times;</span>
    <div class="ivHead"><div class="ivIc">${v.ic}</div><div><div class="ivName">${esc(v.name)} &mdash; Industry Overview</div><div class="ivSub">${v.support}</div></div></div>
    <div class="ivStats"><div class="ivStat"><b>${money(totalCost)}</b><span>Est. annual savings</span></div><div class="ivStat"><b>${wfs.length}</b><span>Opportunities</span></div><div class="ivStat"><b>${avgReady}%</b><span>Avg readiness</span></div><div class="ivStat"><b>${totalHours.toLocaleString()}</b><span>Hrs saved / yr</span></div></div></div>`;
  const topHtml=top.length?`<div class="ivSecH">&#10022; Top AI-recommended for ${esc(v.name)}</div><div class="ivTopGrid">${top.map(ivTopCard).join('')}</div>`:'';
  const cats={}; rest.forEach(w=>{ const c=wfCategory(w); (cats[c]=cats[c]||[]).push(w); });
  const catKeys=Object.keys(cats);
  const catHtml=catKeys.length?`<div class="ivSecH">More opportunities by category</div><div class="ivCats">`+catKeys.map((c,i)=>`<details class="ivCat"${i===0?' open':''}><summary>${esc(c)} <span class="ivCatN">${cats[c].length}</span></summary><div class="ivCatBody">${cats[c].map(ivRow).join('')}</div></details>`).join('')+`</div>`:'';
  const allBtn=`<div class="ivAllRow"><button class="ivAllBtn" id="ivAll">&#128203; View all ${wfs.length} opportunities</button><span class="ivHint">Search above is now focused on ${esc(v.name)} &mdash; type a task to see industry-tuned results.</span></div>`;
  box.innerHTML=overview+topHtml+catHtml+allBtn;
  box.querySelectorAll('[data-run-wf]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); selectAnalysis(b.dataset.runWf); });
  box.querySelectorAll('[data-open-wf]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); openWorkflow(b.dataset.openWf); });
  const cl=$('#vrClose'); if(cl) cl.onclick=clearVertical;
  const ab=$('#ivAll'); if(ab) ab.onclick=()=>openVerticalDrawer(v,wfs);
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ===== AI-powered Automation Discovery (replaces the autocomplete dropdown) =====
let discQ='', discActive=false, discPrev='live', discItems=[], discFilter='All';
const DISC_ORDER=['Email Management','Sales & CRM','Marketing','Customer Support','Finance & Billing','Data & Reporting','Scheduling','Documents & Files','HR & People','Operations'];
function discCategory(r){
  const s=((r.title||'')+' '+(r.desc||'')+' '+((r.tools||[]).join(' '))+' '+(r.cat||'')).toLowerCase();
  if(/\bemail|inbox|outreach|newsletter|follow-?up|reply|mailbox|gmail|outlook/.test(s)) return 'Email Management';
  if(/lead|crm|deal|pipeline|prospect|\bsales\b|contact|hubspot|salesforce/.test(s)) return 'Sales & CRM';
  if(/social|content|campaign|marketing|seo|\bads?\b|graphic|post|brand/.test(s)) return 'Marketing';
  if(/ticket|support|help ?desk|faq|customer|service|chat|zendesk|intercom/.test(s)) return 'Customer Support';
  if(/invoice|payment|reconcil|billing|expense|account|financ|payroll|stripe|quickbook|xero/.test(s)) return 'Finance & Billing';
  if(/report|dashboard|kpi|analytic|\bdata\b|spreadsheet|sheet|metric/.test(s)) return 'Data & Reporting';
  if(/schedul|calendar|meeting|appointment|booking|calendly/.test(s)) return 'Scheduling';
  if(/document|pdf|contract|\bfile|drive|extract|statement|ocr/.test(s)) return 'Documents & Files';
  if(/onboard|\bhr\b|employee|recruit|hiring|people|applicant/.test(s)) return 'HR & People';
  return 'Operations';
}
function discMetrics(r){
  const w=r.wfId?DATA.workflows.find(x=>x.id===r.wfId):null;
  if(r.kind==='capability'&&w){
    const cx={S:'Low',M:'Medium',L:'High',XL:'High'}[w.effort]||'Medium';
    return {annualCost:w.annualCost, hours:w.annualHours, readiness:w.readiness, complexity:cx, tools:(w.integrations&&w.integrations.length?w.integrations:r.tools)||[]};
  }
  const mx=recipeMetrics(r); const hours=mx.timeSaved*52; const h=hashStr(r.title);
  return {annualCost:Math.round(hours*50/100)*100, hours, readiness:72+(h%23), complexity:mx.complexity, tools:r.tools||[]};
}
function discCard(x){
  const {r,m,idx,cat}=x;
  const chips=(m.tools.length?m.tools:['MAVIS']).slice(0,4).map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('');
  const desc=r.kind==='integration'?`Connects ${esc((r.tools||[]).join(' + ')||'your tools')} &mdash; ${esc(r.desc)}`:esc(r.desc||(r.cat+' capability'));
  return `<div class="discCard"><div class="discCardHd"><span class="discCat">${esc(cat)}</span><span class="recipeCx cx-${m.complexity.toLowerCase()}">${m.complexity} setup</span></div>
    <div class="discName">${esc(r.title)}</div>
    <div class="discDesc">${desc}</div>
    <div class="discStats"><span title="Estimated annual savings">&#128176; <b>${money(m.annualCost)}</b>/yr</span><span title="Hours saved per year">&#9201; <b>${m.hours.toLocaleString()}</b> hrs/yr</span><span title="Automation readiness">&#9889; <b>${m.readiness}%</b> ready</span></div>
    <div class="discToolsK">Required tools &amp; integrations</div><div class="tchips" style="margin-top:4px">${chips}</div>
    <div class="discBtns"><button class="wizghost discPreview" data-idx="${idx}">&#128065; Preview workflow</button><button class="runbtn discRun" data-wf="${esc(r.wfId)}">&#10022; Run MAVIS Analysis</button></div>
    <div class="discFlowWrap" id="discFlow-${idx}" style="display:none"></div></div>`;
}
function discFlow(r){
  const two=r.kind==='integration'&&(r.tools||[]).length>=2;
  const A=(r.tools||[])[0]||'Trigger', B=(r.tools||[])[1]||'MAVIS';
  const nodes=two
    ? [{k:'Trigger',t:A},{k:'Capture',t:'MAVIS'},{k:'Transform',t:'Map fields'},{k:'Action',t:B},{k:'Confirm',t:'Log + alert'}]
    : [{k:'Trigger',t:'Request / schedule'},{k:'Gather',t:'Connected tools'},{k:'Reason',t:'MAVIS'},{k:'Produce',t:'Draft output'},{k:'Deliver',t:'Review queue'}];
  const steps=two?[
    `A new or updated record in <b>${esc(A)}</b> triggers the workflow.`,
    `MAVIS reads the event and validates the data via the ${esc(A)} API.`,
    `It maps and transforms the fields to <b>${esc(B)}</b>&rsquo;s format.`,
    `MAVIS ${esc(r.desc)} in ${esc(B)} &mdash; then logs the result and retries on errors.`,
  ]:[
    `You request it (or it runs on a schedule).`,
    `MAVIS pulls the inputs from your connected tools and documents.`,
    `It reasons over the data, drafts the output, and quality-checks it.`,
    `The finished draft is filed to your review queue for approval.`,
  ];
  return `<div class="discFlow"><div class="discFlowH">&#9654; How this automation works</div>
    <div class="discFlowRow">${nodes.map((n,i)=>`<div class="discNode"><span class="discNodeK">${esc(n.k)}</span><b>${esc(n.t)}</b></div>${i<nodes.length-1?'<span class="discArrow">&rarr;</span>':''}`).join('')}</div>
    <ol class="discFlowSteps">${steps.map(s=>`<li>${s}</li>`).join('')}</ol></div>`;
}
function viewDiscover(q){
  q=(q||'').trim();
  const rankQ=(activeVertical?(q+' '+activeVertical.seed):q);
  const all=(typeof mavisSearch==='function')?mavisSearch(rankQ,60):[];
  if(!all.length){
    return `<section class="card"><div class="discHero"><div class="discHeroIc">&#10022;</div><div><div class="discHeroT">No automations found for &ldquo;${esc(q)}&rdquo;</div><div class="discHeroS">Try a business task (&ldquo;reduce manual data entry&rdquo;), a tool (&ldquo;QuickBooks&rdquo;), a department (&ldquo;finance&rdquo;), or plain language (&ldquo;I spend too much time on email&rdquo;).</div></div></div></section>`;
  }
  const main=all.slice(0,24);
  discItems=main.map((r,i)=>({r,m:discMetrics(r),cat:discCategory(r),idx:i}));
  const opps=discItems.length;
  const totalCost=discItems.reduce((a,x)=>a+x.m.annualCost,0);
  const totalHours=discItems.reduce((a,x)=>a+x.m.hours,0);
  const avgReady=Math.round(discItems.reduce((a,x)=>a+x.m.readiness,0)/opps);
  // group by category, ordered
  const groups={}; discItems.forEach(x=>{ (groups[x.cat]=groups[x.cat]||[]).push(x); });
  const cats=Object.keys(groups).sort((a,b)=>{ const ia=DISC_ORDER.indexOf(a),ib=DISC_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  const chips=['All',...cats].map((c,i)=>`<button class="discChip${i===0?' active':''}" data-cat="${esc(c)}">${esc(c)}${c==='All'?'':` <span>${groups[c].length}</span>`}</button>`).join('');
  const sections=cats.map(c=>`<div class="discSection" data-cat="${esc(c)}"><div class="discSecH">${esc(c)} <span>${groups[c].length}</span></div><div class="discGrid">${groups[c].map(discCard).join('')}</div></div>`).join('');
  // related AI recommendations — high-impact capabilities not already surfaced
  const shownWf=new Set(discItems.filter(x=>x.r.kind==='capability').map(x=>x.r.wfId));
  const related=DATA.workflows.filter(w=>!shownWf.has(w.id)).sort((a,b)=>b.annualCost-a.annualCost).slice(0,3);
  const relHtml=related.length?`<div class="discRelated"><div class="discSecH">&#10022; Related AI recommendations <span class="discRelSub">you may not have considered</span></div><div class="discRelGrid">${related.map(w=>`<div class="discRelCard" data-wf="${w.id}"><div class="discRelName">${esc(w.name)}</div><div class="discRelDesc">${esc((w.autoRec||'').slice(0,110))}</div><div class="discRelMeta">${money(w.annualCost)}/yr &middot; ${w.readiness}% ready</div><button class="wizghost discRelRun" data-wf="${w.id}">&#10022; Explore</button></div>`).join('')}</div></div>`:'';
  const summary=`<div class="discSummary"><div class="discSumHd"><div class="discHeroIc">&#10022;</div><div><div class="discHeroT">MAVIS found <b>${opps}</b> automation opportunit${opps===1?'y':'ies'} for &ldquo;${esc(q)}&rdquo;</div><div class="discHeroS">Acting as your AI Solutions Architect &mdash; here are the highest-impact workflows across your operation, ranked by relevance and value.</div></div></div>
    <div class="discSumStats"><div class="discSumStat"><b>${opps}</b><span>Opportunities</span></div><div class="discSumStat"><b>${money(totalCost)}</b><span>Est. annual savings</span></div><div class="discSumStat"><b>${totalHours.toLocaleString()}</b><span>Hours saved / yr</span></div><div class="discSumStat"><b>${avgReady}%</b><span>Avg readiness</span></div></div></div>`;
  return `<section class="card discWrap">${summary}
    <div class="discChips">${chips}</div>
    <div class="discSections">${sections}</div>
    ${relHtml}
    <div class="siminfo">These are modeled estimates ($50/hr blended). Click <b>Preview workflow</b> to see how any automation runs, or <b>Run MAVIS Analysis</b> for the full breakdown &amp; ROI.</div></section>`;
}
function wireDiscover(){
  const view=$('#view'); if(!view) return;
  discFilter='All';
  view.querySelectorAll('.discPreview').forEach(b=>b.onclick=()=>{ const i=+b.dataset.idx; const wrap=$('#discFlow-'+i); if(!wrap) return; const open=wrap.style.display!=='none'; if(open){ wrap.style.display='none'; b.innerHTML='&#128065; Preview workflow'; } else { if(!wrap.dataset.done){ wrap.innerHTML=discFlow(discItems[i].r); wrap.dataset.done='1'; } wrap.style.display='block'; b.innerHTML='&#9650; Hide workflow'; } });
  view.querySelectorAll('.discRun,.discRelRun').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); discActive=false; selectAnalysis(b.dataset.wf); });
  view.querySelectorAll('.discRelCard').forEach(c=>c.onclick=()=>{ discActive=false; openWorkflow(c.dataset.wf); });
  view.querySelectorAll('.discChip').forEach(b=>b.onclick=()=>{ discFilter=b.dataset.cat; view.querySelectorAll('.discChip').forEach(x=>x.classList.toggle('active',x===b)); view.querySelectorAll('.discSection').forEach(s=>{ s.style.display=(discFilter==='All'||s.dataset.cat===discFilter)?'':'none'; }); });
}
function runDiscovery(q){
  q=(q||'').trim();
  const box=$('#results'); if(box){ box.classList.remove('open'); box.innerHTML=''; }
  if(!q){ if(discActive){ discActive=false; state.view=discPrev||'live'; render(); } return; }
  if(!discActive){ discActive=true; discPrev=(state.view==='discover'?discPrev:state.view)||'live'; }
  discQ=q; state.view='discover'; render();
}
// ---------- views ----------
function render(){
  const v=$('#view');
  if(state.view==='overview'){ v.innerHTML=viewOverview(); wireOverview(); }
  else if(state.view==='workflows') { v.innerHTML=viewWorkflows(); wireRows(); }
  else if(state.view==='opportunities') v.innerHTML=viewOpportunities();
  else if(state.view==='impact') v.innerHTML=viewImpact();
  else if(state.view==='roadmap') v.innerHTML=viewRoadmap();
  else if(state.view==='tools'){ v.innerHTML=viewTools(); wireTools(); }
  else if(state.view==='catalog'){ v.innerHTML=viewCatalog(); wireCatalog(); }
  else if(state.view==='csa'){ v.innerHTML=viewCSA(); wireCSA(); }
  else if(state.view==='csatech'){ v.innerHTML=viewCSATech(); wireCSATech(); }
  else if(state.view==='apibanks'){ v.innerHTML=viewApiBanks(); wireApiBanks(); }
  else if(state.view==='prospecting'){ v.innerHTML=viewProspecting(); wireProspecting(); }
  else if(state.view==='va'){ v.innerHTML=viewVA(); wireVA(); }
  else if(state.view==='sim'){ v.innerHTML=viewSim(); wireSim(); }
  else if(state.view==='deliverables'){ v.innerHTML=viewDeliverables(); wireDeliverables(); }
  else if(state.view==='live'){ v.innerHTML=viewLive(); wireLive(); }
  else if(state.view==='discover'){ v.innerHTML=viewDiscover(discQ); wireDiscover(); }
  const hideChrome=['deliverables','tools','catalog','csa','csatech','apibanks','prospecting','va','sim'].includes(state.view);
  const tc=document.querySelector('.topcontrols'); if(tc) tc.classList.toggle('hide', hideChrome);
  const vbar=document.querySelector('#vertbar'), vres=document.querySelector('#vertResults'); if(vbar) vbar.classList.toggle('hide', hideChrome); if(vres) vres.classList.toggle('hide', hideChrome);
  // The MAVIS title header shows only on the Live Analysis view; the whole topbar hides on chrome-less views.
  const brand=document.querySelector('#brandHead'); if(brand) brand.classList.toggle('hide', state.view!=='live');
  const topbar=document.querySelector('#topbar'); if(topbar){ topbar.classList.toggle('hide', hideChrome); topbar.classList.toggle('nobrand', state.view!=='live'&&!hideChrome); }
  const bn=document.querySelector('#banner'); if(bn) bn.style.display=(state.view==='live')?'':'none';
  animate(v);
}

const DONUT_COLORS=['#06B6D4','#6366F1','#22D3EE','#818CF8','#10B981','#F59E0B','#14B8A6','#94A3B8'];
function donut(segs,bigLabel,smallLabel){
  const total=segs.reduce((s,x)=>s+x.value,0)||1;
  const C=2*Math.PI*54; let off=0;
  const rings=segs.map(s=>{ const frac=s.value/total; const dash=frac*C; const seg=`<circle cx="70" cy="70" r="54" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${dash.toFixed(2)} ${(C-dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"/>`; off+=dash; return seg; }).join('');
  const legend=segs.map(s=>`<div><span class="dt" style="background:${s.color}"></span><b>${esc(s.label)}</b>&nbsp;<span>${s.disp||s.value}</span></div>`).join('');
  return `<div class="donutwrap"><svg width="140" height="140" viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="rgba(148,163,184,.12)" stroke-width="18"/>${rings}<text x="70" y="66" text-anchor="middle" font-size="24" font-weight="750" fill="#F8FAFC">${bigLabel}</text><text x="70" y="86" text-anchor="middle" font-size="10.5" fill="#94A3B8">${smallLabel}</text></svg><div class="donutlegend">${legend}</div></div>`;
}
function viewOverview(){
  const e=DATA.exec, W=DATA.workflows;
  const avgRoi=Math.round(W.reduce((s,x)=>s+x.roi,0)/W.length);
  const card=(l,c,valHtml)=>`<div class="kpi ${c}">${valHtml}<div class="lbl">${l}</div></div>`;
  const kpis=[
    card('workflows analyzed','',num(e.workflowsAnalyzed)),
    card('automation opportunities','',num(e.opportunities)),
    card('annual hours saved','alt',num(e.annualHours,{comma:true})),
    card('annual cost savings','',num(e.annualCost,{pre:'$',comma:true})),
    card('automation readiness','alt',num(e.avgReadiness,{suf:'%'})),
    card('avg AI ROI','alt',num(avgRoi,{suf:'%'})),
  ].join('');
  // department donut (by monthly cost)
  const deptSegs=[...DATA.departments].sort((a,b)=>b.monthlyCost-a.monthlyCost).map((d,i)=>({label:d.name,value:d.monthlyCost,disp:money(d.monthlyCost),color:DONUT_COLORS[i%DONUT_COLORS.length]}));
  // top workflows by annual hours
  const top=[...W].sort((a,b)=>b.annualHours-a.annualHours).slice(0,6);
  const maxH=Math.max(...top.map(w=>w.annualHours));
  const topBars=top.map(w=>`<div class="bar-row"><div class="name" style="width:150px">${esc(w.name.length>22?w.name.slice(0,21)+'…':w.name)}</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="${(w.annualHours/maxH*100).toFixed(1)}%"></div></div><div class="amt">${w.annualHours.toLocaleString()}</div></div>`).join('');
  // readiness distribution
  const rb=[['Ready (85+)',w=>w.readiness>=85,'#10B981'],['Strong (75-84)',w=>w.readiness>=75&&w.readiness<85,'#06B6D4'],['Emerging (<75)',w=>w.readiness<75,'#F59E0B']];
  const rSegs=rb.map(([l,f,c])=>({label:l,value:W.filter(f).length,color:c}));
  // top savings
  const savings=[...W].sort((a,b)=>b.annualCost-a.annualCost).slice(0,6).map(w=>`<div class="sv" data-id="${w.id}" style="cursor:pointer"><div><div class="svn">${esc(w.name)}</div><div class="svd">${esc(w.dept)}</div></div><div class="svv">${money(w.annualCost)}/yr</div></div>`).join('');
  return `
    <div class="kpis" style="grid-template-columns:repeat(6,1fr)">${kpis}</div>
    <div class="ovgrid3" style="margin-top:16px">
      <section class="card"><div class="miniTitle">Opportunity by Department</div>${donut(deptSegs, String(e.workflowsAnalyzed), 'workflows')}</section>
      <section class="card"><div class="miniTitle">Top Workflows by Annual Hours Saved</div>${topBars}</section>
      <section class="card"><div class="miniTitle">Automation Readiness</div>${donut(rSegs, e.avgReadiness+'%', 'avg')}</section>
    </div>
    <div class="ovgrid2">
      <section class="card"><div class="miniTitle">Top Savings Opportunities</div><div class="savlist" id="savlist">${savings}</div></section>
      <section class="card"><div class="miniTitle">Recent Analyses</div><div class="recent" id="recentBox">${renderRecent()}</div></section>
    </div>`;
}
function renderRecent(){
  if(!recent.length) return `<div class="rcd">No analyses run yet. Search a workflow, task, or tool up top and hit <b>Live MAVIS Analysis</b>.</div>`;
  return recent.slice(0,4).map(r=>`<div class="rc" data-id="${r.id}"><div><div class="rcn">${esc(r.name)}</div><div class="rcd">${esc(r.dept)}</div></div><div class="rcv">${money(r.annualCost)}/yr</div></div>`).join('');
}
function wireOverview(){
  document.querySelectorAll('#savlist .sv[data-id]').forEach(x=>x.onclick=()=>openAnalysis(x.dataset.id));
  document.querySelectorAll('#recentBox .rc[data-id]').forEach(x=>x.onclick=()=>openAnalysis(x.dataset.id));
}

function viewWorkflows(){
  const rows=filteredWorkflows();
  const trs=rows.map(w=>`<tr data-id="${w.id}"><td><b>${esc(w.name)}</b><div class="s" style="font-size:11.5px;color:var(--muted)">${w.id} · ${esc(w.dept)}</div></td>
    <td>${esc(w.frequency)}</td>
    <td><span class="score"><span class="mini"><i style="width:0" data-w="${w.manualEffort}%"></i></span>${w.manualEffort}</span></td>
    <td><span class="score"><span class="mini"><i style="width:0" data-w="${w.readiness}%"></i></span>${w.readiness}</span></td>
    <td><span class="pill p-${w.priority}">${w.priority}</span></td>
    <td>${money(w.monthlyCost)}/mo</td></tr>`).join('');
  return `<section class="card"><h2 class="sec">Workflow Analysis &middot; ${rows.length} of ${DATA.workflows.length} shown</h2>
    <p class="lead">Recurring, manual, high-effort processes MAVIS flagged as automation candidates. Click any row for the full analysis.</p>
    <table><thead><tr><th>Workflow</th><th>Frequency</th><th>Manual effort</th><th>Automation readiness</th><th>Priority</th><th>Impact</th></tr></thead><tbody>${trs||'<tr><td colspan="6">No workflows match the current filters.</td></tr>'}</tbody></table></section>`;
}
function wireRows(){ document.querySelectorAll('#view tbody tr[data-id]').forEach(tr=>tr.onclick=()=>openWorkflow(tr.dataset.id)); }

function viewOpportunities(){
  const rep=Object.entries(DATA.byRepType).sort((a,b)=>b[1]-a[1]);
  const maxR=Math.max(...rep.map(r=>r[1]));
  const repBars=rep.map(([k,v])=>`<div class="bar-row"><div class="name">${esc(k)}</div><div class="bar-track"><div class="bar-fill c3" style="width:0" data-w="${(v/maxR*100).toFixed(1)}%"></div></div><div class="amt">${v}</div></div>`).join('');
  const types=Object.entries(DATA.byAutoType).sort((a,b)=>b[1]-a[1]);
  const maxT=Math.max(...types.map(t=>t[1]));
  const typeBars=types.map(([k,v])=>`<div class="bar-row"><div class="name">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="${(v/maxT*100).toFixed(1)}%"></div></div><div class="amt">${v}</div></div>`).join('');
  const cards=filteredWorkflows().map(w=>`<div class="icard" style="margin-bottom:12px"><div class="in">${esc(w.name)} <span class="pill p-${w.priority}" style="margin-left:6px">${w.priority}</span></div>
    <div class="id">${esc(w.dept)} · ${esc(w.frequency)}</div>
    <div style="margin-top:8px">${w.repetitive.map(r=>`<span class="chip type">${esc(r)}</span>`).join('')}</div>
    <div style="margin-top:6px"><span class="chip">Recommend: ${esc(w.autoType)}</span> ${w.aiAgents.map(a=>`<span class="chip ai">${esc(a)}</span>`).join('')}</div></div>`).join('');
  return `<section class="card"><h2 class="sec">Repetitive Task Signals Detected</h2>
    <p class="lead">MAVIS scans each workflow for repetitive activity patterns. Detection counts across all ${DATA.workflows.length} workflows:</p>${repBars}</section>
    <section class="card"><h2 class="sec">Recommended Automation Strategy</h2>${typeBars}</section>
    <section class="card"><h2 class="sec">Per-Workflow Detection &amp; Recommendation</h2>${cards}</section>`;
}

function viewImpact(){
  const w=DATA.workflows, e=DATA.exec;
  const avgPerExec=Math.round(w.reduce((s,x)=>s+x.perExec,0)/w.length);
  const avgProd=Math.round(w.reduce((s,x)=>s+x.productivity,0)/w.length);
  const y3roi=Math.round(((e.annualCost*3-e.totalImplCost)/e.totalImplCost)*100);
  const blendedPayback=(e.totalImplCost/e.monthlyCost).toFixed(1);
  const card=(l,c,valHtml)=>`<div class="kpi ${c}">${valHtml}<div class="lbl">${l}</div></div>`;
  const cards=[
    card('avg time saved / execution','',num(avgPerExec,{suf:' min'})),
    card('weekly hours saved','',num(Math.round(e.monthlyHours/4.33),{comma:true})),
    card('monthly hours saved','',num(e.monthlyHours,{comma:true})),
    card('annual hours saved','',num(e.annualHours,{comma:true})),
    card('annual labor cost savings','alt',num(e.annualCost,{pre:'$',comma:true})),
    card('avg productivity gain','alt',num(avgProd,{suf:'%'})),
    card('3-year ROI','alt',num(y3roi,{suf:'%'})),
    card('blended payback','alt',num(parseFloat(blendedPayback),{suf:' mo',dec:1})),
  ].join('');
  const phaseRows=['Phase 1 - Quick Wins','Phase 2 - Build','Phase 3 - Scale'].map(p=>{
    const c=w.filter(x=>x.phase===p).reduce((s,x)=>s+x.monthlyCost,0);
    return {p,c};
  });
  const maxP=Math.max(...phaseRows.map(r=>r.c));
  const phaseBars=phaseRows.map(r=>`<div class="bar-row"><div class="name">${esc(r.p)}</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="${(r.c/maxP*100).toFixed(1)}%"></div></div><div class="amt">${money(r.c)}</div></div>`).join('');
  const top=[...w].sort((a,b)=>b.roi-a.roi).slice(0,8).map(x=>`<tr data-id="${x.id}"><td><b>${esc(x.name)}</b></td><td>${esc(x.dept)}</td><td>${money(x.annualCost)}</td><td>${x.roi}%</td><td>${x.payback} mo</td></tr>`).join('');
  return `<section class="card"><h2 class="sec">Business Impact &middot; Estimated Hours &amp; Cost Savings</h2>
    <p class="lead">Projected operational impact if the recommended automations are implemented. Total build investment: <b>${money(e.totalImplCost)}</b>.</p>
    <div class="kpis">${cards}</div></section>
    <section class="card"><h2 class="sec">Monthly $ Saved by Roadmap Phase</h2>${phaseBars}</section>
    <section class="card"><h2 class="sec">Highest-ROI Opportunities</h2>
    <table><thead><tr><th>Workflow</th><th>Department</th><th>Annual savings</th><th>Year-1 ROI</th><th>Payback</th></tr></thead><tbody>${top}</tbody></table></section>`;
}

function viewRoadmap(){
  const phases=[['Phase 1 - Quick Wins','rc1'],['Phase 2 - Build','rc2'],['Phase 3 - Scale','rc3']];
  const cols=phases.map(([p,cls])=>{
    const items=DATA.roadmap.filter(i=>i.phase===p);
    const tot=items.reduce((s,i)=>s+i.est_monthly_cost_saved,0);
    const cards=items.map(i=>`<div class="icard"><div class="in">${esc(i.initiative)}</div><div class="id">${esc(i.department)}</div>
      <div style="margin-top:8px"><span class="chip">${money(i.est_monthly_cost_saved)}/mo</span><span class="chip">${i.est_monthly_hours_saved} hrs/mo</span></div>
      <div class="id" style="margin-top:8px"><b>Depends on:</b> ${esc(i.dependencies)}</div>
      <div class="ir"><span class="pill p-${i.priority}">${i.priority}</span><span class="status ${statusKey(i.status)}">${esc(i.status)}</span></div></div>`).join('');
    return `<div class="rcol"><div class="rh ${cls}"><span>${esc(p)}</span><span>${money(tot)}/mo</span></div>${cards}</div>`;
  }).join('');
  return `<section class="card"><h2 class="sec">Implementation Roadmap &middot; Prioritized by Value &amp; Effort</h2>
    <p class="lead">A phased plan MAVIS generates from the analysis. Each initiative carries priority, projected savings, dependencies, and status.</p>
    <div class="road">${cols}</div></section>`;
}

// premium section header used across Tools / CSA / API sections
function sectionHero(icon,title,sub,stats){
  const chips=(stats||[]).map(s=>`<div class="heroStat"><b>${s[0]}</b><span>${esc(s[1])}</span></div>`).join('');
  return `<div class="secHero"><div class="secHero-orbs"></div><div class="secHero-row"><div class="secHero-ic">${icon}</div><div class="secHero-tt"><div class="secHero-t">${esc(title)}</div><div class="secHero-s">${sub}</div></div></div>${chips?`<div class="heroStats">${chips}</div>`:''}</div>`;
}
// ---------- Tools = individual apps/platforms MAVIS supports (browse-only) ----------
function viewTools(){
  const c=DATA.catalog; if(!c) return `<section class="card"><h2 class="sec">Tools</h2><p class="lead">Catalog unavailable.</p></section>`;
  const chips=['All',...c.categories.map(x=>x.name)].map((name,i)=>{
    const cnt=name==='All'?c.documented:((c.categories.find(x=>x.name===name)||{}).count||0);
    return `<button class="catchip${i===0?' active':''}" data-cat="${esc(name)}">${esc(name)} <span>${cnt}</span></button>`;
  }).join('');
  const cards=c.tools.map(t=>{
    const skills=(t.caps||[]).slice(0,2).map(cap=>{ const sk=cap.split(/[:—(-]/)[0].trim(); return `<span class="ecoSkill">${esc(sk.length>32?sk.slice(0,31)+'…':sk)}</span>`; }).join('');
    const hay=(t.display+' '+t.slug+' '+(t.aliases||[]).join(' ')+' '+t.cat+' '+(t.caps||[]).join(' ')).toLowerCase();
    return `<div class="ecoCard" data-slug="${esc(t.slug)}" data-cat="${esc(t.cat)}" data-hay="${esc(hay)}">
      <div class="ecoHead"><div class="ecoLogo" style="background:${ecoColor(t.slug)}">${esc(ecoInitials(t.display))}</div>
        <div class="ecoId"><div class="ecoName">${esc(t.display)}</div><div class="ecoCat">${esc(t.cat)}</div></div>
        <span class="ecoStatus"><i></i>Supported</span></div>
      <div class="ecoMetric"><span class="ecoDot"></span>${(t.caps||[]).length} MAVIS capabilities</div>
      <div class="ecoSkills">${skills||'<span class="ecoSkill">API automation</span>'}</div>
      <button class="ecoExplore" data-slug="${esc(t.slug)}">Explore capabilities &rarr;</button></div>`;
  }).join('');
  return `<section class="card">
    ${sectionHero('&#9881;','Tools','Individual applications &amp; platforms MAVIS supports &mdash; search or browse the catalog and open any tool to see what MAVIS can automate with it.',[[c.apps.toLocaleString(),'Connectable apps'],[c.documented,'Documented tools'],[c.categories.length,'Categories']])}
    <div class="apiSearchRow"><input id="toolQ" class="ecoSearch" placeholder="Search a tool &mdash; HubSpot, Slack, Notion, Stripe, Shopify..." autocomplete="off"></div>
    <div class="catchips">${chips}</div>
    <div class="ccount" id="ccount"></div>
    <div class="ecoGrid" id="cgrid">${cards}</div>
    <div class="pager" id="cpager"></div></section>`;
}
// shared numbered pager (Prev · 1 … n · Next · Page X of Y)
function pagerHTML(cur,pages){
  if(pages<=1) return '';
  const btn=(label,pg,dis,act)=>`<button class="pgbtn${act?' act':''}" data-pg="${pg}"${dis?' disabled':''}>${label}</button>`;
  const nums=[]; const win=2, lo=Math.max(1,cur-win), hi=Math.min(pages,cur+win);
  if(lo>1){ nums.push(btn('1',1,false,cur===1)); if(lo>2) nums.push('<span class="pgdots">&hellip;</span>'); }
  for(let i=lo;i<=hi;i++) nums.push(btn(String(i),i,false,i===cur));
  if(hi<pages){ if(hi<pages-1) nums.push('<span class="pgdots">&hellip;</span>'); nums.push(btn(String(pages),pages,false,cur===pages)); }
  return `<div class="pgrow">${btn('&larr; Prev',Math.max(1,cur-1),cur===1)}<span class="pgnums">${nums.join('')}</span>${btn('Next &rarr;',Math.min(pages,cur+1),cur===pages)}</div><div class="pgof">Page ${cur} of ${pages}</div>`;
}
function wireTools(){
  const grid=$('#cgrid'), cnt=$('#ccount'), q=$('#toolQ'); if(!grid) return; let cat='All';
  const PAGE=10; let page=1;
  const cards=[...grid.querySelectorAll('.ecoCard')];
  const apply=(reset)=>{ if(reset) page=1;
    const term=(q&&q.value||'').trim().toLowerCase();
    const matched=cards.filter(c=>(cat==='All'||c.dataset.cat===cat)&&(!term||(c.dataset.hay||'').includes(term)));
    const total=matched.length, pages=Math.max(1,Math.ceil(total/PAGE)); if(page>pages) page=pages;
    cards.forEach(c=>c.style.display='none');
    matched.slice((page-1)*PAGE,page*PAGE).forEach(c=>c.style.display='');
    const startN=total?((page-1)*PAGE+1):0, endN=Math.min(page*PAGE,total);
    if(cnt) cnt.textContent=total?`Showing ${startN.toLocaleString()}–${endN.toLocaleString()} of ${total.toLocaleString()} tool${total===1?'':'s'}`:`No tools match — try another name or category.`;
    const pg=$('#cpager'); if(pg){ pg.innerHTML=pagerHTML(page,pages); pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ page=+b.dataset.pg; apply(); grid.scrollIntoView({behavior:'smooth',block:'start'}); }); }
  };
  if(q) q.addEventListener('input',()=>apply(true));
  document.querySelectorAll('.catchip').forEach(b=>b.onclick=()=>{ cat=b.dataset.cat; document.querySelectorAll('.catchip').forEach(x=>x.classList.toggle('active',x===b)); apply(true); });
  grid.querySelectorAll('.ecoExplore').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); openCatalogTool(b.dataset.slug); });
  cards.forEach(card=>card.onclick=()=>openCatalogTool(card.dataset.slug));
  apply(true);
}

// ---------- Integration Library = interactive AI ecosystem hub ----------
function ecoColor(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; const hue=h%360; return `hsl(${hue} 70% 58%)`; }
function ecoInitials(name){ const p=name.replace(/[^A-Za-z0-9 ]/g,'').split(/\s+/).filter(Boolean); return ((p[0]||'?')[0]+(p[1]?p[1][0]:(p[0][1]||''))).toUpperCase(); }
function toolIntegrations(display){ const d=display.toLowerCase(); return (DATA.catalog.integrations||[]).filter(i=>i.tools.some(t=>t.toLowerCase()===d)); }
function connCount(display){ return toolIntegrations(display).length; }
function ecoAutomations(p){ return Math.max(3, connCount(p.display)); } // real "automations available" count
function viewCatalog(){
  const c=DATA.catalog; const tools=(c&&c.tools)||[]; const ints=(c&&c.integrations)||[]; const cats=(c&&c.categories)||[];
  if(!tools.length) return `<section class="card"><h2 class="sec">Integration Library</h2><p class="lead">Ecosystem unavailable.</p></section>`;
  // enrich + rank platforms by connectivity
  const plats=tools.map(t=>({...t, conn:connCount(t.display)})).sort((a,b)=>b.conn-a.conn);
  const nodes=plats.slice(0,16);
  // ----- ecosystem map (SVG radial) -----
  const W=780,H=440,cx=W/2,cy=H/2,R=160;
  const pos={}; nodes.forEach((n,i)=>{ const a=(-90+i*360/nodes.length)*Math.PI/180; pos[n.slug]={x:+(cx+R*Math.cos(a)).toFixed(1),y:+(cy+R*Math.sin(a)).toFixed(1)}; });
  const links=nodes.map(n=>`<line class="eco-link" x1="${cx}" y1="${cy}" x2="${pos[n.slug].x}" y2="${pos[n.slug].y}" data-link="${n.slug}"/>`).join('');
  // inter-node integration edges (faint web) — pairs where both are map nodes
  const nodeSet=new Set(nodes.map(n=>n.display.toLowerCase())); const drawn=new Set(); let edges='';
  for(const it of ints){ if(it.tools.length<2) continue; const a=it.tools[0].toLowerCase(),b=it.tools[1].toLowerCase(); if(nodeSet.has(a)&&nodeSet.has(b)){ const k=[a,b].sort().join('|'); if(drawn.has(k))continue; drawn.add(k); const na=nodes.find(n=>n.display.toLowerCase()===a),nb=nodes.find(n=>n.display.toLowerCase()===b); const pa=pos[na.slug],pb=pos[nb.slug]; const mx=(pa.x+pb.x)/2+(cy-((pa.y+pb.y)/2))*0.12, my=(pa.y+pb.y)/2+(((pa.x+pb.x)/2)-cx)*0.12; edges+=`<path class="eco-edge" d="M${pa.x} ${pa.y} Q${mx.toFixed(1)} ${my.toFixed(1)} ${pb.x} ${pb.y}"/>`; if(drawn.size>=14)break; } }
  const nodeEls=nodes.map(n=>{ const p=pos[n.slug],col=ecoColor(n.slug); return `<g class="eco-node" data-node="${esc(n.slug)}" transform="translate(${p.x},${p.y})">
     <circle class="eco-node-hit" r="30"/><circle class="eco-node-c" r="20" style="fill:${col}"/>
     <text class="eco-node-i" y="4">${esc(ecoInitials(n.display))}</text>
     <text class="eco-node-l" y="38">${esc(n.display.length>14?n.display.slice(0,13)+'…':n.display)}</text></g>`; }).join('');
  const map=`<svg class="ecomap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><radialGradient id="coreG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#6366f1"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g class="eco-edges">${edges}</g><g class="eco-links">${links}</g>
    <g class="eco-core"><circle class="eco-core-glow" cx="${cx}" cy="${cy}" r="46"/><circle cx="${cx}" cy="${cy}" r="34" fill="url(#coreG)" filter="url(#glow)"/><text class="eco-core-t" x="${cx}" y="${cy+5}">MAVIS</text></g>
    <g class="eco-nodes">${nodeEls}</g></svg>`;
  // ----- animated flow strip -----
  const flows=[['Gmail','MAVIS','HubSpot','Slack'],['Shopify','MAVIS','Klaviyo','Google Sheets'],['Stripe','MAVIS','QuickBooks','Slack'],['Calendly','MAVIS','Zoom','Notion']];
  const flow=flows[0].map((t,i)=>`<span class="flow-node${t==='MAVIS'?' core':''}">${esc(t)}</span>${i<3?'<span class="flow-conn"><i></i></span>':''}`).join('');
  // ----- MAVIS recommendations -----
  const recs=[
    {tools:['HubSpot','Gmail'],title:'Automate lead nurturing',why:'You frequently manage customer follow-ups.',hrs:'6 hrs/wk saved',tasks:'40 tasks/mo automated',steps:'5 manual steps removed'},
    {tools:['Stripe','QuickBooks'],title:'Auto-reconcile payments',why:'Invoices and payments are reconciled by hand.',hrs:'5 hrs/wk saved',tasks:'120 transactions/mo',steps:'4 manual steps removed'},
    {tools:['Google Calendar','Zoom','Slack'],title:'Coordinate meetings end to end',why:'Scheduling and reminders eat into the week.',hrs:'3 hrs/wk saved',tasks:'30 meetings/mo',steps:'3 manual steps removed'},
  ].map(r=>`<div class="recCard"><div class="recPair">${r.tools.map(t=>`<span class="recTool" style="--rc:${ecoColor(t)}">${esc(t)}</span>`).join('<span class="recPlus">+</span>')}</div>
     <div class="recWhy">${esc(r.why)}</div><div class="recTitle">${esc(r.title)}</div>
     <div class="recImpact"><span>&#9201; ${r.hrs}</span><span>&#9889; ${r.tasks}</span><span>&#10003; ${r.steps}</span></div></div>`).join('');
  // ----- category chips (friendly) -----
  const chips=['All',...cats.map(x=>x.name)].map((name,i)=>{ const cnt=name==='All'?tools.length:((cats.find(x=>x.name===name)||{}).count||0); return `<button class="catchip${i===0?' active':''}" data-cat="${esc(name)}">${esc(name)} <span>${cnt}</span></button>`; }).join('');
  // ----- enhanced platform cards -----
  const cards=plats.map(p=>{
    const hay=(p.display+' '+p.slug+' '+(p.aliases||[]).join(' ')+' '+p.cat+' '+(p.caps||[]).join(' ')).toLowerCase();
    const skills=(p.caps||[]).slice(0,2).map(cap=>{ const sk=cap.split(/[:—(-]/)[0].trim(); return `<span class="ecoSkill">${esc(sk.length>34?sk.slice(0,33)+'…':sk)}</span>`; }).join('');
    return `<div class="ecoCard" data-slug="${esc(p.slug)}" data-cat="${esc(p.cat)}" data-hay="${esc(hay)}">
       <div class="ecoHead"><div class="ecoLogo" style="background:${ecoColor(p.slug)}">${esc(ecoInitials(p.display))}</div>
         <div class="ecoId"><div class="ecoName">${esc(p.display)}</div><div class="ecoCat">${esc(p.cat)}</div></div>
         <span class="ecoStatus"><i></i>Connected</span></div>
       <div class="ecoMetric"><span class="ecoDot"></span>${ecoAutomations(p)} automations available</div>
       <div class="ecoSkills">${skills||'<span class="ecoSkill">API automation</span>'}</div>
       <button class="ecoExplore" data-slug="${esc(p.slug)}">Explore capabilities &rarr;</button></div>`;
  }).join('');
  return `<section class="card ecoWrap"><h2 class="sec">Integration Library &middot; MAVIS Ecosystem</h2>
    <p class="lead">A live map of the platforms MAVIS connects &mdash; and how data and automations flow between them. Explore the ecosystem, discover integrations, and let MAVIS recommend what to connect next.</p>
    <div class="ecoStatsRow"><div class="ecoStat"><b>${c.apps.toLocaleString()}</b><span>Connectable apps</span></div><div class="ecoStat"><b>${tools.length}</b><span>Platforms mapped</span></div><div class="ecoStat"><b>${ints.length.toLocaleString()}</b><span>Prebuilt integrations</span></div><div class="ecoStat"><b>${cats.length}</b><span>Categories</span></div></div>
    <div class="ecoMapWrap"><div class="ecoMapInner">${map}</div>
      <div class="ecoFocus" id="ecoFocus"><div class="ecoFocusHint">Hover or tap a platform to see how MAVIS connects it.</div></div></div>
    <div class="ecoFlow"><div class="ecoFlowLabel">How integrations work together</div><div class="flowStrip" id="flowStrip">${flow}</div></div>
    <div class="ecoRecs"><div class="ecoSubh"><span class="ecoSpark">&#10022;</span> MAVIS Recommendations</div><div class="recGrid">${recs}</div></div>
    <div class="ecoDiscover"><div class="ecoSubh">Discover integrations</div>
      <div class="ecoSearchRow"><input id="ecoQ" class="ecoSearch" placeholder="Search a platform or a task — &ldquo;send emails&rdquo;, &ldquo;manage leads&rdquo;, &ldquo;create reports&rdquo;, &ldquo;schedule meetings&rdquo;..." autocomplete="off"></div>
      <div class="catchips">${chips}</div><div class="ccount" id="ecoCount"></div>
      <div class="ecoGrid" id="ecoGrid">${cards}</div>
      <div class="pager" id="ecopager"></div></div></section>`;
}
function wireCatalog(){
  const grid=$('#ecoGrid'); if(!grid) return; let cat='All';
  const cards=[...grid.querySelectorAll('.ecoCard')], q=$('#ecoQ'), cnt=$('#ecoCount');
  const PAGE=24; let page=1;
  const apply=(reset)=>{
    if(reset) page=1;
    const raw=(q&&q.value||'').trim().toLowerCase();
    const toks=raw.split(/[^a-z0-9]+/).filter(t=>t.length>2&&!RANK_STOP.has(t)).map(t=>t.replace(/s$/,''));  // singularize for task search
    const matched=cards.filter(cd=>(cat==='All'||cd.dataset.cat===cat)&&(!toks.length||toks.every(t=>cd.dataset.hay.includes(t))));
    const total=matched.length, pages=Math.max(1,Math.ceil(total/PAGE)); if(page>pages) page=pages;
    cards.forEach(cd=>cd.style.display='none');
    matched.slice((page-1)*PAGE,page*PAGE).forEach(cd=>cd.style.display='');
    const startN=total?((page-1)*PAGE+1):0, endN=Math.min(page*PAGE,total);
    if(cnt) cnt.textContent=`Showing ${startN.toLocaleString()}–${endN.toLocaleString()} of ${total.toLocaleString()} platform${total===1?'':'s'}`;
    const pg=$('#ecopager'); if(pg){ pg.innerHTML=pagerHTML(page,pages); pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ page=+b.dataset.pg; apply(); grid.scrollIntoView({behavior:'smooth',block:'start'}); }); }
  };
  if(q) q.addEventListener('input',()=>apply(true));
  document.querySelectorAll('.catchip').forEach(b=>b.onclick=()=>{ cat=b.dataset.cat; document.querySelectorAll('.catchip').forEach(x=>x.classList.toggle('active',x===b)); apply(true); });
  grid.querySelectorAll('.ecoExplore').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); openCatalogTool(b.dataset.slug); });
  grid.querySelectorAll('.ecoCard').forEach(cd=>cd.onclick=()=>openCatalogTool(cd.dataset.slug));
  // ecosystem map interactivity
  const focus=$('#ecoFocus');
  document.querySelectorAll('.eco-node').forEach(g=>{
    const slug=g.dataset.node;
    const show=()=>{ const t=(DATA.catalog.tools||[]).find(x=>x.slug===slug); if(!t||!focus) return;
      const its=toolIntegrations(t.display).slice(0,3);
      document.querySelectorAll('.eco-node').forEach(x=>x.classList.remove('on'));
      document.querySelectorAll('.eco-link').forEach(l=>l.classList.toggle('on',l.dataset.link===slug));
      g.classList.add('on');
      focus.innerHTML=`<div class="ecoFocusHead"><div class="ecoLogo sm" style="background:${ecoColor(slug)}">${esc(ecoInitials(t.display))}</div><div><div class="ecoFocusName">${esc(t.display)}</div><div class="ecoCat">${esc(t.cat)} &middot; ${connCount(t.display)} integrations</div></div></div>
        <div class="ecoFocusSub">MAVIS capabilities</div><div class="ecoFocusCaps">${(t.caps||[]).slice(0,3).map(c=>`<div>&bull; ${esc(c)}</div>`).join('')||'—'}</div>
        <div class="ecoFocusSub">Example automations</div><div class="ecoFocusCaps">${its.length?its.map(i=>`<div>&#9889; ${esc(i.tools.join(' + '))} &rarr; ${esc(i.desc)}</div>`).join(''):'<div>—</div>'}</div>
        <button class="ecoExplore" data-slug="${esc(slug)}">Explore capabilities &rarr;</button>`;
      const eb=focus.querySelector('.ecoExplore'); if(eb) eb.onclick=()=>openCatalogTool(slug);
    };
    g.addEventListener('mouseenter',show); g.addEventListener('click',show);
  });
  apply();
}
function openCatalogTool(slug){
  const t=(DATA.catalog&&DATA.catalog.tools||[]).find(x=>x.slug===slug); if(!t) return;
  const caps=(t.caps||[]).map(c=>`<div class="caprow">&bull; ${esc(c)}</div>`).join('')||'<div class="v" style="color:var(--muted)">—</div>';
  const its=toolIntegrations(t.display).slice(0,6);
  const combos=its.length?its.map(i=>`<div class="caprow combo">&#9889; ${esc(i.tools.join(' + '))} &rarr; ${esc(i.desc)}</div>`).join(''):'<div class="v" style="color:var(--muted)">—</div>';
  const aliases=(t.aliases||[]).length?` <span style="color:var(--muted);font-weight:500;font-size:13px">(${t.aliases.map(esc).join(', ')})</span>`:'';
  openDrawer(`<div class="dhead"><span class="dclose" data-close>&times;</span><h3>${esc(t.display)}${aliases}</h3><div class="meta">${esc(t.cat)}</div></div>
  <div class="dbody">
    <div class="field"><div class="k">What MAVIS can automate with ${esc(t.display)}</div><div class="v">${caps}</div></div>
    <div class="field"><div class="k">Example automations</div><div class="v">${combos}</div></div>
    <div class="field"><div class="k">Connect via</div><div class="v">MAVIS connects to ${esc(t.display)} through its API / Pipedream &mdash; one of ${DATA.catalog.apps.toLocaleString()} apps MAVIS can orchestrate.</div></div>
  </div>`);
}

// ---------- CSA enablement sections ----------
function accItem(title,body,meta,cls){ return `<div class="acc ${cls||''}"><button class="acc-h"><span class="acc-t">${title}</span>${meta?`<span class="acc-m">${meta}</span>`:''}<span class="acc-x">&#43;</span></button><div class="acc-b">${body}</div></div>`; }
function wireAccordion(){
  document.querySelectorAll('#view .acc-h').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('open'));
  document.querySelectorAll('#view .copybtn').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); const pre=b.closest('.promptbox').querySelector('.prompttext'); const t=pre.textContent; try{ navigator.clipboard.writeText(t); }catch(_){ const r=document.createRange(); r.selectNodeContents(pre); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); try{document.execCommand('copy');}catch(_){} } const o=b.innerHTML; b.innerHTML='&#10003; Copied'; b.classList.add('done'); setTimeout(()=>{ b.innerHTML=o; b.classList.remove('done'); },1600); });
}
function promptBox(text){ return `<div class="promptbox"><div class="promptbar"><span class="promptlabel">&#10022; Prompt &mdash; paste into Ask MAVIS</span><button class="copybtn">&#128203; Copy</button></div><pre class="prompttext">${esc(text)}</pre></div>`; }
const BRIEF_TEMPLATE=`Task: Automate the weekly client KPI report
Client / Account: <name>
Systems: Google Sheets, Gmail
Inputs: <link to the source sheet>
Output: branded PDF, emailed to the client every Monday
Constraints: our brand colors; draft for my approval before sending
Success: client gets an accurate, on-brand report with zero manual work`;
const HEALTH_PROMPT=`Run an integration health check for <App name>:
1. Confirm the account is connected and the auth token is valid.
2. Make a minimal read call (e.g. list 1 record) and report the HTTP status.
3. List the granted scopes/permissions and flag any missing for our use case.
4. Check recent run logs for errors, timeouts, or rate limits (last 24h).
5. Verdict: HEALTHY / DEGRADED / DOWN - include the exact error message if any.`;
function stripTags(s){ return String(s).replace(/<[^>]+>/g,'').replace(/&rarr;/g,'->').replace(/&mdash;/g,'-').replace(/&rsquo;/g,"'").replace(/&ldquo;|&rdquo;/g,'"').replace(/&amp;/g,'&'); }
function bindCopy(){ document.querySelectorAll('#view .copybtn').forEach(b=>{ b.onclick=(e)=>{ e.stopPropagation(); const pre=b.closest('.promptbox').querySelector('.prompttext'); const t=pre.textContent; try{navigator.clipboard.writeText(t);}catch(_){ try{const r=document.createRange();r.selectNodeContents(pre);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');}catch(__){} } const o=b.innerHTML; b.innerHTML='&#10003; Copied'; b.classList.add('done'); setTimeout(()=>{b.innerHTML=o;b.classList.remove('done');},1500); }; }); }
// ===== CSA (Client Systems Architect) — guided task wizard =====
let csaState={q:'',sel:null};
function viewCSA(){
  const apps=DATA.catalog&&DATA.catalog.apps?DATA.catalog.apps.toLocaleString():'3,399';
  const steps=[
    ['1','Scope the outcome','Define what &ldquo;done&rdquo; looks like for the client &mdash; the deliverable, the systems, and the success criteria.'],
    ['2','Create the task','Write a clear task brief (template below) and hand it to MAVIS via the lookup above, search, or Ask MAVIS.'],
    ['3','Run, review &amp; deliver','Run the Live Analysis, click <b>&#128640; Launch Automation</b>, then review MAVIS&rsquo;s output before it reaches the client.'],
  ].map(s=>`<div class="qstep"><div class="qnum">${s[0]}</div><div><div class="qt">${s[1]}</div><div class="qd">${s[2]}</div></div></div>`).join('');
  const items=[
    accItem('The Client Systems Architect + MAVIS workflow',`<p>As a <b>Client Systems Architect (CSA)</b>, you translate a client&rsquo;s business need into an automated solution. MAVIS is your build engine: you <b>scope</b> the outcome and <b>create the task</b>, MAVIS analyzes the work, recommends the automation, and produces the deliverable across ${apps} connected apps.</p><ul><li><b>You own:</b> discovery, scope, systems mapping, acceptance criteria, and client sign-off.</li><li><b>MAVIS owns:</b> analysis, drafting, data work, integration orchestration, and the first-pass deliverable.</li></ul>`,'Role','csa-accent'),
    accItem('How to create a task',`<p>A task is a clear brief MAVIS can act on. Fill this in and paste it into <b>Ask MAVIS</b> or run the matching capability from <b>What MAVIS Can Do</b>.</p>${promptBox(BRIEF_TEMPLATE)}<p class="csa-tip">The tighter the brief, the closer the first draft. Always attach real inputs (a link to the sheet/folder) rather than describing them.</p>`,'Start here','csa-accent'),
    accItem('How to scope work',`<p>Before creating the task, pin down these six things &mdash; this is your scoping checklist:</p><div class="csa-two"><div><div class="csa-h ok">Define</div><ul><li><b>Outcome</b> &mdash; the deliverable and who consumes it.</li><li><b>Inputs</b> &mdash; source data, docs, and where they live.</li><li><b>Systems</b> &mdash; which tools/integrations are involved.</li></ul></div><div><div class="csa-h ok">Bound</div><ul><li><b>Constraints</b> &mdash; brand, tone, volume, deadline, privacy.</li><li><b>Approvals</b> &mdash; what needs sign-off before it goes out.</li><li><b>Success criteria</b> &mdash; how the client will judge &ldquo;done&rdquo;.</li></ul></div></div><p class="csa-tip">If any of the six is unknown, ask MAVIS to propose it &mdash; e.g. &ldquo;suggest success criteria for automating our onboarding emails.&rdquo;</p>`),
    accItem('Choosing the capability &amp; running the analysis',`<ol><li>Use the <b>Client task lookup</b> above, or search the goal, or pick a card in <b>What MAVIS Can Do</b>.</li><li>Click <b>&#10022; Live MAVIS Analysis</b> &mdash; the top cards show the verdict, business value, AI insight, and readiness.</li><li>Click <b>&#128640; Launch Automation</b> to reveal the full blueprint: workflow breakdown, opportunities, tools needed, and roadmap.</li><li>Use <b>Ask MAVIS</b> for a recommendation if you&rsquo;re unsure which capability fits.</li></ol>`),
    accItem('Writing effective prompts',`<p>Good prompts are specific and give MAVIS the context a new teammate would need:</p><ul><li><b>Weak:</b> &ldquo;make a report.&rdquo;</li><li><b>Strong:</b> &ldquo;Build a monthly KPI report from <i>this sheet</i> with our brand colors, a revenue chart, and a 3-bullet summary; export as PDF.&rdquo;</li></ul><p>Paste a past example so MAVIS matches your style, and state the format explicitly (PDF, Google Sheet, CRM update, email drafts).</p>`),
    accItem('Reviewing, delivering &amp; iterating',`<ul><li><b>Review before send</b> &mdash; MAVIS drafts; you approve. Spot-check numbers and client-facing copy.</li><li>Anything leaving the workspace (emails, posts, shared files) must be intentional and privacy-safe.</li><li>Deliverables land in the review queue &mdash; approve, request changes, or ask MAVIS to iterate (&ldquo;tighten the intro,&rdquo; &ldquo;use last quarter&rsquo;s numbers&rdquo;).</li><li>Save the winning prompt for recurring work so the next run is one click.</li></ul>`),
    accItem('What MAVIS can &amp; can&rsquo;t do',`<div class="csa-two"><div><div class="csa-h ok">MAVIS can</div><ul><li>Draft, extract, research, summarize, and build reports/decks/sheets.</li><li>Automate across ${apps} connected apps (with an authorized connection).</li><li>Read public web pages and the documents you provide.</li></ul></div><div><div class="csa-h no">MAVIS needs a human for</div><ul><li>Final approval before sending client-facing messages.</li><li>Access it hasn&rsquo;t been granted (locked pages, un-connected accounts).</li><li>Judgment calls on sensitive or ambiguous decisions.</li></ul></div></div><p class="csa-tip">Integration acting up? See the <b>CSA Tech Manager</b> for health checks, fixes, and escalation.</p>`),
  ].join('');
  return `<section class="card">
    ${sectionHero('&#9672;','CSA (Client Systems Architect)','For <b>Client Systems Architects</b> &mdash; look up any client task, tool, or keyword for a workflow idea &amp; the tools needed, plus the full guide to using MAVIS.',[[(DATA.deliverables||[]).length,'Capabilities'],[apps,'Connected apps'],['Lookup','+ full guide']])}
    <div class="csaLookup"><div class="ecoSubh" style="margin-top:0">&#128269; Client task lookup</div>
      <p class="wizsub" style="margin:0 0 10px">Enter a <b>tool</b>, <b>keyword</b>, or the <b>task a client gave you</b> &mdash; MAVIS returns the workflow idea, the tools needed, and a full delivery plan.</p>
      <input id="csaSearch" class="ecoSearch" placeholder="e.g. HubSpot, invoicing, send weekly report, onboard new client, scrape leads..." autocomplete="off">
      <div id="csaResults"></div></div>
    <div class="ecoSubh">CSA guide</div>
    <div class="qsteps">${steps}</div>
    <div class="accList">${items}</div></section>`;
}
function wireCSA(){
  const q=$('#csaSearch'); csaState={q:'',sel:null,recipes:[]};
  if(q){ q.addEventListener('input',()=>{ csaState.sel=null; csaState.recipes=null; renderCSAResults(q.value); }); }
  renderCSAResults('');
  document.querySelectorAll('#view .acc-h').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('open'));
  bindCopy();
}
// ---- workflow-recipe discovery engine ----
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; }
function sentence(s){ s=String(s).trim(); return s.charAt(0).toUpperCase()+s.slice(1); }
function recipeMetrics(r){ const h=hashStr(r.title+r.tools.join()); const complexity=['Low','Medium','Medium','High'][h%4]; const timeSaved=2+(h>>3)%9; const effort=complexity==='Low'?'~1 hr setup':complexity==='High'?'~1 day setup':'~2-3 hrs setup'; return {complexity,timeSaved,effort}; }
function intRecipe(i){ const near=rankCaps(i.desc+' '+i.tools.join(' '),1)[0]; return {kind:'integration',tools:i.tools.slice(),desc:i.desc,cat:i.cat,title:sentence(i.desc),wfId:near?near.w.id:DATA.workflows[0].id}; }
function capRecipe(w){ return {kind:'capability',tools:(w.integrations||[]).slice(),desc:w.autoRec||w.autoType,cat:w.dept,title:w.name,wfId:w.id}; }
function buildRecipes(query){ return mavisSearch(query,10); }
function intsByTool(name){ const n=name.toLowerCase(); return (DATA.catalog.integrations||[]).filter(i=>i.tools.some(t=>t.toLowerCase()===n)); }
function renderCSAResults(q){
  csaState.q=q; const box=$('#csaResults'); if(!box) return;
  const query=(q||'').trim();
  if(!query){ box.innerHTML=''; csaState.recipes=[]; csaState.sel=null; return; }
  if(!csaState.recipes) csaState.recipes=buildRecipes(query);
  const recs=csaState.recipes;
  if(csaState.sel!=null && recs[csaState.sel]){
    const r=recs[csaState.sel];
    box.innerHTML=`<div class="wizrow" style="margin:12px 0"><button class="wizghost" id="csaBack2">&larr; Back to results</button><button class="runbtn hero" id="csaRun2">&#10022; Run Live Analysis</button></div>${recipeDetail(r)}`;
    $('#csaBack2').onclick=()=>{ csaState.sel=null; renderCSAResults(csaState.q); window.scrollTo({top:220,behavior:'smooth'}); };
    $('#csaRun2').onclick=()=>selectAnalysis(r.wfId);
    bindCopy(); return;
  }
  if(!recs.length){ box.innerHTML=`<div class="csaResHint">No automations found for &ldquo;${esc(query)}&rdquo;. Try a tool (<b>QuickBooks</b>), a task (<b>build a sales dashboard</b>), or a process (<b>invoicing</b>, <b>onboarding</b>, <b>lead generation</b>).</div>`; return; }
  box.innerHTML=`<div class="csaResHint"><b>${recs.length}</b> automation${recs.length===1?'':'s'} MAVIS can build for &ldquo;${esc(query)}&rdquo; &mdash; click one for the full implementation guide.</div>
    <div class="csaResGrid">${recs.map((r,idx)=>recipeCard(r,idx)).join('')}</div>`;
  box.querySelectorAll('.recipeOpen').forEach(b=>b.onclick=()=>{ csaState.sel=+b.dataset.i; renderCSAResults(csaState.q); window.scrollTo({top:220,behavior:'smooth'}); });
  box.querySelectorAll('.recipeRun').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); selectAnalysis(b.dataset.wf); });
}
function recipeCard(r,idx){
  const mx=recipeMetrics(r);
  const chips=(r.tools.length?r.tools:['MAVIS']).slice(0,4).map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('');
  return `<div class="recipeCard"><div class="recipeTop"><div class="recipeName">${esc(r.title)}</div><span class="recipeCx cx-${mx.complexity.toLowerCase()}">${mx.complexity}</span></div>
    <div class="recipeDesc">${r.kind==='integration'?`Connects ${esc(r.tools.join(' + '))} &mdash; ${esc(r.cat)}`:`${esc(r.cat)} capability`}</div>
    <div class="recipeK">Tools &amp; integrations</div><div class="tchips" style="margin:4px 0 0">${chips}</div>
    <div class="recipeMeta"><span>&#9201; ~${mx.timeSaved} hrs/wk saved</span><span>&#128295; ${mx.effort}</span></div>
    <div class="wizrow"><button class="wizghost recipeOpen" data-i="${idx}">Implementation guide &rarr;</button><button class="runbtn hero recipeRun" data-wf="${esc(r.wfId)}">&#10022; Run Analysis</button></div></div>`;
}
function recipeDetail(r){
  const mx=recipeMetrics(r); const two=r.kind==='integration'&&r.tools.length>=2;
  const A=r.tools[0]||'the source tool', B=r.tools[1]||'the target tool';
  const steps=two?[
    `<b>Trigger</b> &mdash; a new or updated record/event in <b>${esc(A)}</b> (e.g. a new order, contact, payment, or row).`,
    `<b>Capture</b> &mdash; MAVIS reads the event data through the ${esc(A)} API / connected account.`,
    `<b>Transform</b> &mdash; MAVIS validates and maps the fields to <b>${esc(B)}</b>&rsquo;s format.`,
    `<b>Action</b> &mdash; MAVIS ${esc(r.desc)} in ${esc(B)}.`,
    `<b>Confirm</b> &mdash; logs the result, retries on transient errors, and (optionally) alerts you.`,
  ]:[
    `<b>Trigger</b> &mdash; you request it, or it runs on a schedule.`,
    `<b>Gather</b> &mdash; MAVIS pulls the inputs from your connected tools/docs.`,
    `<b>Process</b> &mdash; MAVIS ${esc(r.desc)}.`,
    `<b>Deliver</b> &mdash; produces the output for your review.`,
    `<b>Confirm</b> &mdash; you approve; MAVIS finalizes and logs it.`,
  ];
  const toolsChips=(r.tools.length?r.tools:['Claude','Pipedream']).map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('');
  const buildPrompt=two
    ? `Build this automation: when a new/updated record appears in ${A}, ${stripTags(r.desc)} in ${B}.\nConnect ${A} and ${B}, map the key fields, run a test on one record, and report the result before going live.`
    : `Set up this automation: ${stripTags(r.desc)}.\nUse the connected tools, run a test on a small sample, and show me the result for approval before going live.`;
  // alternatives = other actions for the same primary tool; related = other automations touching either tool
  let alts=[], rel=[];
  if(two){
    const prim=A;
    alts=intsByTool(prim).filter(i=>i.desc.toLowerCase().slice(0,20)!==r.desc.toLowerCase().slice(0,20)).slice(0,3);
    const both=new Set([A.toLowerCase(),B.toLowerCase()]);
    rel=(DATA.catalog.integrations||[]).filter(i=>i.tools.some(t=>both.has(t.toLowerCase())) && i.desc.toLowerCase().slice(0,20)!==r.desc.toLowerCase().slice(0,20) && !alts.includes(i)).slice(0,4);
  }
  const altHtml=alts.length?`<ul>${alts.map(i=>`<li><b>${esc(i.tools.join(' + '))}</b> &mdash; ${esc(i.desc)}</li>`).join('')}</ul>`:`<p>This is the most direct approach. You can also run it on a schedule or trigger it manually.</p>`;
  const relHtml=rel.length?`<div class="tchips">${rel.map(i=>`<span class="ecoSkill">${esc(i.tools.join(' + '))}</span>`).join('')}</div><ul style="margin-top:6px">${rel.slice(0,3).map(i=>`<li>${esc(i.desc)}</li>`).join('')}</ul>`:`<p>Explore the Integration Library for more automations with these tools.</p>`;
  const blocks=[
    ['&#128161; Possible workflow',`<p>${esc(sentence(r.desc))}${two?` &mdash; an automated bridge between <b>${esc(A)}</b> and <b>${esc(B)}</b>.`:'.'}</p>`],
    ['&#9889; Automation opportunities',`<ul><li>Remove the manual copy/paste between ${two?`${esc(A)} and ${esc(B)}`:'systems'}.</li><li>Run it in real time on every event, or batched on a schedule.</li><li>Add alerting so nothing slips through.</li></ul>`],
    ['&#128736; Step-by-step (trigger &rarr; outcome)',`<ol>${steps.map(s=>`<li>${s}</li>`).join('')}</ol>`],
    ['&#128295; Recommended tools &amp; integrations',`<div class="tchips" style="margin:2px 0 8px">${toolsChips}</div><p>Orchestrated by MAVIS via connected accounts (API / Pipedream).</p>`],
    ['&#9989; MAVIS automates &nbsp;vs&nbsp; &#9995; needs a human',`<div class="csa-two"><div><div class="csa-h ok">MAVIS automates</div><ul><li>Trigger detection &amp; data capture</li><li>Field mapping &amp; transformation</li><li>The action + logging &amp; retries</li></ul></div><div><div class="csa-h no">Needs a human</div><ul><li>Granting access / scopes</li><li>Approving client-facing output</li><li>Edge-case &amp; first-run review</li></ul></div></div>`],
    ['&#128273; Prerequisites &amp; permissions',`<ul>${two?`<li>Connected <b>${esc(A)}</b> (read) and <b>${esc(B)}</b> (write) accounts.</li>`:`<li>Connected accounts for the tools above with read/write scope.</li>`}<li>Only the scopes the task needs &mdash; stored via the connected account, not plaintext.</li><li>A test / sandbox record to validate before go-live.</li></ul>`],
    ['&#128200; Estimates',`<div class="delivstats"><div><b>~${mx.timeSaved} hrs/wk</b><span>Time saved</span></div><div><b>${mx.complexity}</b><span>Complexity</span></div><div><b>${mx.effort.replace('setup','').trim()}</b><span>Setup effort</span></div><div><b>${two?'2':'1'}+ tools</b><span>Integrations</span></div></div>`],
    ['&#10022; Ready-to-use MAVIS prompts',promptBox(buildPrompt)],
    ['&#128260; Alternative workflows',altHtml],
    ['&#128279; Related automations',relHtml],
  ];
  return `<div class="wizpanel"><div class="recipeTop"><div class="wizh" style="margin:0">${esc(r.title)}</div><span class="recipeCx cx-${mx.complexity.toLowerCase()}">${mx.complexity}</span></div>
    <p class="wizsub">${two?`Automation between <b>${esc(A)}</b> and <b>${esc(B)}</b>`:`MAVIS capability`} &middot; ${esc(r.cat)}</p>
    <div class="delivgrid">${blocks.map(b=>`<div class="delivblock"><div class="delivh">${b[0]}</div><div class="delivb">${b[1]}</div></div>`).join('')}</div></div>`;
}
function csaDeliver(w,taskText){
  const m=calcM(w); const integ=(w.integrations||[]);
  const canList=(w.repetitive||[]).slice(0,4).map(r=>`<li>${esc(r)}</li>`).join('');
  const perRun=`${fmtDur(m.perRunManual)} &rarr; ~${fmtDur(m.perRunMavis)}`;
  const promptText=`Task: ${stripTags(taskText||w.name)}\nApproach: ${stripTags(w.autoRec||w.autoType)}.\nUse: ${integ.join(', ')||'the connected tools'}.\nDeliver the finished output for my review - draft only; I'll approve before anything is sent.`;
  const blocks=[
    ['&#9989; What MAVIS can do',`<p>${esc(w.autoRec||w.autoType)}</p>${canList?`<ul>${canList}</ul>`:''}`],
    ['&#9888; What MAVIS cannot do / limitations',`<ul><li>Won&rsquo;t send client-facing messages without your approval.</li><li>Needs an authorized connection per tool &mdash; no access to un-connected or paywalled systems.</li><li>Browser steps work on public pages only (no logins / CAPTCHAs).</li><li>Defers sensitive or ambiguous judgment calls to you.</li></ul>`],
    ['&#128295; Required tools, integrations &amp; access',`<div class="tchips" style="margin:2px 0 10px">${(integ.length?integ:['Claude']).map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('')}</div><ul><li>Connected account(s) for the above with read/write scope.</li><li>Source inputs: ${esc(w.currentTools||'your data / docs')}.</li></ul>`],
    ['&#128736; Recommended implementation steps',`<ol><li>Connect &amp; verify the required integrations (run a health check).</li><li>Confirm inputs, field mapping, and the output format.</li><li>Run a test on a small sample and review the result.</li><li>Approve, then run/schedule for real &mdash; monitor the first live run.</li></ol>`],
    ['&#10022; Suggested MAVIS prompts',promptBox(promptText)],
    ['&#128200; Expected outcomes &amp; time savings',`<div class="delivstats"><div><b>${money(w.annualCost)}/yr</b><span>Est. savings</span></div><div><b>${w.annualHours.toLocaleString()} hrs/yr</b><span>Time saved</span></div><div><b>${perRun}</b><span>Per run</span></div><div><b>${w.payback} mo</b><span>Payback</span></div></div>`],
    ['&#9940; Potential blockers &amp; alternatives',`<ul><li><b>No API / access:</b> use a data export or a supported alternative tool.</li><li><b>Messy inputs:</b> standardize headers first, or have MAVIS clean them.</li><li><b>Rate limits / volume:</b> batch or schedule the run.</li><li><b>Approval gates:</b> keep MAVIS in draft mode and review before send.</li></ul>`],
  ];
  return `<div class="wizpanel"><div class="wizh">Delivery plan &mdash; ${esc(w.name)}</div><p class="wizsub">For &ldquo;${esc(taskText||w.name)}&rdquo;, matched to <b>${esc(w.name)}</b> (${esc(w.dept)}).</p>
    <div class="delivgrid">${blocks.map(b=>`<div class="delivblock"><div class="delivh">${b[0]}</div><div class="delivb">${b[1]}</div></div>`).join('')}</div></div>`;
}
// ===== CSA Tech Manager — interactive troubleshooting + integration portal =====
const TROUBLE=[
  {t:'Integration not connected',sev:'High',symptom:'No account is linked for the target app (e.g. "No HubSpot connection found").',cause:'The app has not been authorized, or the connection was revoked.',fix:'Open the Integration Library, confirm the app, and reconnect the account in Pipedream with the needed scopes; then re-run.'},
  {t:'Auth token expired (401)',sev:'High',symptom:'Requests fail with 401 / Unauthorized after previously working.',cause:'OAuth token expired or the account password/permissions changed.',fix:'Reconnect (re-auth) the integration to refresh the token. If it recurs, use a service account without MFA/session limits.'},
  {t:'Rate limit exceeded (429)',sev:'Medium',symptom:'"Too many requests" / 429 during bulk actions.',cause:'The connected app throttles high-volume calls.',fix:'Re-run (MAVIS backs off and retries). For large batches, split into smaller chunks or schedule over time.'},
  {t:'Scanned / image PDF not extracting',sev:'Medium',symptom:'Extraction returns blank or garbled fields from a PDF.',cause:'The PDF is a scanned image with no text layer.',fix:'Provide a text-based PDF or enable OCR; for handwriting expect lower accuracy and review flagged rows.'},
  {t:'Browser automation blocked',sev:'Medium',symptom:'Web capture stalls, returns a login page, or hits a CAPTCHA.',cause:'The page requires login, is paywalled, or blocks bots.',fix:'MAVIS automates public pages only. Provide a data export, connect the app API instead, or supply authorized access.'},
  {t:'Sheet / Drive permission denied',sev:'High',symptom:'"Permission denied" when reading or writing a Google file.',cause:'The file is not shared with the connected Google account.',fix:'Share the sheet/folder with the connected account (Editor), or move it into a shared drive MAVIS can access.'},
  {t:'Email not sending / not delivered',sev:'High',symptom:'A draft is created but nothing sends, or it lands in spam.',cause:'Sending needs an approved connected inbox; or SPF/DKIM not set for the domain.',fix:'Confirm the inbox integration is connected and sending is approved. For deliverability, verify SPF/DKIM/DMARC.'},
  {t:'Trigger / webhook not firing',sev:'Medium',symptom:'A scheduled or event-based automation does not start.',cause:'The trigger is paused, mis-configured, or the source event did not match.',fix:'Confirm the trigger is enabled and the filter matches; send a test event; check the schedule timezone.'},
  {t:'Job timed out',sev:'Low',symptom:'A long run stops before finishing.',cause:'Very large input or a slow external API.',fix:'Split the job into batches, reduce scope per run, or schedule it to run in parts.'},
  {t:'Field / data mapping mismatch',sev:'Medium',symptom:'Output lands in the wrong columns or skips records.',cause:'Source headers changed or do not match the mapping.',fix:'Re-confirm the column mapping and match key (email/ID); standardize headers and re-run.'},
  {t:'Duplicate records created',sev:'Medium',symptom:'The same record is added more than once.',cause:'No unique key / de-dupe rule specified.',fix:'Give MAVIS the match key (email, ID) so it updates instead of inserts; run a de-dupe pass to clean up.'},
  {t:'Results not displaying (UI)',sev:'Low',symptom:'Cards do not appear after running an analysis.',cause:'The run was interrupted or the page state is stale.',fix:'Click Live MAVIS Analysis again; reload the page if needed. Report if it persists.'},
];
function troubleSteps(is){
  return [
    {title:'Confirm & reproduce',instr:`Run the exact capability again and capture the <b>precise error message</b>, the HTTP status, and which step failed. Symptom on record: <i>${esc(is.symptom)}</i>`,actions:['Reproduce the failure once more','Copy the exact error text + failing step'],prompt:`Reproduce this issue and report the exact error message, HTTP status, and which step failed:\n"${is.symptom}"`},
    {title:'Run an integration health check',instr:`Check the connection is live and authorized before digging deeper. Most likely cause: <i>${esc(is.cause)}</i>`,actions:['Confirm the account is connected & token valid','Check granted scopes/permissions','Scan recent run logs for errors, 401/403/429, or timeouts'],prompt:HEALTH_PROMPT},
    {title:'Apply the recommended fix',instr:esc(is.fix),actions:[stripTags(is.fix),'Re-run the capability on a small sample'],prompt:`Apply this fix, then re-run on a small sample and report the result:\n${stripTags(is.fix)}`},
  ];
}
// ===== Prospecting & Lead Generation — for Lead Gen / Prospecting agents =====
let prosState={q:'',sel:null,recipes:null};
const PROS_STAGES=[
  {ic:'&#128269;',name:'Prospecting & list building',desc:'Find and build targeted, deduped prospect lists that match your ICP.',
    can:['Research companies &amp; contacts and compile them into a clean list','Pull from public directories / sites and structure the data','Segment by industry, size, role, and geography','De-dupe against your existing CRM'],
    eg:'&ldquo;Build a list of 100 SaaS marketing directors with company, size, website, and a likely email.&rdquo;',
    tools:['Apollo.io','Clay','ZoomInfo','Hunter.io','Lusha','Google Sheets'],seed:'build a targeted prospect list'},
  {ic:'&#127919;',name:'Lead generation & capture',desc:'Capture inbound leads and route them instantly into your stack.',
    can:['Intake web-form / landing-page submissions','Create CRM contacts &amp; leads the moment a form is submitted','Notify the sales channel in real time','Append every lead to a working sheet / SDR queue'],
    eg:'&ldquo;Route new website form leads into HubSpot, notify Slack, and log them to a Google Sheet.&rdquo;',
    tools:['HubSpot','Salesforce','GoHighLevel','Typeform','Meta Lead Ads','Slack'],seed:'route web form leads into CRM'},
  {ic:'&#9993;',name:'Outreach',desc:'Personalized multi-step outreach, drafted and queued for your approval.',
    can:['Draft cold email &amp; LinkedIn sequences personalized by industry/role','Merge in enrichment fields for real personalization','Queue sends through a connected inbox (you approve)','A/B variants and channel mixing'],
    eg:'&ldquo;Write a 3-step cold email sequence for agency owners offering a free automation audit, personalized by niche.&rdquo;',
    tools:['Gmail','Outlook','Instantly','Lemlist','Apollo.io','HubSpot'],seed:'cold email outreach sequence'},
  {ic:'&#9878;',name:'Qualification',desc:'Enrich and score leads against your ICP so reps work the best ones first.',
    can:['Enrich each lead with firmographics, role, and context','Score against your ICP and flag MQL / SQL','Summarize fit &amp; buying signals for the rep','Route or disqualify automatically'],
    eg:'&ldquo;Enrich inbound leads, score them against our ICP, and flag the ones worth a call today.&rdquo;',
    tools:['Apollo.io','Clay','ZoomInfo','HubSpot','Salesforce'],seed:'qualify and score inbound leads'},
  {ic:'&#128202;',name:'Reporting',desc:'Pipeline and campaign reporting built and delivered automatically.',
    can:['Weekly pipeline &amp; activity reports','Outreach performance: sent, opened, replied, booked','Source / campaign attribution roll-ups','Branded dashboards or PDFs on a schedule'],
    eg:'&ldquo;Every Monday, send a report of last week&rsquo;s outreach: emails sent, reply rate, and meetings booked, by rep.&rdquo;',
    tools:['Google Sheets','HubSpot','Salesforce','HTML/PDF Renderer'],seed:'weekly sales pipeline report'},
  {ic:'&#128260;',name:'Follow-up & nurture',desc:'Never drop a lead — automated, well-timed follow-ups and re-engagement.',
    can:['Scheduled follow-up sequences when there&rsquo;s no reply','Re-engage cold / stalled leads','Book meetings when a prospect responds','Task reminders + CRM stage updates'],
    eg:'&ldquo;If a prospect doesn&rsquo;t reply in 3 days, send a follow-up; when they respond, offer my Calendly and update the deal stage.&rdquo;',
    tools:['Gmail','Calendly','ActiveCampaign','HubSpot','Slack'],seed:'automated follow-up and reminders'},
];
function viewProspecting(){
  const apps=DATA.catalog&&DATA.catalog.apps?DATA.catalog.apps.toLocaleString():'3,399';
  const salesRecipes=(DATA.catalog&&DATA.catalog.integrations||[]).filter(i=>/lead|prospect|crm|outreach|contact|deal|sequence|nurture/i.test(i.desc)||/sales/i.test(i.cat)).length;
  const examples=['build a prospect list','enrich a lead list','cold email sequence','qualify inbound leads','LinkedIn outreach','route web form leads','weekly pipeline report','follow-up reminders'];
  const chips=examples.map(e=>`<button class="prosChip" data-seed="${esc(e)}">${esc(e)}</button>`).join('');
  const stageCards=PROS_STAGES.map((s,i)=>`<div class="prosCard"><div class="prosHead"><div class="prosIc">${s.ic}</div><div class="prosName">${s.name}</div></div>
    <div class="prosDesc">${s.desc}</div>
    <div class="prosK">What MAVIS can do</div><ul class="prosCan">${s.can.map(c=>`<li>${c}</li>`).join('')}</ul>
    <div class="prosK">Example use case</div><div class="prosEg">${s.eg}</div>
    <div class="prosK">Tools &amp; integrations</div><div class="tchips" style="margin:4px 0 0">${s.tools.map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('')}</div>
    <button class="wizghost prosSeed" data-seed="${esc(s.seed)}" style="margin-top:12px">Explore automations &rarr;</button></div>`).join('');
  return `<section class="card">
    ${sectionHero('&#9673;','Prospecting &amp; Lead Generation','For <b>Lead Generation &amp; Prospecting agents</b> &mdash; find, enrich, reach, qualify, report on, and follow up with leads. Search any tool, task, or keyword for a ready-to-build workflow.',[[apps,'Connected apps'],[salesRecipes,'Prospecting automations'],['6-stage','Funnel coverage']])}
    <div class="csaLookup"><div class="ecoSubh" style="margin-top:0">&#128269; Prospecting workflow lookup</div>
      <p class="wizsub" style="margin:0 0 8px">Search a <b>tool</b> (Apollo, HubSpot), a <b>task</b> (&ldquo;cold email sequence&rdquo;), or a <b>stage</b> (&ldquo;qualify leads&rdquo;) &mdash; MAVIS returns the workflow, tools needed, and a full implementation guide. Same engine as the CSA lookup.</p>
      <input id="prosSearch" class="ecoSearch" placeholder="e.g. Apollo, enrich a lead list, cold email sequence, qualify inbound leads, follow-up..." autocomplete="off">
      <div class="prosChips">${chips}</div>
      <div id="prosResults"></div></div>
    <div class="ecoSubh">What MAVIS can do across the prospecting funnel</div>
    <div class="prosGrid">${stageCards}</div>
    <div class="ecoSubh">How to prompt MAVIS for prospecting</div>
    <div class="tsbox"><p class="wizsub" style="margin-top:0">Type it like you&rsquo;d brief a teammate &mdash; MAVIS matches it to the closest workflow and shows the tools, steps, and a copy-ready prompt. Be specific about the <b>tool</b>, the <b>data</b>, and the <b>outcome</b>.</p>
      ${promptBox(`Build a prospecting automation: pull [ICP, e.g. "SaaS marketing directors at 50-500 person companies"] from [source/tool], enrich each with company, role, and email, and add them to [CRM/sheet].\nThen draft a personalized 3-step outreach sequence and queue it in [inbox] for my approval. Report reply rate weekly.`)}</div>
  </section>`;
}
function wireProspecting(){
  const q=$('#prosSearch'); prosState={q:'',sel:null,recipes:null};
  if(q){ q.addEventListener('input',()=>{ prosState.sel=null; prosState.recipes=null; renderProsResults(q.value); }); }
  document.querySelectorAll('#view .prosChip, #view .prosSeed').forEach(b=>b.onclick=()=>{ const s=b.dataset.seed; if(q){ q.value=s; } prosState.sel=null; prosState.recipes=null; renderProsResults(s); const r=$('#prosResults'); if(r) r.scrollIntoView({behavior:'smooth',block:'center'}); });
  renderProsResults('');
  bindCopy();
}
function renderProsResults(q){
  prosState.q=q; const box=$('#prosResults'); if(!box) return;
  const query=(q||'').trim();
  if(!query){ box.innerHTML=''; prosState.recipes=[]; prosState.sel=null; return; }
  if(!prosState.recipes) prosState.recipes=buildRecipes(query);
  const recs=prosState.recipes;
  if(prosState.sel!=null && recs[prosState.sel]){
    const r=recs[prosState.sel];
    box.innerHTML=`<div class="wizrow" style="margin:12px 0"><button class="wizghost" id="prosBack">&larr; Back to results</button><button class="runbtn hero" id="prosRun2">&#10022; Run Live Analysis</button></div>${recipeDetail(r)}`;
    $('#prosBack').onclick=()=>{ prosState.sel=null; renderProsResults(prosState.q); };
    $('#prosRun2').onclick=()=>selectAnalysis(r.wfId);
    bindCopy(); return;
  }
  if(!recs.length){ box.innerHTML=`<div class="csaResHint">No automations found for &ldquo;${esc(query)}&rdquo;. Try <b>Apollo</b>, <b>cold email</b>, <b>enrich leads</b>, or <b>pipeline report</b>.</div>`; return; }
  box.innerHTML=`<div class="csaResHint"><b>${recs.length}</b> prospecting automation${recs.length===1?'':'s'} for &ldquo;${esc(query)}&rdquo; &mdash; click one for the full implementation guide.</div>
    <div class="csaResGrid">${recs.map((r,idx)=>recipeCard(r,idx)).join('')}</div>`;
  box.querySelectorAll('.recipeOpen').forEach(b=>b.onclick=()=>{ prosState.sel=+b.dataset.i; renderProsResults(prosState.q); const r=$('#prosResults'); if(r) r.scrollIntoView({behavior:'smooth',block:'start'}); });
  box.querySelectorAll('.recipeRun').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); selectAnalysis(b.dataset.wf); });
}
// ===== VA Toolkit — everything MAVIS can take off a Virtual Assistant's plate =====
let vaState={q:'',sel:null,recipes:null};
const VA_STAGES=[
  {ic:'&#9993;',name:'Email &amp; inbox management',desc:'Triage the inbox, draft replies, and keep follow-ups moving.',
    can:['Sort, label, and prioritize incoming email','Draft replies in your voice for your approval','Chase follow-ups and unanswered threads','Summarize long threads into next actions'],
    eg:'&ldquo;Every morning, summarize new emails, draft replies to the routine ones, and flag anything urgent.&rdquo;',
    tools:['Gmail','Outlook','Slack','Claude'],seed:'draft and triage email replies'},
  {ic:'&#128197;',name:'Calendar &amp; scheduling',desc:'Book, coordinate, and protect the calendar without the back-and-forth.',
    can:['Find times and book meetings across attendees','Send invites with agenda + video links','Set reminders and buffer time','Reschedule and handle conflicts'],
    eg:'&ldquo;Find a 30-min slot next week with these 3 people, book it, and send a Zoom invite with an agenda.&rdquo;',
    tools:['Google Calendar','Calendly','Zoom','Gmail'],seed:'schedule and coordinate meetings'},
  {ic:'&#128203;',name:'Data entry &amp; documents',desc:'Kill the copy-paste &mdash; extract, structure, and update data.',
    can:['Extract fields from PDFs, invoices, and forms','Enter/clean data into sheets and databases','Reconcile and de-dupe records','Flag exceptions for review'],
    eg:'&ldquo;Pull vendor, date, and totals from these invoices into a spreadsheet and flag anything odd.&rdquo;',
    tools:['PDF Reader','Google Sheets','Airtable','Claude'],seed:'data entry from documents into a sheet'},
  {ic:'&#128269;',name:'Research &amp; reporting',desc:'Turn hours of digging into decision-ready briefs and dashboards.',
    can:['Research companies, markets, and topics with sources','Summarize documents and meetings','Build weekly/monthly reports and dashboards','Compile competitive/price comparisons'],
    eg:'&ldquo;Research our top 5 competitors&rsquo; pricing and positioning, and give me a cited one-page brief.&rdquo;',
    tools:['Web Search','Web Fetch','Google Sheets','HTML/PDF Renderer'],seed:'research and build a report'},
  {ic:'&#10022;',name:'Content &amp; social',desc:'Draft, repurpose, and schedule on-brand content and visuals.',
    can:['Draft posts, captions, blogs, and newsletters in your voice','Repurpose one source into every channel','Generate on-brand graphics','Plan and queue a content calendar'],
    eg:'&ldquo;Turn this blog post into a week of LinkedIn and Instagram posts with captions and image ideas.&rdquo;',
    tools:['Claude','Image Generation','Buffer','Canva'],seed:'social media content calendar'},
  {ic:'&#127919;',name:'CRM, outreach &amp; follow-up',desc:'Prospecting, lead gen, qualification, outreach, and nurture &mdash; handled.',
    can:['Build &amp; enrich prospect/lead lists and score fit','Draft personalized outreach sequences (you approve sends)','Update CRM records and log activity','Automate timed follow-ups and reminders'],
    eg:'&ldquo;Enrich these 50 leads, add them to HubSpot, draft a 3-step outreach sequence, and follow up if no reply in 3 days.&rdquo;',
    tools:['HubSpot','Salesforce','Apollo.io','Gmail'],seed:'enrich leads, outreach and follow up'},
  {ic:'&#128193;',name:'Files &amp; Drive organization',desc:'A tidy, consistent file system without the busywork.',
    can:['Sort, rename, and file by your convention','Organize a shared drive by client/project/month','Share with the right people &amp; permissions','Report every change it made'],
    eg:'&ldquo;Organize this shared drive by client and month, rename to our convention, and report what changed.&rdquo;',
    tools:['Google Drive','Dropbox','Google Sheets','Claude'],seed:'organize and rename Drive files'},
  {ic:'&#128172;',name:'Customer support',desc:'Fast, on-brand support drafts and ticket triage.',
    can:['Draft answers from your knowledge base / FAQs','Triage, tag, and route incoming tickets','Escalate edge cases with context','Summarize conversations and sentiment'],
    eg:'&ldquo;Draft replies to today&rsquo;s support tickets from our help docs and flag the ones needing a human.&rdquo;',
    tools:['Zendesk','Intercom','Gmail','Claude'],seed:'draft customer support replies'},
];
function viewVA(){
  const apps=DATA.catalog&&DATA.catalog.apps?DATA.catalog.apps.toLocaleString():'3,399';
  const autos=(DATA.catalog&&DATA.catalog.integrations||[]).length;
  const examples=['draft email replies','schedule meetings','data entry from PDFs','research a topic','social media posts','update the CRM','organize Google Drive','customer support replies'];
  const chips=examples.map(e=>`<button class="prosChip" data-seed="${esc(e)}">${esc(e)}</button>`).join('');
  const stageCards=VA_STAGES.map(s=>`<div class="prosCard"><div class="prosHead"><div class="prosIc">${s.ic}</div><div class="prosName">${s.name}</div></div>
    <div class="prosDesc">${s.desc}</div>
    <div class="prosK">What MAVIS can do</div><ul class="prosCan">${s.can.map(c=>`<li>${c}</li>`).join('')}</ul>
    <div class="prosK">Example use case</div><div class="prosEg">${s.eg}</div>
    <div class="prosK">Tools &amp; integrations</div><div class="tchips" style="margin:4px 0 0">${s.tools.map(t=>`<span class="ecoSkill">${esc(t)}</span>`).join('')}</div>
    <button class="wizghost prosSeed" data-seed="${esc(s.seed)}" style="margin-top:12px">Explore automations &rarr;</button></div>`).join('');
  return `<section class="card">
    ${sectionHero('&#9776;','VA Toolkit','For <b>Virtual Assistants</b> &mdash; everything MAVIS can take off your plate: inbox, calendar, data entry, research &amp; reporting, content, CRM &amp; follow-up, files, and support. Search any tool, task, or keyword for a ready-to-build workflow.',[[apps,'Connected apps'],[autos.toLocaleString(),'Automations'],['8 areas','VA workload']])}
    <div class="csaLookup"><div class="ecoSubh" style="margin-top:0">&#128269; VA task lookup</div>
      <p class="wizsub" style="margin:0 0 8px">Search a <b>tool</b> (Gmail, HubSpot), a <b>task</b> a client gave you (&ldquo;organize my drive&rdquo;), or a <b>keyword</b> (&ldquo;invoicing&rdquo;) &mdash; MAVIS returns the workflow, tools needed, and a full implementation guide. Same engine as the CSA lookup.</p>
      <input id="vaSearch" class="ecoSearch" placeholder="e.g. draft email replies, schedule meetings, data entry, research, follow-up..." autocomplete="off">
      <div class="prosChips">${chips}</div>
      <div id="vaResults"></div></div>
    <div class="ecoSubh">What MAVIS can do for a VA</div>
    <div class="prosGrid">${stageCards}</div>
    <div class="ecoSubh">How to prompt MAVIS as a VA</div>
    <div class="tsbox"><p class="wizsub" style="margin-top:0">Brief MAVIS like you&rsquo;d brief a teammate &mdash; it matches your request to the closest workflow and returns the tools, steps, and a copy-ready prompt. Be specific about the <b>tool/inbox</b>, the <b>inputs</b>, and the <b>outcome</b>, and note anything that needs your <b>approval before sending</b>.</p>
      ${promptBox(`Task: [what you want done, e.g. "clear my inbox each morning"]\nInputs: [inbox / sheet / folder / docs to use]\nOutcome: [draft replies for approval, updated sheet, booked meeting, report...]\nApproval: [what I must approve before it's sent / shared]\nSchedule: [one-off, daily, weekly...]`)}</div>
  </section>`;
}
function wireVA(){
  const q=$('#vaSearch'); vaState={q:'',sel:null,recipes:null};
  if(q){ q.addEventListener('input',()=>{ vaState.sel=null; vaState.recipes=null; renderVAResults(q.value); }); }
  document.querySelectorAll('#view .prosChip, #view .prosSeed').forEach(b=>b.onclick=()=>{ const s=b.dataset.seed; if(q){ q.value=s; } vaState.sel=null; vaState.recipes=null; renderVAResults(s); const r=$('#vaResults'); if(r) r.scrollIntoView({behavior:'smooth',block:'center'}); });
  renderVAResults('');
  bindCopy();
}
function renderVAResults(q){
  vaState.q=q; const box=$('#vaResults'); if(!box) return;
  const query=(q||'').trim();
  if(!query){ box.innerHTML=''; vaState.recipes=[]; vaState.sel=null; return; }
  if(!vaState.recipes) vaState.recipes=buildRecipes(query);
  const recs=vaState.recipes;
  if(vaState.sel!=null && recs[vaState.sel]){
    const r=recs[vaState.sel];
    box.innerHTML=`<div class="wizrow" style="margin:12px 0"><button class="wizghost" id="vaBack">&larr; Back to results</button><button class="runbtn hero" id="vaRun2">&#10022; Run Live Analysis</button></div>${recipeDetail(r)}`;
    $('#vaBack').onclick=()=>{ vaState.sel=null; renderVAResults(vaState.q); };
    $('#vaRun2').onclick=()=>selectAnalysis(r.wfId);
    bindCopy(); return;
  }
  if(!recs.length){ box.innerHTML=`<div class="csaResHint">No automations found for &ldquo;${esc(query)}&rdquo;. Try <b>email</b>, <b>scheduling</b>, <b>data entry</b>, <b>research</b>, or <b>drive</b>.</div>`; return; }
  box.innerHTML=`<div class="csaResHint"><b>${recs.length}</b> automation${recs.length===1?'':'s'} MAVIS can run for &ldquo;${esc(query)}&rdquo; &mdash; click one for the full implementation guide.</div>
    <div class="csaResGrid">${recs.map((r,idx)=>recipeCard(r,idx)).join('')}</div>`;
  box.querySelectorAll('.recipeOpen').forEach(b=>b.onclick=()=>{ vaState.sel=+b.dataset.i; renderVAResults(vaState.q); const r=$('#vaResults'); if(r) r.scrollIntoView({behavior:'smooth',block:'start'}); });
  box.querySelectorAll('.recipeRun').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); selectAnalysis(b.dataset.wf); });
}
/* ── MAVIS Simulator — guided, interactive tour of the Work Studio environment ──
   A safe, offline replica of the real MAVIS/Work Studio product. Click any section
   in the sidebar to see what it does (a plain-English explanation) and a realistic
   mock of that screen. Two screens let you actually prompt MAVIS and watch it run.
   Fully deterministic — no login, no real client data, nothing is ever sent. */
let simTimer=null;
let wsState={sec:'dashboard'};
function simMono(name){ const p=(name||'?').replace(/[^a-z0-9 ]/gi,'').trim().split(/\s+/); return ((p[0]||'?')[0]+((p[1]||'')[0]||(p[0]||'?')[1]||'')).toUpperCase(); }
function simHue(name){ let h=0; for(let i=0;i<(name||'').length;i++) h=(h*31+name.charCodeAt(i))>>>0; return h%360; }
const SIM_POPULAR=['hubspot','salesforce_rest_api','slack_bot','gmail','google_sheets','google_drive','google_calendar','quickbooks','stripe','shopify','notion','airtable'];
// clearly-labelled DEMO data — not a real client
const WS_DEMO={name:'Northwind Co. — Demo Workspace',open:12,review:11,esc:1,total:24};
const WS_TASKS=[
  {t:'Draft &amp; send the weekly KPI report',s:'In review',a:'Reporting Agent',c:14},
  {t:'Enrich 50 inbound leads and draft outreach',s:'Open',a:'Prospecting Agent',c:6},
  {t:'Reconcile Stripe payments into QuickBooks',s:'Open',a:'CSA Bot',c:2},
  {t:'Summarize support tickets &amp; draft replies',s:'In review',a:'VA Assistant',c:9},
  {t:'Organize the shared drive by client',s:'Done',a:'VA Assistant',c:1},
];
const WS_AGENTS=[
  {n:'Prospecting Agent',r:'Finds, enriches &amp; qualifies leads; drafts outreach',st:'Active'},
  {n:'Reporting Agent',r:'Builds dashboards &amp; recurring KPI reports',st:'Active'},
  {n:'CSA Bot',r:'Sets up &amp; health-checks integrations',st:'Active'},
  {n:'VA Assistant',r:'Inbox, docs, scheduling, files &amp; support',st:'Active'},
  {n:'Research Agent',r:'Market &amp; competitor research, enrichment',st:'Idle'},
];
const WS_SCHED=[
  {t:'Weekly KPI report',f:'Every Monday 8:00 AM',a:'Reporting Agent'},
  {t:'Daily new-lead pull &amp; enrichment',f:'Weekdays 7:00 AM',a:'Prospecting Agent'},
  {t:'Follow-up sequence — no reply in 3 days',f:'Triggered',a:'Prospecting Agent'},
  {t:'Month-end payment reconciliation',f:'Last day of month',a:'CSA Bot'},
];
function wsPill(s){ const m={'Open':'acc','In review':'warn','Done':'pos','Active':'pos','Idle':'muted','Escalated':'neg'}; return `<span class="wsPill ${m[s]||'muted'}">${esc(s)}</span>`; }
const WS_NAV=[
  {id:'dashboard',ic:'&#9776;',grp:'CORE',name:'Dashboard',explain:'Your command center. See every client&rsquo;s live workload &mdash; what&rsquo;s open, in review, or escalated &mdash; and ask MAVIS anything about the workspace in plain English.'},
  {id:'tasks',ic:'&#9745;',grp:'CORE',name:'Tasks',explain:'The work queue. Every request becomes a task MAVIS (or a supervised VA) executes. Describe one in plain English and MAVIS scopes it, runs it, and returns a draft for your approval.'},
  {id:'taskforce',ic:'&#128101;',grp:'CORE',name:'Taskforce',explain:'Your AI + human team. Specialized MAVIS agents (Prospecting, Reporting, CSA, VA) alongside the people who supervise them. Assign work and see who&rsquo;s on what.'},
  {id:'schedules',ic:'&#9202;',grp:'CORE',name:'Schedules',explain:'Set-and-forget automations. Anything recurring &mdash; weekly reports, daily lead pulls, follow-up sequences &mdash; runs on a schedule or a trigger without anyone lifting a finger.'},
  {id:'comms',ic:'&#128172;',grp:'CORE',name:'Comms',explain:'Client communication in one place. MAVIS drafts updates, replies and summaries; you review and send. Nothing goes out without approval.'},
  {id:'clients',ic:'&#128100;',grp:'CORE',name:'Clients',explain:'Every client workspace in one view &mdash; workload, tasks, assets and integrations per client. Switch context in a click.'},
  {id:'projects',ic:'&#128193;',grp:'CORE',name:'Projects',explain:'Group related tasks into projects with goals and timelines, so multi-step initiatives stay on track from kickoff to delivery.'},
  {id:'assets',ic:'&#128196;',grp:'CORE',name:'Assets',explain:'The deliverables library. Every report, sheet, graphic or document MAVIS produces lands here &mdash; versioned, labelled, and ready to review.'},
  {id:'sops',ic:'&#128209;',grp:'CORE',name:'SOPs',explain:'Playbooks that make work repeatable. Document a process once and MAVIS follows it exactly, every time, for consistent output.'},
  {id:'work-studio',ic:'&#11041;',grp:'STUDIOS',name:'Work Studio',explain:'Where you and MAVIS actually do the work. Type a request or pick a scenario, press Run, and watch MAVIS execute it live &mdash; a real-time workflow diagram lights up step by step while MAVIS narrates and streams the result. The closest thing to using MAVIS in production.'},
  {id:'integrations',ic:'&#128268;',grp:'STUDIOS',name:'Integrations',explain:'The tools MAVIS connects to on your behalf &mdash; CRMs, email, accounting, storage and 500+ more &mdash; so it can act across your whole stack.'},
  {id:'tool',ic:'&#128295;',grp:'STUDIOS',name:'Tool Studio',explain:'Browse and configure the app integrations available to MAVIS, and control the scopes and permissions each one has.'},
  {id:'skill',ic:'&#10024;',grp:'STUDIOS',name:'Skill Studio',explain:'Teach MAVIS new capabilities and refine how it handles your specific workflows &mdash; the more you shape it, the more it sounds and acts like your team.'},
];
function wsNavHTML(){ let html='',lastGrp=''; WS_NAV.forEach(n=>{ if(n.grp!==lastGrp){ html+=`<div class="wsGrp">${n.grp}</div>`; lastGrp=n.grp; } html+=`<button class="wsNavItem${n.id===wsState.sec?' active':''}" data-sec="${n.id}"><span class="wsNi">${n.ic}</span>${n.name}</button>`; }); return html; }
function viewSim(){
  return `<div class="simNote">
      <div class="simNoteIc">&#9654;</div>
      <div class="simNoteH">Try the MAVIS experience</div>
      <p class="simNoteP">The interactive MAVIS experience lives on our live platform. Click below to open it in a new tab and explore it hands-on.</p>
      <button class="runbtn hero" id="simOpen">&#8599;&nbsp; Open MAVIS &mdash; Explore</button>
      <div class="simNoteUrl" id="simUrl"></div>
    </div>`;
}
function wireSim(){
  if(simTimer){clearInterval(simTimer);simTimer=null;}
  const u=$('#simUrl'); if(u) u.textContent=EXPLORE_URL;
  const b=$('#simOpen'); if(b) b.onclick=()=>openExternal(EXPLORE_URL);
}
function wsRenderMain(){
  const main=$('#wsMain'); if(!main) return;
  if(simTimer){clearInterval(simTimer);simTimer=null;}
  wsTeardownRun();
  const n=WS_NAV.find(x=>x.id===wsState.sec)||WS_NAV[0];
  main.innerHTML=`<div class="wsCrumb">Work Studio <span>/</span> <b>${n.name}</b></div>
    <div class="wsExplain"><div class="wsExpIc">${n.ic}</div><div><div class="wsExpH">${n.name} &mdash; what this does</div><div class="wsExpB">${n.explain}</div></div></div>
    <div class="wsScreen" id="wsScreen">${wsSectionHTML(n.id)}</div>`;
  wsWireSection(n.id);
  main.scrollTop=0;
}
function wsCard(inner,cls){ return `<div class="wsBox ${cls||''}">${inner}</div>`; }
function wsPromptBar(id,ph,label){ return `<div class="wsPrompt"><input id="${id}" class="wbPrompt" placeholder="${esc(ph)}" autocomplete="off"><button class="runbtn" data-run="${id}">&#9654;&nbsp;${esc(label||'Run')}</button></div>`; }
function wsSectionHTML(id){
  if(id==='work-studio') return wsWorkStudioHTML();
  if(id==='dashboard'){
    const bar=`<div class="wsWl"><i style="width:${Math.round(WS_DEMO.open/WS_DEMO.total*100)}%;background:var(--acc)"></i><i style="width:${Math.round(WS_DEMO.review/WS_DEMO.total*100)}%;background:var(--warn)"></i><i style="width:${Math.round(WS_DEMO.esc/WS_DEMO.total*100)}%;background:var(--neg)"></i></div>`;
    return wsCard(`<div class="wsClientHd"><div class="wsAv2">NC</div><div><div class="wsClientN">${esc(WS_DEMO.name)}</div><div class="wsClientS">active</div></div><span class="wsPill pos" style="margin-left:auto">&#9679; Active</span></div>
      <div class="wsWlLbl">Task workload <b style="float:right">${WS_DEMO.total} total</b></div>${bar}
      <div class="wsWlKeys"><span><b style="color:var(--acc)">&#9679;</b> ${WS_DEMO.open} Open</span><span><b style="color:var(--warn)">&#9679;</b> ${WS_DEMO.review} In review</span><span><b style="color:var(--muted)">&#9679;</b> ${WS_DEMO.esc} Escalated</span></div>`)
      +`<div class="ecoSubh">&#9654; Ask MAVIS about this workspace</div><p class="wizsub" style="margin:0 0 8px">Try: &ldquo;What should I prioritize today?&rdquo; or &ldquo;Automate the weekly KPI report&rdquo;.</p>${wsPromptBar('wsAsk','Ask MAVIS anything about this workspace…','Ask')}<div id="wsAskOut"></div>`;
  }
  if(id==='tasks'){
    const rows=WS_TASKS.map(t=>`<div class="wsRow"><span class="wsDot"></span><div class="wsRowMain"><div class="wsRowT">${t.t}</div><div class="wsRowM">${wsPill(t.s)} &middot; ${t.a} &middot; &#128172; ${t.c}</div></div></div>`).join('');
    return `<div class="wsSubtabs"><b>Tasks</b><span>Schedules</span><span>Projects</span><span>Assets</span><span>Integrations</span></div>
      <div class="wsList">${rows}</div>
      <div class="ecoSubh">&#43; New task &mdash; describe it in plain English</div><p class="wizsub" style="margin:0 0 8px">MAVIS scopes the task, picks the tools, runs it, and returns a draft for approval. Watch it run below.</p>
      ${wsPromptBar('wsTask','e.g. Draft outreach emails for 25 new leads and log them in the CRM','Create &amp; run')}
      <div class="wbChat" id="wsRun" style="display:none;margin-top:12px"></div>`;
  }
  if(id==='taskforce'){
    return `<div class="wsGridCards">${WS_AGENTS.map(a=>`<div class="wsBox"><div class="wsAgHd"><span class="wbMono" style="background:hsl(${simHue(a.n)} 55% 42% / .9)">${esc(simMono(a.n))}</span><b>${a.n}</b>${wsPill(a.st)}</div><div class="wsAgR">${a.r}</div></div>`).join('')}</div>`;
  }
  if(id==='schedules'){
    return `<div class="wsList">${WS_SCHED.map(s=>`<div class="wsRow"><span class="wsNi" style="opacity:.8">&#9202;</span><div class="wsRowMain"><div class="wsRowT">${s.t}</div><div class="wsRowM">${s.f} &middot; ${s.a} &middot; ${wsPill('Active')}</div></div></div>`).join('')}</div>`;
  }
  if(id==='comms'){
    const msgs=[['MAVIS','Weekly report is drafted and ready for your review.','2m'],['You','Approved — send it to the client.','1m'],['MAVIS','Sent. Client opened it and replied &mdash; drafted a response for you.','just now']];
    return `<div class="wsChatMock">${msgs.map(m=>`<div class="wsMsg ${m[0]==='You'?'me':''}"><div class="wsMsgW"><div class="wsMsgWho">${m[0]} &middot; ${m[2]}</div>${m[1]}</div></div>`).join('')}</div>`;
  }
  if(id==='clients'){
    const cs=[['Northwind Co.',24,'Active'],['Summit Logistics',11,'Active'],['Bluewave Media',7,'Active'],['Acme Retail',3,'Idle']];
    return `<div class="wsGridCards">${cs.map(c=>`<div class="wsBox"><div class="wsClientHd"><div class="wsAv2" style="background:hsl(${simHue(c[0])} 50% 40%)">${esc(simMono(c[0]))}</div><div><div class="wsClientN">${c[0]}</div><div class="wsClientS">${c[1]} tasks</div></div>${wsPill(c[2])}</div></div>`).join('')}</div>`;
  }
  if(id==='projects'){
    const ps=[['Q3 Lead-Gen Sprint','18 tasks · 62% done',62],['Client Onboarding Revamp','9 tasks · 40% done',40],['Finance Automation','6 tasks · 85% done',85]];
    return `<div class="wsList">${ps.map(p=>`<div class="wsRow"><span class="wsNi">&#128193;</span><div class="wsRowMain"><div class="wsRowT">${p[0]}</div><div class="wsRowM">${p[1]}</div><div class="wsWl" style="margin-top:6px"><i style="width:${p[2]}%;background:linear-gradient(90deg,var(--cyan),var(--indigo))"></i></div></div></div>`).join('')}</div>`;
  }
  if(id==='assets'){
    const ds=(DATA.deliverables||[]).slice(0,6);
    if(ds.length) return `<div class="wsGridCards">${ds.map(d=>`<div class="wsBox"><div class="wsRowT">${esc(d.title||d.name||'Deliverable')}</div><div class="wsRowM" style="margin-top:5px">${esc(d.dept||d.cat||d.tier||'MAVIS output')} &middot; ${wsPill('Done')}</div></div>`).join('')}</div>`;
    return `<div class="wsList"><div class="wsRow"><div class="wsRowMain"><div class="wsRowT">Weekly KPI Report.pdf</div><div class="wsRowM">Reporting &middot; ${wsPill('Done')}</div></div></div></div>`;
  }
  if(id==='sops'){
    const so=[['New Client Onboarding','12 steps'],['Lead Enrichment &amp; Outreach','8 steps'],['Monthly Reconciliation','6 steps'],['Support Triage &amp; Reply','5 steps']];
    return `<div class="wsList">${so.map(s=>`<div class="wsRow"><span class="wsNi">&#128209;</span><div class="wsRowMain"><div class="wsRowT">${s[0]}</div><div class="wsRowM">${s[1]} &middot; MAVIS follows this exactly</div></div></div>`).join('')}</div>`;
  }
  if(id==='integrations'||id==='tool'){
    const all=(DATA.catalog&&DATA.catalog.tools)||[]; const bySlug={}; all.forEach(t=>bySlug[t.slug]=t);
    const list=SIM_POPULAR.map(s=>bySlug[s]).filter(Boolean);
    return `<div class="wsIntGrid">${list.map(t=>`<div class="wsInt"><span class="wbMono" style="background:hsl(${simHue(t.display)} 55% 42% / .9)">${esc(simMono(t.display))}</span><div><div class="wsRowT" style="font-size:12.5px">${esc(t.display)}</div><div class="wsRowM">${esc(t.cat||'')}</div></div><span class="wsPill pos" style="margin-left:auto">Connected</span></div>`).join('')}</div><div class="wsMore">&hellip; and ${((DATA.catalog&&DATA.catalog.tools||[]).length-list.length).toLocaleString()}+ more available in the full catalog.</div>`;
  }
  if(id==='skill'){
    return wsCard(`<div class="wsRowT">Custom skills taught to MAVIS</div><div class="wsRowM" style="margin-top:6px">&bull; Your brand voice &amp; email templates<br>&bull; Client-specific reporting format<br>&bull; Qualification rules for inbound leads<br>&bull; Escalation thresholds &amp; approval gates</div>`);
  }
  return '';
}
function wsWireSection(id){
  const main=$('#wsMain'); if(!main) return;
  if(id==='work-studio'){ wsWireWorkStudio(); return; }
  main.querySelectorAll('[data-run]').forEach(b=>{ b.onclick=()=>{ const inp=$('#'+b.dataset.run); if(!inp) return; const t=(inp.value||'').trim(); if(!t){ inp.focus(); return; }
    if(b.dataset.run==='wsTask') wsRunTask(t); else if(b.dataset.run==='wsAsk') wsAsk(t); }; });
  const inp1=$('#wsTask'); if(inp1) inp1.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const t=inp1.value.trim(); if(t) wsRunTask(t); } });
  const inp2=$('#wsAsk'); if(inp2) inp2.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const t=inp2.value.trim(); if(t) wsAsk(t); } });
}
// Dashboard: quick grounded answer using the shared knowledge base
function wsAsk(q){
  const out=$('#wsAskOut'); if(!out) return;
  if(simTimer){clearInterval(simTimer);simTimer=null;}
  out.innerHTML=`<div class="wbTyping"><span></span><span></span><span></span> MAVIS is thinking&hellip;</div>`;
  const recs=buildRecipes(q)||[]; const top=recs.slice(0,3);
  simTimer=setTimeout(()=>{ simTimer=null;
    if(!top.length){ out.innerHTML=`<div class="wbMsg mavis"><div class="wbAv m">&#9654;</div><div class="wbBub">I can help with that. Tell me a bit more &mdash; or head to <b>Tasks</b> to create a task and I&rsquo;ll run it.</div></div>`; return; }
    const items=top.map(r=>`<li><b>${esc(r.title)}</b>${r.desc?` &mdash; ${esc(r.desc)}`:''}</li>`).join('');
    out.innerHTML=`<div class="wbMsg mavis"><div class="wbAv m">&#9654;</div><div class="wbBub">Here&rsquo;s what I&rsquo;d prioritize for &ldquo;${esc(q)}&rdquo;:<ol class="wbPlan" style="margin-top:6px">${items}</ol>Go to <b>Tasks</b> to create any of these and watch me run it, or open <b>Live MAVIS Analysis</b> to do it for real.</div></div>`;
  },700);
}
// Tasks: full streamed agent run (reuses the recipe engine)
function wsRunTask(task){
  const chat=$('#wsRun'); if(!chat) return; chat.style.display='block';
  if(simTimer){clearInterval(simTimer);simTimer=null;}
  const recs=buildRecipes(task); const r=recs&&recs[0];
  const w=r?DATA.workflows.find(x=>x.id===r.wfId):DATA.workflows[0];
  const m=w?calcM(w):null; const isInt=r&&r.kind==='integration';
  const tools=(r&&r.tools&&r.tools.length?r.tools:(w&&w.integrations||['Claude'])).slice(0,3);
  const ev=[];
  ev.push({t:'user',html:esc(task)});
  ev.push({t:'mavis',html:`Task created. Goal: <b>${esc(r?r.title:(w?w.name:'complete the task'))}</b>. Scoping and running it now.`});
  const plan=[`Interpret the request and map it to a capability`,`Use ${tools.map(esc).join(', ')} to gather &amp; act on the data`,isInt?`Move data through ${esc((r.tools||tools).join(' &rarr; '))}`:`Run: ${esc((w&&w.autoRec)||'the workflow steps')}`,`Quality-check and file a draft for approval`];
  ev.push({t:'plan',html:`<div class="wbPlanH">Plan</div><ol class="wbPlan">${plan.map(p=>`<li>${p}</li>`).join('')}</ol>`});
  tools.forEach(tt=>{ const a=simAction(tt); ev.push({t:'tool',tool:tt,doing:a[0],result:a[1]}); });
  const outLine=isInt
    ? `Done. Processed a sample record through <b>${esc((r.tools||tools).join(' &rarr; '))}</b> &mdash; ${esc(r.desc)}. <b>1 test record succeeded, 0 errors.</b>`
    : `Done. Produced the deliverable for <b>${esc(w?w.name:'the task')}</b> and filed a draft in <b>Assets</b> for approval.`;
  const saved=m?`~${w.annualHours.toLocaleString()} hrs/yr`:'significant time';
  ev.push({t:'final',html:outLine,saved:saved,tools:tools.length,wf:w?w.id:null});
  chat.innerHTML=''; streamRun(chat,ev);
}
function simAction(name){ const t=((DATA.catalog&&DATA.catalog.tools)||[]).find(x=>x.display===name); const c=((t&&t.cat)||'').toLowerCase();
  if(/crm|sales/.test(c)) return ['querying &amp; upserting records','fetched 50 records, upserted 12, linked associations'];
  if(/email|marketing/.test(c)) return ['drafting &amp; queuing messages','composed a personalized draft, queued for approval'];
  if(/communication|telephony|chat/.test(c)) return ['posting a notification','posted a formatted summary to the channel'];
  if(/finance|account|payment/.test(c)) return ['syncing transactions','matched &amp; recorded 1 sample transaction, 0 mismatches'];
  if(/data|analytic|spreadsheet|database/.test(c)) return ['reading &amp; writing rows','pulled the dataset, wrote 24 rows, refreshed totals'];
  if(/storage|file|document/.test(c)) return ['organizing files','sorted files into client folders, applied naming rules'];
  if(/calendar|schedul/.test(c)) return ['reading availability','found open slots and drafted invites'];
  if(/project|task|productivity/.test(c)) return ['creating &amp; updating items','created a task, set owner &amp; due date'];
  if(/ai|ml/.test(c)) return ['reasoning over the input','analyzed, extracted structure, drafted the output'];
  if(/support|service|help/.test(c)) return ['triaging &amp; drafting replies','categorized items, drafted suggested responses'];
  if(/ecommerce|commerce|retail/.test(c)) return ['fetching orders','retrieved recent orders and line items'];
  return ['running the required action','completed the step successfully'];
}
// generic streamer used by the Tasks screen
function streamRun(chat,ev){
  const typing=document.createElement('div'); typing.className='wbTyping'; typing.innerHTML='<span></span><span></span><span></span> MAVIS is working&hellip;';
  let i=0; const scroll=()=>{ chat.scrollTop=chat.scrollHeight; };
  const settle=()=>{ const prev=ev[i-1]; if(prev&&prev.t==='tool'){ const node=chat.querySelector(`.wbCall[data-idx="${i-1}"]`); if(node){ node.classList.remove('running'); node.classList.add('done'); const rr=node.querySelector('.wbCallR'); if(rr){ rr.innerHTML='&#10003; '+prev.result; rr.style.display='block'; } } } };
  const step=()=>{
    settle();
    if(i>=ev.length){ clearInterval(simTimer); simTimer=null; if(typing.parentNode) typing.remove();
      const rb=chat.querySelector('#simReal'); if(rb) rb.onclick=()=>openExternal(EXPLORE_URL);
      const ag=chat.querySelector('#simAgain'); if(ag) ag.onclick=()=>{ const p=$('#wsTask'); if(p){p.value='';p.focus();} chat.style.display='none'; chat.innerHTML=''; };
      scroll(); return; }
    const e=ev[i]; const node=document.createElement('div');
    if(e.t==='user'){ node.className='wbMsg user'; node.innerHTML=`<div class="wbAv u">You</div><div class="wbBub">${e.html}</div>`; }
    else if(e.t==='mavis'||e.t==='plan'){ node.className='wbMsg mavis'; node.innerHTML=`<div class="wbAv m">&#9654;</div><div class="wbBub">${e.html}</div>`; }
    else if(e.t==='tool'){ node.className='wbCall running'; node.setAttribute('data-idx',i); node.innerHTML=`<div class="wbCallH"><span class="wbMono sm" style="background:hsl(${simHue(e.tool)} 55% 42% / .9)">${esc(simMono(e.tool))}</span><b>${esc(e.tool)}</b> &middot; ${e.doing}<span class="wbSpin"></span></div><div class="wbCallR" style="display:none"></div>`; }
    else if(e.t==='final'){ node.className='wbMsg mavis'; node.innerHTML=`<div class="wbAv m">&#9654;</div><div class="wbBub"><div class="wbDeliver"><div class="wbDelH">&#10003; Delivered</div><p>${e.html}</p><div class="wbStats"><span>&#9201; Est. time saved: <b>${e.saved}</b></span><span>&#128295; Tools used: <b>${e.tools}</b></span><span>&#9989; Errors: <b>0</b></span></div><div class="wizrow"><button class="runbtn" id="simReal">&#8599; Try it for real in MAVIS</button><button class="wizghost" id="simAgain">&#8635; New task</button></div></div></div>`; }
    chat.appendChild(node); if(i<ev.length-1) chat.appendChild(typing); scroll(); i++;
  };
  step(); simTimer=setInterval(step,720);
}
/* ── Work Studio: immersive live run console (offline, deterministic) ───────── */
// Real MAVIS platform — the simulator's "run for real" CTAs open this.
const EXPLORE_URL='https://csa-training-sooty.vercel.app/dashboard/explore';
function openExternal(url){ try{ const w=window.open(url,'_blank','noopener,noreferrer'); if(!w) location.href=url; }catch(e){ try{ location.href=url; }catch(_){} } }
let wbState={query:'',wf:null,running:false,elapsed:0,timers:[],recent:[]};
const WB_PRESETS=['Draft the Q3 client update email','Research 3 competitors and summarize','Reconcile last week’s Stripe payments','Build a lead list for Austin HVAC companies'];
const wbReduced=()=>{ try{ return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
function wsTrunc(s,n){ s=s||''; return s.length>n?s.slice(0,n-1)+'…':s; }
function wsTeardownRun(){ if(wbState&&wbState.timers){ wbState.timers.forEach(id=>clearTimeout(id)); wbState.timers=[]; } if(wbState) wbState.running=false; }
function wsWorkStudioHTML(){
  const chips=WB_PRESETS.map(p=>`<button class="wbChip" data-q="${esc(p)}">${esc(p)}</button>`).join('');
  return `<div class="wbWrap">
    <div class="wbHead">
      <div class="wbWs"><span class="wbWsDot"></span>Northwind Co. &mdash; Demo Workspace</div>
      <span class="wbStat" id="wbStatus" data-s="idle">Idle</span>
      <button class="wbReal" id="wbOpenReal">Open the real MAVIS &#8599;</button>
      <div class="wbRing" id="wbRing" style="--p:0"><span id="wbTimer">0.0s</span></div>
    </div>
    <div class="wbCompose"><input id="wbPrompt" class="wbPrompt" placeholder="Tell MAVIS what to do&hellip;  e.g. Draft the Q3 client update email" autocomplete="off"><button class="runbtn" id="wbRun">&#9654;&nbsp;Run workflow</button></div>
    <div class="wbChips" id="wbChips">${chips}</div>
    <div class="wbcv"><div class="wbStage" id="wbStage"><svg class="wbEdges" id="wbEdges"></svg><div class="wbNodes" id="wbNodes"><div class="wbEmpty">Pick a scenario or type a request, then press <b>Run</b> &mdash; MAVIS builds and executes a live workflow, narrating each step.</div></div></div></div>
    <div class="wbInspect" id="wbInspect" style="display:none"></div>
    <div class="wbLower">
      <div class="wbTx" id="wbTx"><div class="wbTxEmpty">&#9654; MAVIS will respond here, streaming its reply as it works.</div></div>
      <div class="wbSide"><div class="wbTraceH">Agent activity</div><ul class="wbTrace" id="wbTrace"></ul></div>
    </div>
    <div class="wbRecentWrap" id="wbRecentWrap" style="display:none"><div class="wbTraceH">Recent runs &middot; this session</div><div class="wbChips" id="wbRecent"></div></div>
  </div>`;
}
function wsWireWorkStudio(){
  const run=$('#wbRun'), inp=$('#wbPrompt');
  const go=()=>{ const t=(inp.value||'').trim(); if(!t){ inp.focus(); return; } wsRunWorkflow(t); };
  if(run) run.onclick=go;
  if(inp) inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
  const chips=$('#wbChips'); if(chips) chips.addEventListener('click',e=>{ const b=e.target.closest('.wbChip'); if(!b) return; inp.value=b.dataset.q; wsRunWorkflow(b.dataset.q); });
  const nodes=$('#wbNodes'); if(nodes) nodes.addEventListener('click',e=>{ const n=e.target.closest('.wbnode'); if(!n) return; wsInspect(+n.dataset.i); });
  const tx=$('#wbTx'); if(tx) tx.addEventListener('click',e=>{ const f=e.target.closest('[data-follow]'); if(f){ inp.value=f.dataset.follow; wsRunWorkflow(f.dataset.follow); return; } const rl=e.target.closest('[data-real]'); if(rl){ openExternal(EXPLORE_URL); } });
  const rec=$('#wbRecent'); if(rec) rec.addEventListener('click',e=>{ const b=e.target.closest('[data-replay]'); if(b){ inp.value=b.dataset.replay; wsRunWorkflow(b.dataset.replay); } });
  const or=$('#wbOpenReal'); if(or) or.onclick=()=>openExternal(EXPLORE_URL);
  wsRenderRecent();
}
function wsBuildWorkflow(query){
  const recs=buildRecipes(query); const r=recs&&recs[0];
  const w=r?DATA.workflows.find(x=>x.id===r.wfId):DATA.workflows[0];
  const isInt=r&&r.kind==='integration';
  const tools=(r&&r.tools&&r.tools.length?r.tools:(w&&w.integrations||['Claude'])).slice(0,4);
  const title=r?r.title:(w?w.name:'Automation');
  const nodes=[{id:'trigger',kind:'trigger',t:'Trigger',s:'Request received'},{id:'plan',kind:'think',t:'Understand & plan',s:'Map request to a capability'}];
  tools.forEach((tl,i)=>{ const a=simAction(tl); nodes.push({id:'tool'+i,kind:'tool',t:tl,s:a[0].replace(/&amp;/g,'&'),r:a[1].replace(/&amp;/g,'&')}); });
  nodes.push({id:'deliver',kind:'output',t:'Deliver',s:'File draft for approval'});
  nodes.forEach(n=>{ n.dur=520+(hashStr(query+':'+n.id)%900); });
  return {nodes,reply:wsReply(query,r,w,tools),artifact:wsArtifact(query,r,w),followups:wsFollowups(query),title,wfId:w?w.id:null};
}
function wsReply(query,r,w,tools){
  const name=r?r.title:(w?w.name:'that request'); const tl=tools.slice(0,3).join(', ');
  return `On it — I read that as "${query}" and matched it to ${name}. My plan: use ${tl} to gather what I need, run each step, quality-check the result against your guardrails, and file a draft for your approval. Watch the workflow above — I’ll narrate each step as I run it.`;
}
function wsArtifact(query,r,w){
  const q=(query||'').toLowerCase(); const name=r?r.title:(w?w.name:'Result'); const tag='<span class="wbTag">DEMO</span>';
  if(/email|outreach|update|follow|reply|message|newsletter/.test(q)) return {h:'Drafted email',b:`${tag}<div class="wbDoc"><div class="wbDocSub">Subject: Q3 progress &amp; what’s next &mdash; Northwind Co.</div><p>Hi team,</p><p>Heading into Q3: we shipped the new onboarding flow, cleared the support backlog, and lead volume is up 18% MoM. Next we’re automating the weekly report and tightening follow-up timing.</p><p>Best,<br>Your MAVIS assistant &mdash; <i>draft, pending your approval</i></p></div>`};
  if(/research|competitor|market|compare|analy/.test(q)) return {h:'Competitor snapshot',b:`${tag}<table class="wbTbl"><tr><th>Company</th><th>Positioning</th><th>Price</th></tr><tr><td>Acme Co.</td><td>Enterprise, full-service</td><td>$$$</td></tr><tr><td>Bluewave</td><td>SMB, self-serve</td><td>$</td></tr><tr><td>Summit</td><td>Mid-market, hybrid</td><td>$$</td></tr></table><div class="wbNote">Sample data for demonstration.</div>`};
  if(/reconcile|invoice|payment|stripe|quickbook|account|financ|ledger/.test(q)) return {h:'Reconciliation summary',b:`${tag}<ul class="wbUl"><li>42 transactions matched automatically</li><li>3 flagged for review (amount mismatch)</li><li>0 duplicates &middot; ledger balanced to the penny</li></ul><div class="wbNote">Sample data for demonstration.</div>`};
  if(/lead|prospect|list|enrich|outbound/.test(q)) return {h:'Lead list (sample)',b:`${tag}<table class="wbTbl"><tr><th>Company</th><th>Contact</th><th>Fit</th></tr><tr><td>Lone Star HVAC</td><td>Ops Manager</td><td>High</td></tr><tr><td>Hill Country Air</td><td>Owner</td><td>High</td></tr><tr><td>Capital Cooling</td><td>GM</td><td>Medium</td></tr></table><div class="wbNote">Sample data for demonstration.</div>`};
  if(/report|dashboard|kpi|metric/.test(q)) return {h:'Report ready',b:`${tag}<ul class="wbUl"><li>Revenue $128k &middot; +12% vs last week</li><li>New leads 214 &middot; qualified 63</li><li>Avg. response time 1h 42m &middot; &minus;18%</li></ul><div class="wbNote">Sample data for demonstration.</div>`};
  return {h:'Deliverable ready',b:`${tag}<p>${esc((w&&w.autoRec)||('Completed '+name+' and filed a draft.'))}</p><div class="wbNote">Sample output for demonstration.</div>`};
}
function wsFollowups(query){
  const pool=['Send it for approval','Schedule this weekly','Add more detail','Export to Google Sheets','Share a summary in Slack','Draft a follow-up'];
  const h=hashStr(query||'x'); const out=[]; const seen={};
  for(let k=0;out.length<3&&k<pool.length*3;k++){ const p=pool[(h+k*7)%pool.length]; if(!seen[p]){ seen[p]=1; out.push(p); } }
  return out;
}
function wsRunWorkflow(query){
  const nodesEl=$('#wbNodes'); if(!nodesEl) return;
  wsTeardownRun(); wbState.running=true; wbState.query=query; wbState.elapsed=0;
  const wf=wsBuildWorkflow(query); wbState.wf=wf;
  wsGraph(wf); wsProgress(0); wsTimer();
  const insp=$('#wbInspect'); if(insp){ insp.style.display='none'; insp.innerHTML=''; }
  const trace=$('#wbTrace'); if(trace) trace.innerHTML='';
  const tx=$('#wbTx'); if(!tx) return;
  tx.innerHTML=`<div class="wbMsg user"><div class="wbAv u">You</div><div class="wbBub">${esc(query)}</div></div>`;
  const mav=document.createElement('div'); mav.className='wbMsg mavis'; mav.innerHTML=`<div class="wbAv m">&#9654;</div><div class="wbBub"><span class="wbReply"></span></div>`; tx.appendChild(mav);
  const replyEl=mav.querySelector('.wbReply'); replyEl.innerHTML='<span class="wbDots"><i></i><i></i><i></i></span>';
  wsStatus('thinking'); tx.scrollTop=tx.scrollHeight;
  const start=()=>{ if(!wbState.running) return; replyEl.innerHTML=''; wsStreamText(replyEl, wf.reply, ()=>wsNodeLoop(wf)); };
  if(wbReduced()){ replyEl.innerHTML=''; replyEl.textContent=wf.reply; wsNodeLoop(wf); return; }
  const id=setTimeout(start,620); wbState.timers.push(id);
}
function wsGraph(wf){
  const NW=158, GAP=56, NH=88, cy=NH/2;
  const stage=$('#wbStage'), svg=$('#wbEdges'), nodesEl=$('#wbNodes'); if(!stage||!svg||!nodesEl) return;
  const total=wf.nodes.length; const W=total*(NW+GAP)-GAP+6;
  stage.style.width=W+'px'; stage.style.height=NH+'px';
  svg.setAttribute('width',W); svg.setAttribute('height',NH); svg.setAttribute('viewBox','0 0 '+W+' '+NH);
  let paths=''; for(let i=0;i<total-1;i++){ const x1=i*(NW+GAP)+NW, x2=(i+1)*(NW+GAP); paths+=`<path class="wbedge" id="wbe-${i}" d="M ${x1} ${cy} C ${x1+34} ${cy}, ${x2-34} ${cy}, ${x2} ${cy}"/>`; }
  svg.innerHTML=paths;
  nodesEl.style.width=W+'px'; nodesEl.style.height=NH+'px';
  nodesEl.innerHTML=wf.nodes.map((n,i)=>{ const x=i*(NW+GAP); const kmap={trigger:'TRIGGER',think:'REASON',tool:'TOOL',output:'OUTPUT'}; const k=kmap[n.kind]||'STEP';
    const badge=n.kind==='tool'?`<span class="wbMono sm" style="background:hsl(${simHue(n.t)} 55% 42% / .9)">${esc(simMono(n.t))}</span>`:`<span class="wbnIc">${({trigger:'&#9889;',think:'&#129504;',output:'&#10003;'}[n.kind])||'&#9679;'}</span>`;
    return `<div class="wbnode" data-i="${i}" data-status="queued" style="left:${x}px;width:${NW}px"><div class="wbnTop">${badge}<span class="wbnKind">${k}</span><span class="wbnBadge"></span></div><div class="wbnT">${esc(n.t)}</div><div class="wbnS">${esc(n.s)}</div></div>`;
  }).join('');
}
function wsFlowEdge(i){ const p=$('#wbe-'+i); if(p) p.classList.add('wbflow'); }
function wsStatus(s){ const el=$('#wbStatus'); if(!el) return; const map={idle:'Idle',thinking:'Thinking…',working:'Working…',done:'Done'}; el.dataset.s=s; el.textContent=map[s]||s; }
function wsProgress(frac){ const r=$('#wbRing'); if(r) r.style.setProperty('--p', Math.round(frac*100)); }
function wsTimer(){ const t=$('#wbTimer'); if(t) t.textContent=(wbState.elapsed/1000).toFixed(1)+'s'; }
function wsTrace(node){ const ul=$('#wbTrace'); if(!ul) return; const txt={trigger:'Received your request',think:'Understanding the goal &amp; planning steps',tool:'Using '+(node.t||'a tool')+' — '+(node.s||''),output:'Assembling the deliverable',done:'Finished — draft filed for approval'}[node.kind]||'Working'; const li=document.createElement('li'); li.className='wbtLine'; li.innerHTML=`<span class="wbtDot"></span><span>${txt}</span>`; ul.appendChild(li); ul.scrollTop=ul.scrollHeight; }
function wsInspect(i){ const wf=wbState.wf; if(!wf||!wf.nodes[i]) return; const n=wf.nodes[i]; const insp=$('#wbInspect'); if(!insp) return;
  const el=$('#wbNodes').querySelector('.wbnode[data-i="'+i+'"]'); const status=(el&&el.dataset.status)||'queued';
  insp.style.display='block';
  insp.innerHTML=`<div class="wbInspH">${esc(n.t)} <span class="wbInspK">${n.kind}</span> <b class="wbInspX" id="wbInspX">&times;</b></div><div class="wbInspRow"><b>Action</b> ${n.s}</div>${n.r?`<div class="wbInspRow"><b>Result</b> ${n.r}</div>`:''}<div class="wbInspRow"><b>Status</b> ${status} &middot; ~${(n.dur/1000).toFixed(1)}s</div>`;
  const x=$('#wbInspX'); if(x) x.onclick=()=>{ insp.style.display='none'; };
}
function wsNodeLoop(wf){ if(!wbState.running) return; const nodesEl=$('#wbNodes'); let k=0;
  const advance=()=>{ if(!wbState.running) return;
    if(k>0){ const prev=nodesEl.querySelector('.wbnode[data-i="'+(k-1)+'"]'); if(prev){ prev.dataset.status='done'; const b=prev.querySelector('.wbnBadge'); if(b) b.textContent=(wf.nodes[k-1].dur/1000).toFixed(1)+'s'; } }
    if(k>=wf.nodes.length){ wsFinish(wf); return; }
    const el=nodesEl.querySelector('.wbnode[data-i="'+k+'"]'); if(el){ el.dataset.status='running'; el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
    if(k>0) wsFlowEdge(k-1);
    wsStatus('working'); wsTrace(wf.nodes[k]); wsProgress(k/wf.nodes.length);
    const wait=wbReduced()?60:Math.min(wf.nodes[k].dur,1250);
    const id=setTimeout(()=>{ wbState.elapsed+=wf.nodes[k].dur; wsTimer(); k++; advance(); }, wait); wbState.timers.push(id);
  };
  advance();
}
function wsFinish(wf){ wbState.running=false; wsStatus('done'); wsProgress(1);
  const tx=$('#wbTx'); if(tx){ const art=wf.artifact; const fu=wf.followups.map(f=>`<button class="wbFchip" data-follow="${esc(f)}">${esc(f)} &rarr;</button>`).join('')+`<button class="wbFchip real" data-real="1">&#8599; Try it for real in MAVIS</button>`;
    tx.insertAdjacentHTML('beforeend', `<div class="wbMsg mavis"><div class="wbAv m">&#9654;</div><div class="wbBub"><div class="wbArt"><div class="wbArtH">&#10003; ${art.h}</div>${art.b}</div><div class="wbFollow">${fu}</div></div></div>`); tx.scrollTop=tx.scrollHeight; }
  wsTrace({kind:'done'}); wsRecordRecent(wbState.query);
}
function wsStreamText(el,text,done){ const parts=text.split(/(\s+)/); let i=0; const caret=document.createElement('span'); caret.className='wbcaret'; el.appendChild(caret);
  const tick=()=>{ if(!wbState.running){ if(caret.parentNode) caret.remove(); return; }
    if(i>=parts.length){ if(caret.parentNode) caret.remove(); if(done) done(); return; }
    el.insertBefore(document.createTextNode(parts[i]), caret); const w=parts[i]; i++;
    let d=24+(hashStr(text+':'+i)%38); if(/[.!?]$/.test(w)) d+=200; else if(/[,;:]$/.test(w)) d+=90;
    const id=setTimeout(tick,d); wbState.timers.push(id); };
  tick();
}
function wsRecordRecent(query){ if(!query) return; if(!wbState.recent) wbState.recent=[]; wbState.recent=wbState.recent.filter(q=>q!==query); wbState.recent.unshift(query); wbState.recent=wbState.recent.slice(0,5); wsRenderRecent(); }
function wsRenderRecent(){ const wrap=$('#wbRecentWrap'), rec=$('#wbRecent'); if(!rec) return; if(!wbState.recent||!wbState.recent.length){ if(wrap) wrap.style.display='none'; return; } if(wrap) wrap.style.display='block'; rec.innerHTML=wbState.recent.map(q=>`<button class="wbChip" data-replay="${esc(q)}">&#8635; ${esc(wsTrunc(q,38))}</button>`).join(''); }
let techWiz={mode:'trouble',tIssue:null,tStep:0,tTried:[],tDone:null,resolvedAt:null};
let intgWiz={app:null,step:0,done:null};
// ── CSA Tech access gate ──
// The passphrase is NOT stored here — only its SHA-256 hash. To change the code,
// replace this hash with the SHA-256 hex of your new passphrase.
const CSA_TECH_HASH='59deae719a6bd8b0775260fd6c805f044469fd0607508bccd4587455d7e3d8a5';
let csaTechUnlocked=false, csaTries=0;
async function sha256hex(s){
  const buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function viewCSATech(){
  const apiN=(DATA.apibanks||[]).length;
  if(!csaTechUnlocked){
    return `<section class="card">
      ${sectionHero('&#128274;','CSA Tech Manager &mdash; Restricted','This section is for the CSA / technical team. Enter the access code to open the troubleshooting portal and integration assistant.',[[TROUBLE.length,'Guided fixes'],[apiN,'API references'],['&#128274;','Protected']])}
      <div class="pwgate"><div class="pwbox">
        <div class="pwIc">&#128274;</div>
        <div class="pwH">Enter access code</div>
        <input id="csaPw" class="ecoSearch" type="password" placeholder="Access code&hellip;" autocomplete="off">
        <div class="wizrow"><button class="runbtn" id="csaPwBtn">&#128275;&nbsp;Unlock</button></div>
        <div class="pwErr" id="csaPwErr"></div>
      </div></div></section>`;
  }
  return `<section class="card">
    ${sectionHero('&#9888;','CSA Tech Manager','An interactive support portal &mdash; MAVIS guides you through troubleshooting step by step, adapts to your answers, and helps you set up new integrations.',[[TROUBLE.length,'Guided fixes'],[apiN,'API references'],['Live','Diagnostics']])}
    <div class="modeToggle">
      <button class="modeBtn" data-mode="trouble">&#129513; Troubleshooting Portal</button>
      <button class="modeBtn" data-mode="intg">&#128268; Custom Integration Assistant</button></div>
    <div id="techStage"></div></section>`;
}
function wireCSATech(){
  if(!csaTechUnlocked){
    const go=async ()=>{ const inp=$('#csaPw'), err=$('#csaPwErr'); if(!inp) return;
      if(csaTries>=5){ if(err) err.textContent='Too many attempts — reload the page to try again.'; inp.disabled=true; return; }
      let h=''; try{ h=await sha256hex(inp.value||''); }catch(e){ if(err) err.textContent='This browser blocks secure hashing (needs HTTPS).'; return; }
      if(h===CSA_TECH_HASH){ csaTries=0; csaTechUnlocked=true; render(); }
      else { csaTries++; const left=5-csaTries; if(err) err.textContent=`Incorrect code — ${left>0?left+' attempt'+(left===1?'':'s')+' left.':'locked, reload to retry.'}`; inp.value=''; inp.focus(); } };
    const b=$('#csaPwBtn'); if(b) b.onclick=go;
    const inp=$('#csaPw'); if(inp){ inp.focus(); inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); }); }
    return;
  }
  renderTech();
}
function renderTech(){
  const stage=$('#techStage'); if(!stage) return;
  document.querySelectorAll('.modeBtn').forEach(b=>{ b.classList.toggle('on',b.dataset.mode===techWiz.mode); b.onclick=()=>{ techWiz.mode=b.dataset.mode; renderTech(); }; });
  if(techWiz.mode==='trouble') renderTrouble(stage); else renderIntg(stage);
  bindCopy();
}
function techBack(html){ return html; }
function renderTrouble(stage){
  const sev=(s)=>`<span class="sev sev-${s.toLowerCase()}">${s}</span>`;
  if(techWiz.tIssue==null){
    const cards=TROUBLE.map((is,i)=>`<button class="issueCard" data-i="${i}" data-hay="${esc((is.t+' '+is.symptom+' '+is.cause).toLowerCase())}"><div class="issueTop"><span class="issueT">${esc(is.t)}</span>${sev(is.sev)}</div><div class="issueS">${esc(is.symptom)}</div></button>`).join('');
    stage.innerHTML=`<div class="wizpanel"><div class="wizh">What are you seeing?</div><p class="wizsub">Search or pick an issue &mdash; MAVIS will walk you through a guided diagnosis, one step at a time.</p>
      <input id="issueQ" class="ecoSearch" placeholder="Describe or search the issue - "401", "webhook", "permission denied"..." autocomplete="off">
      <div class="issueList" id="issueList">${cards}</div></div>`;
    const q=$('#issueQ'); q.addEventListener('input',()=>{ const t=q.value.trim().toLowerCase(); stage.querySelectorAll('.issueCard').forEach(c=>{ c.style.display=(!t||c.dataset.hay.includes(t))?'':'none'; }); });
    stage.querySelectorAll('.issueCard').forEach(c=>c.onclick=()=>{ techWiz.tIssue=+c.dataset.i; techWiz.tStep=0; techWiz.tTried=[]; techWiz.tDone=null; techWiz.resolvedAt=null; renderTech(); });
    return;
  }
  const is=TROUBLE[techWiz.tIssue], steps=troubleSteps(is);
  const restart=`<button class="wizghost" id="tReset">&larr; All issues</button>`;
  if(techWiz.tDone==='resolved'){
    stage.innerHTML=`<div class="wizpanel resolved"><div class="resBadge ok">&#10003; Resolved</div><div class="wizh">${esc(is.t)}</div>
      <p class="wizsub">Fixed at <b>Step ${techWiz.resolvedAt+1}: ${steps[techWiz.resolvedAt].title}</b>.</p>
      <div class="resSummary"><div class="resH">Resolution summary</div><ul><li><b>Issue:</b> ${esc(is.symptom)}</li><li><b>What worked:</b> ${esc(stripTags(steps[techWiz.resolvedAt].instr))}</li><li><b>Steps run:</b> ${techWiz.resolvedAt+1} of ${steps.length}</li></ul><div class="csa-tip">Tip: save this as a known-good fix for next time.</div></div>
      <div class="wizrow">${restart}</div></div>`;
    $('#tReset').onclick=()=>{ techWiz.tIssue=null; renderTech(); };
    return;
  }
  if(techWiz.tDone==='escalated'){
    const escPrompt=`Escalation - ${is.t}\nSymptom: ${is.symptom}\nLikely cause: ${is.cause}\nSteps already tried:\n${techWiz.tTried.map((s,i)=>`  ${i+1}. ${steps[s].title}`).join('\n')}\nStill unresolved. Recommended fix that did not resolve it: ${stripTags(is.fix)}\nPlease advise on next steps / provider-side config.`;
    stage.innerHTML=`<div class="wizpanel escalated"><div class="resBadge esc">&#128680; Escalate to devs</div><div class="wizh">${esc(is.t)}</div>
      <p class="wizsub">All guided steps were tried without resolving it. Here is the escalation summary &mdash; copy it into your dev channel.</p>
      <div class="resSummary"><div class="resH">Findings</div><ul>${steps.map((s,i)=>`<li>${techWiz.tTried.includes(i)?'&#10003;':'&bull;'} Step ${i+1}: ${s.title} &mdash; tried, not resolved</li>`).join('')}<li><b>Severity:</b> ${is.sev}</li></ul>
      <div class="resH" style="margin-top:10px">Recommended next actions</div><ul><li>Send the summary below to the dev team (include run ID + timestamp + screenshot).</li><li>Flag if it touches billing, security, credentials, or writes to production.</li><li>If provider-side (5xx / outage / missing app-scope), note that a config or new connector may be required.</li></ul></div>
      ${promptBox(escPrompt)}
      <div class="wizrow">${restart}</div></div>`;
    $('#tReset').onclick=()=>{ techWiz.tIssue=null; renderTech(); };
    return;
  }
  const st=steps[techWiz.tStep];
  stage.innerHTML=`<div class="wizpanel"><div class="issueTop2"><div class="wizh" style="margin:0">${esc(is.t)}</div>${sev(is.sev)}</div>
    <div class="stepbar">${steps.map((s,i)=>`<span class="stepdot ${i===techWiz.tStep?'on':''} ${i<techWiz.tStep?'done':''}">${i+1}</span>`).join('<span class="stepline"></span>')}</div>
    <div class="stepcard"><div class="stepk">Step ${techWiz.tStep+1} of ${steps.length} &middot; ${esc(st.title)}</div>
      <div class="stepinstr">${st.instr}</div>
      <div class="csa-h ok">Recommended actions</div><ul class="stepacts">${st.actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>
      ${promptBox(st.prompt)}</div>
    <div class="resolveQ"><span>Was the issue resolved?</span><button class="yesbtn" id="tYes">&#10003; Yes, resolved</button><button class="nobtn" id="tNo">&#10007; No, still failing</button></div>
    <div class="wizrow">${restart}</div></div>`;
  $('#tReset').onclick=()=>{ techWiz.tIssue=null; renderTech(); };
  $('#tYes').onclick=()=>{ techWiz.resolvedAt=techWiz.tStep; techWiz.tDone='resolved'; renderTech(); };
  $('#tNo').onclick=()=>{ if(!techWiz.tTried.includes(techWiz.tStep)) techWiz.tTried.push(techWiz.tStep); if(techWiz.tStep>=steps.length-1){ techWiz.tDone='escalated'; } else { techWiz.tStep++; } renderTech(); };
}
function intgSetupData(a){
  const cat=(a.cat||'').toLowerCase();
  const webhook=/crm|sales|marketing|help|support|commerce|payment|project|communication/.test(cat)?`Yes &mdash; subscribe to record/event webhooks (e.g. created / updated / paid) for real-time triggers.`:`Check the docs &mdash; if no webhooks, MAVIS can poll on a schedule instead.`;
  return {
    auth:`OAuth 2.0 or API key (see the API docs). Store credentials via the connected account / Pipedream &mdash; never in plaintext. Grant only the scopes the task needs.`,
    webhooks:webhook,
    sdk:`REST API available; official SDKs commonly provided for JS &amp; Python. MAVIS can call the REST endpoints directly if no SDK.`,
    setup:`Admin access to create an app / generate a key; the required scopes for your use case; and a test or sandbox account to validate against.`
  };
}
function renderIntg(stage){
  const banks=DATA.apibanks||[];
  if(!intgWiz.app){
    const cards=banks.map((a,i)=>`<button class="issueCard" data-i="${i}" data-hay="${esc((a.app+' '+a.cat+' '+a.group).toLowerCase())}"><div class="issueTop"><span class="issueT">${esc(a.app)}</span></div><div class="issueS">${esc(a.cat)} &middot; ${esc(a.group)}</div></button>`).join('');
    stage.innerHTML=`<div class="wizpanel"><div class="wizh">Which platform are you integrating?</div><p class="wizsub">Search any application &mdash; MAVIS surfaces its API docs, auth, webhooks, and SDKs, then guides you through setup, testing &amp; validation.</p>
      <input id="intgQ" class="ecoSearch" placeholder="Search a platform - Salesforce, Stripe, Notion, Shopify..." autocomplete="off">
      <div class="ccount" id="intgCount">${banks.length} platforms</div>
      <div class="issueList intgList" id="intgList">${cards}</div></div>`;
    const q=$('#intgQ'),cnt=$('#intgCount');
    q.addEventListener('input',()=>{ const t=q.value.trim().toLowerCase(); let n=0; stage.querySelectorAll('.issueCard').forEach(c=>{ const show=(!t||c.dataset.hay.includes(t)); c.style.display=show?'':'none'; if(show)n++; }); cnt.textContent=`${n} platforms`; });
    stage.querySelectorAll('.issueCard').forEach(c=>c.onclick=()=>{ intgWiz.app=banks[+c.dataset.i]; intgWiz.step=0; intgWiz.done=null; renderTech(); });
    return;
  }
  const a=intgWiz.app, d=intgSetupData(a);
  const lnk=(href,label,cls)=>href?`<a class="apiLink ${cls||''}" href="${esc(href)}" data-url="${esc(href)}" target="_blank" rel="noopener noreferrer">${label} &#8599;</a>`:'';
  const ref=`<div class="intgRef"><div class="intgRefHead"><div class="ecoLogo" style="background:${ecoColor(a.app)}">${esc(ecoInitials(a.app))}</div><div><div class="ecoName">${esc(a.app)}</div><div class="ecoCat">${esc(a.cat)} &middot; ${esc(a.group)}</div></div></div>
    <div class="apiLinks">${lnk(a.api,'API Docs','primary')}${lnk(a.help,'Help Center')}${lnk(a.alt,'Alt docs')}</div>
    <div class="intgReq"><div class="trow"><div class="tk">Auth</div><div class="tv">${d.auth}</div></div><div class="trow"><div class="tk">Webhooks</div><div class="tv">${d.webhooks}</div></div><div class="trow"><div class="tk">SDKs</div><div class="tv">${d.sdk}</div></div><div class="trow"><div class="tk">Setup needs</div><div class="tv">${d.setup}</div></div></div></div>`;
  const back=`<button class="wizghost" id="iReset">&larr; All platforms</button>`;
  if(intgWiz.done==='ok'){
    let combos=toolIntegrations(a.app).slice(0,4);
    const autos=combos.length?combos.map(c=>`<li>${esc(c.tools.join(' + '))} &rarr; ${esc(c.desc)}</li>`).join(''):`<li>Sync ${esc(a.app)} records into a sheet or CRM.</li><li>Trigger notifications on new/updated records.</li><li>Log activity and build scheduled reports.</li>`;
    stage.innerHTML=`<div class="wizpanel"><div class="resBadge ok">&#10003; Integration live</div><div class="wizh">${esc(a.app)} connected</div>
      <p class="wizsub">Nice &mdash; here is your deployment checklist and the automations MAVIS can now run with ${esc(a.app)}.</p>
      <div class="csa-two"><div><div class="csa-h ok">Deployment checklist</div><ul><li>Credentials stored via the connected account (not plaintext).</li><li>Only required scopes granted.</li><li>Webhook/trigger enabled &amp; test event received.</li><li>Sample run validated end to end.</li><li>Error alerts + run logging on.</li></ul></div>
      <div><div class="csa-h ok">Recommended automations</div><ul>${autos}</ul></div></div>
      <div class="wizrow">${back}</div></div>`;
    $('#iReset').onclick=()=>{ intgWiz.app=null; renderTech(); };
    return;
  }
  if(intgWiz.done==='fail'){
    const diag=`Integration diagnostic - ${a.app}\nCategory: ${a.cat} / ${a.group}\nAPI docs: ${a.api||a.help||'n/a'}\nStage reached: ${['Connect','Test','Validate'][intgWiz.step]||'Validate'}\nSymptom: <describe what failed + exact error/HTTP code>\nAuth used: <OAuth / API key>\nTried: connect, test call, sample validation.\nPlease advise on scopes, app config, or connector work needed.`;
    stage.innerHTML=`<div class="wizpanel escalated"><div class="resBadge esc">&#9888; Not connected yet</div><div class="wizh">${esc(a.app)} - troubleshoot</div>
      <p class="wizsub">Let&rsquo;s narrow it down, then escalate with a diagnostic report if needed.</p>
      <div class="resSummary"><div class="resH">Try these first</div><ul><li>Re-check auth: correct account, valid key/token, required scopes granted.</li><li>Confirm the base URL/region and API version match the docs.</li><li>Make one minimal read call; note the exact HTTP status &amp; body.</li><li>If 5xx or a missing app-scope, it&rsquo;s likely provider-side &mdash; escalate.</li></ul></div>
      ${promptBox(diag)}
      <div class="resolveQ"><span>Resolved after retrying?</span><button class="yesbtn" id="iOk2">&#10003; Yes, it connected</button><button class="wizghost" id="iReset">&larr; All platforms</button></div></div>`;
    $('#iOk2').onclick=()=>{ intgWiz.done='ok'; renderTech(); };
    $('#iReset').onclick=()=>{ intgWiz.app=null; renderTech(); };
    return;
  }
  const stages=[
    {title:'Connect & authenticate',instr:`Authorize ${esc(a.app)} and store the credentials via the connected account. Grant only the scopes your task needs.`,prompt:`Connect ${a.app} for me: guide the OAuth/API-key setup, list the exact scopes I need for <my use case>, and confirm the connection is live.`},
    {title:'Test the connection',instr:`Make a minimal read call to confirm auth works before building anything.`,prompt:HEALTH_PROMPT.replace('<App name>',a.app)},
    {title:'Validate end to end',instr:`Run one real sample through the intended workflow and check the output + any webhook/trigger fires.`,prompt:`Run a single end-to-end test with ${a.app}: perform the real action on one sample record, confirm the result, and verify the trigger/webhook fired. Report pass/fail with details.`},
  ];
  const s=stages[intgWiz.step];
  const last=intgWiz.step>=stages.length-1;
  stage.innerHTML=`<div class="wizpanel">${ref}
    <div class="stepbar" style="margin-top:16px">${stages.map((x,i)=>`<span class="stepdot ${i===intgWiz.step?'on':''} ${i<intgWiz.step?'done':''}">${i+1}</span>`).join('<span class="stepline"></span>')}</div>
    <div class="stepcard"><div class="stepk">Step ${intgWiz.step+1} of ${stages.length} &middot; ${esc(s.title)}</div><div class="stepinstr">${s.instr}</div>${promptBox(s.prompt)}</div>
    ${last?`<div class="resolveQ"><span>Was the integration successful?</span><button class="yesbtn" id="iYes">&#10003; Yes, it works</button><button class="nobtn" id="iNo">&#10007; No, it failed</button></div>`:`<div class="wizrow"><button class="runbtn hero" id="iNext">Next step &rarr;</button></div>`}
    <div class="wizrow">${back}</div></div>`;
  $('#iReset').onclick=()=>{ intgWiz.app=null; renderTech(); };
  if(last){ $('#iYes').onclick=()=>{ intgWiz.done='ok'; renderTech(); }; $('#iNo').onclick=()=>{ intgWiz.done='fail'; renderTech(); }; }
  else { $('#iNext').onclick=()=>{ intgWiz.step++; renderTech(); }; }
}
// ---------- API Banks (documentation directory) ----------
function viewApiBanks(){
  const banks=DATA.apibanks||[];
  if(!banks.length) return `<section class="card"><h2 class="sec">API Banks</h2><p class="lead">API documentation bank unavailable.</p></section>`;
  const groups=[...new Set(banks.map(b=>b.group))];
  const cats=[...new Set(banks.map(b=>b.cat))];
  const chips=['All',...groups].map((name,i)=>{ const cnt=name==='All'?banks.length:banks.filter(b=>b.group===name).length; const label=name==='All'?'All':esc(name); return `<button class="catchip${i===0?' active':''}" data-group="${esc(name)}" title="${esc(name)}">${label} <span>${cnt}</span></button>`; }).join('');
  const lnk=(href,label,cls)=>href?`<a class="apiLink ${cls||''}" href="${esc(href)}" data-url="${esc(href)}" target="_blank" rel="noopener noreferrer">${label} &#8599;</a>`:'';
  const cards=banks.map(b=>{
    const hay=(b.app+' '+b.cat+' '+b.group+' '+b.notes).toLowerCase();
    const tag=b.notes?`<span class="apiTag">${esc(b.notes)}</span>`:'';
    return `<div class="apiCard" data-group="${esc(b.group)}" data-hay="${esc(hay)}">
      <div class="apiHead"><div class="ecoLogo" style="background:${ecoColor(b.app)}">${esc(ecoInitials(b.app))}</div>
        <div class="ecoId"><div class="ecoName">${esc(b.app)}</div><div class="ecoCat">${esc(b.cat)}</div></div>${tag}</div>
      <div class="apiLinks">${lnk(b.api,'API Docs','primary')}${lnk(b.help,'Help Center')}${lnk(b.alt,'Alt docs')}</div></div>`;
  }).join('');
  return `<section class="card">
    ${sectionHero('&#9731;','API Banks','Verified API &amp; help-center documentation for the platforms MAVIS integrates with &mdash; the CSA Tech reference for building and debugging integrations. Click any link to open the docs in a new tab.',[[banks.length,'Documented APIs'],[groups.length,'Groups'],[cats.length,'Categories']])}
    <div class="apiSearchRow"><input id="apiQ" class="ecoSearch" placeholder="Search a platform &mdash; Salesforce, Stripe, Docker, Notion, Klaviyo..." autocomplete="off"></div>
    <div class="catchips">${chips}</div><div class="ccount" id="apiCount"></div>
    <div class="ecoGrid apiGrid" id="apiGrid">${cards}</div>
    <div class="pager" id="apipager"></div></section>`;
}
function wireApiBanks(){
  const grid=$('#apiGrid'); if(!grid) return; let group='All';
  const cards=[...grid.querySelectorAll('.apiCard')], q=$('#apiQ'), cnt=$('#apiCount');
  const PAGE=10; let page=1;
  const apply=(reset)=>{ if(reset) page=1;
    const term=(q&&q.value||'').trim().toLowerCase();
    const matched=cards.filter(cd=>(group==='All'||cd.dataset.group===group)&&(!term||cd.dataset.hay.includes(term)));
    const total=matched.length, pages=Math.max(1,Math.ceil(total/PAGE)); if(page>pages) page=pages;
    cards.forEach(cd=>cd.style.display='none');
    matched.slice((page-1)*PAGE,page*PAGE).forEach(cd=>cd.style.display='');
    const startN=total?((page-1)*PAGE+1):0, endN=Math.min(page*PAGE,total);
    if(cnt) cnt.textContent=total?`Showing ${startN}–${endN} of ${total.toLocaleString()} API${total===1?'':'s'}`:`No APIs match — try another platform or category.`;
    const pg=$('#apipager'); if(pg){ pg.innerHTML=pagerHTML(page,pages); pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ page=+b.dataset.pg; apply(); grid.scrollIntoView({behavior:'smooth',block:'start'}); }); }
  };
  if(q) q.addEventListener('input',()=>apply(true));
  document.querySelectorAll('.catchip').forEach(b=>b.onclick=()=>{ group=b.dataset.group; document.querySelectorAll('.catchip').forEach(x=>x.classList.toggle('active',x===b)); apply(true); });
  // open doc links in a new tab reliably (works inside sandboxed embeds)
  grid.querySelectorAll('.apiLink').forEach(a=>a.addEventListener('click',(e)=>{ const url=a.getAttribute('data-url')||a.href; if(url){ e.preventDefault(); const w=window.open(url,'_blank','noopener,noreferrer'); if(!w){ try{ window.top.location.href=url; }catch(_){ location.href=url; } } } }));
  apply(true);
}

function viewDeliverables(){
  const groups=[['signature','Signature Deliverables','Generated live, end to end, in minutes'],['measured','Measured Impact','Quantified time savings versus manual work'],['blueprint','Solution Blueprints','Business problem mapped to an automated solution']];
  const secs=groups.map(([tier,title,sub])=>{
    const items=(DATA.deliverables||[]).filter(d=>d.tier===tier);
    if(!items.length) return '';
    const cards=items.map(d=>{
      const save=d.savings?`<div class="savebadge">${esc(d.manual||'')} <span class="arw">to</span> ${esc(d.ai||'')} <span>&middot; ${esc(d.savings)} saved</span></div>`:'';
      const tech=(d.tech||[]).slice(0,4).map(t=>`<span class="tk">${esc(t)}</span>`).join('');
      return `<div class="dcard" data-name="${esc(d.name)}"><span class="dtier tier-${tier}">${tier}</span><div class="dt">${esc(d.name)}</div><div class="dv">${esc(d.value||d.problem||'')}</div><div class="tstack">${tech}</div>${save}
        <button class="dcardrun" data-run="${esc(d.name)}">&#10022;&nbsp; Run MAVIS Analysis</button></div>`;
    }).join('');
    return `<div class="dsub">${title} <span style="color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0;font-size:11.5px">${sub}</span></div><div class="dgrid">${cards}</div>`;
  }).join('');
  return `<section class="card"><h2 class="sec">What MAVIS Can Do</h2>
    <p class="lead">The full range of what MAVIS can do &mdash; ${(DATA.deliverables||[]).length} client-ready capabilities across reporting, data &amp; spreadsheets, research, documents, email &amp; CRM, scheduling, content &amp; design, web automation, support, onboarding, and dev &mdash; all powered by ${(DATA.catalog&&DATA.catalog.apps?DATA.catalog.apps.toLocaleString():'3,399')} connected apps. Click a deliverable for its flow, or hit <b>Run MAVIS Analysis</b> on any card for the full live dashboard.</p>${secs}</section>`;
}
function wireDeliverables(){
  document.querySelectorAll('#view .dcard').forEach(c=>c.onclick=()=>openDeliverable(c.dataset.name));
  document.querySelectorAll('#view .dcardrun').forEach(b=>b.onclick=(ev)=>{ ev.stopPropagation(); runDeliverable(b.dataset.run); });
}
// select the workflow behind a deliverable and open the dashboard ready to run
function runDeliverable(name){
  const d=(DATA.deliverables||[]).find(x=>x.name===name); if(!d) return;
  selectAnalysis(d.wf||DATA.workflows[0].id);
}
function openDeliverable(name){
  const d=(DATA.deliverables||[]).find(x=>x.name===name); if(!d) return;
  const save=d.savings?`<div class="miniK"><div class="b"><div class="n">${esc(d.manual||'')}</div><div class="l">Manual time</div></div><div class="b"><div class="n">${esc(d.ai||'')}</div><div class="l">MAVIS time</div></div><div class="b"><div class="n">${esc(d.savings)}</div><div class="l">Time saved</div></div></div>`:'';
  const flow=(d.flow&&d.flow.length)?`<div class="field"><div class="k">How MAVIS delivers it</div><div class="v">${d.flow.map((s,i)=>`<div class="flowstep"><div class="fn">${i+1}</div><div class="ft">${esc(s)}</div></div>`).join('')}</div></div>`:'';
  const prompt=d.prompt?`<div class="field"><div class="k">Sales-rep prompt</div><div class="promptbox"><span class="qlabel">Say to MAVIS</span>${esc(d.prompt)}</div></div>`:'';
  const problem=d.problem?`<div class="field"><div class="k">Business problem</div><div class="v">${esc(d.problem)}</div></div>`:'';
  const note=d.note?`<div class="field"><div class="v" style="color:var(--muted);font-style:italic">${esc(d.note)}</div></div>`:'';
  const sample=d.sample?`<div class="field"><div class="k">Sample work</div><div class="v" style="background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.22);border-radius:10px;padding:11px 13px">${esc(d.sample)}</div></div>`:'';
  const link=d.link?`<div class="field"><div class="k">Link</div><div class="v" style="color:#94a3b8">${esc(d.link)}</div></div>`:'';
  const tech=(d.tech||[]).map(t=>`<span class="tk">${esc(t)}</span>`).join('');
  openDrawer(`<div class="dhead"><span class="dclose" data-close>&times;</span><h3>${esc(d.name)}</h3><div class="meta"><span class="dtier tier-${d.tier}">${esc(d.tier)}</span></div></div>
  <div class="dbody">${save}${problem}
    <div class="field"><div class="k">Value to client</div><div class="v">${esc(d.value||'')}</div></div>
    ${sample}${flow}${prompt}${link}
    <div class="field"><div class="k">Tools used</div><div class="v tstack">${tech}</div></div>${note}
  </div>`);
}

// ---------- drawers ----------
function openDrawer(html){ const d=$('#drawer'); d.innerHTML=html; d.classList.add('open'); $('#drawerBg').classList.add('open'); d.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeDrawer); }
function closeDrawer(){ $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); }
$('#drawerBg') && ( $('#drawerBg').onclick=closeDrawer );

function openWorkflow(id){
  const w=DATA.workflows.find(x=>x.id===id); if(!w) return;
  openDrawer(`<div class="dhead"><span class="dclose" data-close>&times;</span><h3>${esc(w.name)}</h3><div class="meta">${w.id} · ${esc(w.dept)} · ${esc(w.frequency)}</div></div>
  <div class="dbody">
    <div class="miniK">
      <div class="b"><div class="n">${w.manualEffort}</div><div class="l">Manual effort</div></div>
      <div class="b"><div class="n">${w.readiness}</div><div class="l">Auto readiness</div></div>
      <div class="b"><div class="n">${w.confidence}%</div><div class="l">MAVIS confidence</div></div>
    </div>
    <div class="field"><div class="k">Current process</div><div class="v">${esc(w.currentProcess)}</div></div>
    <div class="field"><div class="k">Repetitive tasks detected</div><div class="v">${w.repetitive.map(r=>`<span class="chip type">${esc(r)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Recommended automation</div><div class="v"><span class="chip">${esc(w.autoType)}</span><p style="margin-top:6px">${esc(w.autoRec)}</p></div></div>
    <div class="field"><div class="k">Required AI agents</div><div class="v">${w.aiAgents.map(a=>`<span class="chip ai">${esc(a)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Current tools → recommended</div><div class="v">${esc(w.currentTools)} <b>→</b> ${esc(w.recommendedTools)}</div></div>
    <div class="miniK">
      <div class="b"><div class="n">${w.monthlyHours}</div><div class="l">Hrs saved/mo</div></div>
      <div class="b"><div class="n">${money(w.monthlyCost)}</div><div class="l">$ saved/mo</div></div>
      <div class="b"><div class="n">${w.perExec}m</div><div class="l">Per execution</div></div>
      <div class="b"><div class="n">${money(w.annualCost)}</div><div class="l">$ saved/yr</div></div>
      <div class="b"><div class="n">${w.roi}%</div><div class="l">Year-1 ROI</div></div>
      <div class="b"><div class="n">${w.payback}mo</div><div class="l">Payback</div></div>
    </div>
    <div class="field"><div class="k">Implementation</div><div class="v"><span class="chip">${esc(w.implTime)}</span><span class="chip">${money(w.implCost)} build</span><span class="pill p-${w.priority}">${w.priority}</span> <span class="chip">${esc(w.phase)}</span></div></div>
    <div class="field"><div class="k">Dependencies</div><div class="v">${esc(w.dependencies||'None')}</div></div>
    <div class="field"><div class="k">Search keywords</div><div class="v">${(w.keywords||[]).map(k=>`<span class="chip type">${esc(k)}</span>`).join('')}</div></div>
  </div>`);
}

function openTool(name){
  const t=DATA.tools.find(x=>x.name===name); if(!t) return;
  const rel=t.related.map(r=>`<span class="chip" data-wf="${r.id}" style="cursor:pointer">${esc(r.name)}</span>`).join('')||'<span class="v">None</span>';
  openDrawer(`<div class="dhead"><span class="dclose" data-close>&times;</span><h3>${esc(t.name)}</h3><div class="meta">${esc(t.cat)}</div></div>
  <div class="dbody">
    <div class="field"><div class="k">API availability</div><div class="v">${esc(t.api)}</div></div>
    <div class="field"><div class="k">Supported integrations</div><div class="v">${esc(t.integ)}</div></div>
    <div class="field"><div class="k">AI capabilities</div><div class="v">${esc(t.ai)}</div></div>
    <div class="field"><div class="k">Common automation use cases</div><div class="v">${t.useCases.map(u=>`<div style="margin:3px 0">• ${esc(u)}</div>`).join('')}</div></div>
    <div class="field"><div class="k">Related workflows (${t.related.length})</div><div class="v">${rel}</div></div>
    <div class="field"><div class="k">Documentation</div><div class="v"><a href="${esc(t.docs)}" target="_blank" style="color:var(--accent)">${esc(t.docs)}</a></div></div>
  </div>`);
  $('#drawer').querySelectorAll('[data-wf]').forEach(c=>c.onclick=()=>openWorkflow(c.dataset.wf));
}

// ---------- live analysis (per task) ----------
function currentWF(){ return DATA.workflows.find(w=>w.id===state.activeId) || DATA.workflows[0]; }
function liveSteps(w){
  return [
    {t:'Analyze the workflow', card:'c-workflow', conf:96, ins:`Parsed <b>${esc(w.name)}</b> in <b>${esc(w.dept)}</b>. Frequency <b>${esc(w.frequency)}</b>, manual-effort score <b>${w.manualEffort}/100</b>.`},
    {t:'Detect repetitive tasks and recommend automation', card:'c-opp', conf:92, ins:`Detected <b>${w.repetitive.length}</b> repetitive patterns. Best-fit strategy: <b>${esc(w.autoType)}</b> using <b>${w.aiAgents.length}</b> AI agent(s).`},
    {t:'Estimate business impact', card:'c-impact', conf:94, ins:`Projected <b>${w.annualHours.toLocaleString()} hrs/yr</b> and <b>${money(w.annualCost)}/yr</b> saved. ROI <b>${w.roi}%</b>, payback <b>${w.payback} mo</b>.`},
    {t:'Generate implementation roadmap', card:'c-roadmap', conf:90, ins:`Slotted into <b>${esc(w.phase)}</b> at <b>${esc(w.priority)}</b> priority. Build time ${esc(w.implTime)}, cost ${money(w.implCost)}.`},
    {t:'Map required tools and connections', card:'c-tools', conf:93, ins:`Mapped <b>${w.integrations.length}</b> tools into an orchestrated MAVIS pipeline with ${w.aiAgents.length} agent(s).`},
  ];
}
function viewLive(){
  const w=currentWF();
  const done=(shownId===w.id);
  // single entry point: use the global search + "Live MAVIS Analysis" button above. No secondary input/section.
  const hint=done?'':`<div class="livehint">Search a workflow, task, or tool above, then click <b>&#10022; Live MAVIS Analysis</b> to run the live analysis.</div>`;
  return `${hint}<div id="cards" class="resultswrap"${done?'':' style="display:none"'}>${resultsHTML(w)}</div>`;
}
function cardWorkflow(w){
  return `<section class="card"><h2 class="sec">Workflow Analysis</h2>
    <div class="field"><div class="k">Current process</div><div class="v">${esc(w.currentProcess)}</div></div>
    <div class="field"><div class="k">Department &middot; frequency</div><div class="v">${esc(w.dept)} &middot; ${esc(w.frequency)}</div></div>
    <div class="field"><div class="k">Current tools</div><div class="v">${esc(w.currentTools)}</div></div>
    <div class="field"><div class="k">Manual effort</div><div class="v"><span class="score"><span class="mini"><i style="width:0" data-w="${w.manualEffort}%"></i></span>${w.manualEffort}/100</span></div></div>
    <div class="field"><div class="k">Automation readiness</div><div class="v"><span class="score"><span class="mini"><i style="width:0" data-w="${w.readiness}%"></i></span>${w.readiness}/100</span></div></div>
    <div class="field"><div class="k">MAVIS confidence</div><div class="v">${w.confidence}%</div></div></section>`;
}
function cardOpp(w){
  return `<section class="card"><h2 class="sec">Automation Opportunities</h2>
    <div class="field"><div class="k">Repetitive tasks detected</div><div class="v">${w.repetitive.map(r=>`<span class="chip type">${esc(r)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Recommended automation</div><div class="v"><span class="chip">${esc(w.autoType)}</span><p style="margin-top:6px;color:var(--ink2)">${esc(w.autoRec)}</p></div></div>
    <div class="field"><div class="k">AI agents deployed</div><div class="v">${w.aiAgents.map(a=>`<span class="chip ai">${esc(a)}</span>`).join('')}</div></div></section>`;
}
function cardImpact(w){
  const cards=[['hrs saved / mo',w.monthlyHours,''],['hrs saved / yr',w.annualHours.toLocaleString(),''],['$ saved / mo',money(w.monthlyCost),'alt'],['$ saved / yr',money(w.annualCost),'alt'],['min / execution',w.perExec,''],['productivity gain',w.productivity+'%',''],['year-1 ROI',w.roi+'%','alt'],['payback',w.payback+' mo','alt']].map(([l,v,c])=>`<div class="kpi ${c}"><div class="val txt">${v}</div><div class="lbl">${l}</div></div>`).join('');
  return `<section class="card"><h2 class="sec">Business Impact &middot; ${esc(w.name)}</h2><div class="kpis">${cards}</div></section>`;
}
function cardCharts(w){
  const deptSegs=[...DATA.departments].sort((a,b)=>b.monthlyCost-a.monthlyCost).map((d,i)=>({label:d.name,value:d.monthlyCost,disp:money(d.monthlyCost),color:DONUT_COLORS[i%DONUT_COLORS.length]}));
  const top=[...DATA.workflows].sort((a,b)=>b.annualHours-a.annualHours).slice(0,6);
  const maxH=Math.max(...top.map(x=>x.annualHours));
  const bars=top.map(x=>`<div class="bar-row"><div class="name" style="width:150px">${esc(x.name.length>20?x.name.slice(0,19)+'…':x.name)}${x.id===w.id?' <span style="color:var(--acc)">★</span>':''}</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="${(x.annualHours/maxH*100).toFixed(1)}%"></div></div><div class="amt">${x.annualHours.toLocaleString()}</div></div>`).join('');
  const rb=[['Ready (85+)',x=>x.readiness>=85,'#10B981'],['Strong (75-84)',x=>x.readiness>=75&&x.readiness<85,'#06B6D4'],['Emerging (<75)',x=>x.readiness<75,'#F59E0B']];
  const rSegs=rb.map(([l,f,c])=>({label:l,value:DATA.workflows.filter(f).length,color:c}));
  return `<div class="ovgrid3">
    <section class="card"><div class="miniTitle">Opportunity by Department</div>${donut(deptSegs,String(DATA.exec.workflowsAnalyzed),'workflows')}</section>
    <section class="card"><div class="miniTitle">Top Workflows by Annual Hours Saved</div>${bars}</section>
    <section class="card"><div class="miniTitle">Automation Readiness</div>${donut(rSegs,DATA.exec.avgReadiness+'%','avg')}</section>
  </div>`;
}
function cardSavings(w){
  const rows=[...DATA.workflows].sort((a,b)=>b.annualCost-a.annualCost).slice(0,6).map(x=>`<div class="sv" data-id="${x.id}" style="cursor:pointer"><div><div class="svn">${esc(x.name)}${x.id===w.id?' <span style="color:var(--acc)">★</span>':''}</div><div class="svd">${esc(x.dept)}</div></div><div class="svv">${money(x.annualCost)}/yr</div></div>`).join('');
  return `<section class="card"><div class="miniTitle">Top Savings Opportunities</div><div class="savlist" id="savlist2">${rows}</div></section>`;
}
function cardRoadmap(w){
  return `<section class="card"><h2 class="sec">Implementation Roadmap</h2>
    <div class="field"><div class="k">Phase &middot; priority</div><div class="v"><span class="chip">${esc(w.phase)}</span> <span class="pill p-${w.priority}">${w.priority}</span></div></div>
    <div class="field"><div class="k">Build effort &middot; time &middot; cost</div><div class="v">Effort ${esc(w.effort)} &middot; ${esc(w.implTime)} &middot; ${money(w.implCost)} one-time</div></div>
    <div class="field"><div class="k">Required integrations</div><div class="v">${w.integrations.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Dependencies</div><div class="v">${esc(w.dependencies||'None')}</div></div></section>`;
}
function cardTools(w){
  return `<section class="card"><h2 class="sec">Tools Needed &middot; Automation Solar Map</h2>
    <p class="lead">MAVIS sits at the center, orchestrating the tools this workflow needs, with its AI agents in the inner orbit. Hover or tap a tool to see details.</p>
    <div class="diagram">${svgDiagram(w)}</div>
    <div class="diaglegend"><span><i class="lg core"></i>MAVIS core</span><span><i class="lg agent"></i>AI agent</span><span><i class="lg tool"></i>Tool</span></div></section>`;
}
function svgDiagram(w){
  const tools=[...new Set((w.integrations&&w.integrations.length?w.integrations:w.recommendedTools.split(',').map(s=>s.trim())).filter(Boolean))].slice(0,6);
  const agents=(w.aiAgents||[]).slice(0,3);
  const known=new Set(DATA.tools.map(t=>t.name.toLowerCase()));
  const trunc=(s,m)=>{ s=String(s); return s.length>m?s.slice(0,m-1)+'…':s; };
  const W=820,H=470,cx=410,cy=235,Rx=300,Ry=150,rx=150,ry=80;
  const n=tools.length||1;
  let rings=`<ellipse cx="${cx}" cy="${cy}" rx="${Rx}" ry="${Ry}" fill="none" stroke="#334155" stroke-dasharray="3 6" opacity=".6"/>`;
  if(agents.length) rings+=`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#334155" stroke-dasharray="3 6" opacity=".45"/>`;
  let edges='',planets='';
  tools.forEach((t,i)=>{ const a=(-90+i*360/n)*Math.PI/180, px=+(cx+Rx*Math.cos(a)).toFixed(1), py=+(cy+Ry*Math.sin(a)).toFixed(1), isk=known.has(t.toLowerCase());
    const label=trunc(t,20), pw=Math.min(170,label.length*7.3+26);
    edges+=`<line class="edge core" x1="${cx}" y1="${cy}" x2="${px}" y2="${py}"/>`;
    planets+=`<g class="dnode tool"${isk?` data-tool="${esc(t)}"`:''}><circle cx="${px}" cy="${py}" r="6" fill="#06B6D4"/><g transform="translate(${px},${py})"><rect x="${-pw/2}" y="13" width="${pw}" height="26" rx="8" fill="#172033" stroke="#334155"/><text x="0" y="30" text-anchor="middle" font-size="12" fill="var(--ink2)" font-weight="600">${esc(label)}</text></g></g>`;
  });
  let agentG='';
  agents.forEach((ag,i)=>{ const a=(-90+i*360/(agents.length||1))*Math.PI/180, px=+(cx+rx*Math.cos(a)).toFixed(1), py=+(cy+ry*Math.sin(a)).toFixed(1);
    const label=trunc(ag,18), pw=Math.min(150,label.length*6.6+20);
    agentG+=`<line class="edge" x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" opacity=".5"/><g class="dnode"><circle cx="${px}" cy="${py}" r="4" fill="#6366F1"/><g transform="translate(${px},${py})"><rect x="${-pw/2}" y="-25" width="${pw}" height="20" rx="7" fill="rgba(99,102,241,.14)" stroke="rgba(99,102,241,.4)"/><text x="0" y="-11" text-anchor="middle" font-size="10" fill="var(--acc2)" font-weight="600">${esc(label)}</text></g></g>`;
  });
  const sun=`<g class="dnode core"><circle cx="${cx}" cy="${cy}" r="46" fill="rgba(6,182,212,0.16)" stroke="#06B6D4" stroke-width="2" filter="url(#glow)"/><circle cx="${cx}" cy="${cy}" r="30" fill="rgba(6,182,212,0.22)"/><text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="17" font-weight="750" fill="var(--acc)">MAVIS</text><text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${agents.length} AI agents</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${rings}${edges}${agentG}${planets}${sun}</svg>`;
}
function collapsible(title,inner){
  return `<section class="card acc"><div class="acchead" data-acc><h2 class="sec" style="margin:0">${title}</h2><span class="chev">▾</span></div><div class="accbody">${inner}</div></section>`;
}
function workflowInner(w){
  return `<div class="field"><div class="k">Current process</div><div class="v">${esc(w.currentProcess)}</div></div>
    <div class="field"><div class="k">Department &middot; frequency</div><div class="v">${esc(w.dept)} &middot; ${esc(w.frequency)}</div></div>
    <div class="field"><div class="k">Current tools</div><div class="v">${esc(w.currentTools)}</div></div>
    <div class="field"><div class="k">Manual effort</div><div class="v"><span class="score"><span class="mini"><i style="width:0" data-w="${w.manualEffort}%"></i></span>${w.manualEffort}/100</span></div></div>
    <div class="field"><div class="k">Automation readiness</div><div class="v"><span class="score"><span class="mini"><i style="width:0" data-w="${w.readiness}%"></i></span>${w.readiness}/100</span></div></div>
    <div class="field"><div class="k">MAVIS confidence</div><div class="v">${w.confidence}%</div></div>`;
}
function oppInner(w){
  return `<div class="field"><div class="k">Repetitive tasks detected</div><div class="v">${w.repetitive.map(r=>`<span class="chip type">${esc(r)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Recommended automation</div><div class="v"><span class="chip">${esc(w.autoType)}</span><p style="margin-top:6px;color:var(--ink2)">${esc(w.autoRec)}</p></div></div>
    <div class="field"><div class="k">AI agents deployed</div><div class="v">${w.aiAgents.map(a=>`<span class="chip ai">${esc(a)}</span>`).join('')}</div></div>`;
}
function roadmapInner(w){
  return `<div class="field"><div class="k">Phase &middot; priority</div><div class="v"><span class="chip">${esc(w.phase)}</span> <span class="pill p-${w.priority}">${w.priority}</span></div></div>
    <div class="field"><div class="k">Build effort &middot; time &middot; cost</div><div class="v">Effort ${esc(w.effort)} &middot; ${esc(w.implTime)} &middot; ${money(w.implCost)} one-time</div></div>
    <div class="field"><div class="k">Required integrations</div><div class="v">${w.integrations.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div></div>
    <div class="field"><div class="k">Dependencies</div><div class="v">${esc(w.dependencies||'None')}</div></div>`;
}
function savingsInner(w){
  const rows=[...DATA.workflows].sort((a,b)=>b.annualCost-a.annualCost).slice(0,6).map(x=>`<div class="sv" data-id="${x.id}" style="cursor:pointer"><div><div class="svn">${esc(x.name)}${x.id===w.id?' <span style="color:var(--acc)">★</span>':''}</div><div class="svd">${esc(x.dept)}</div></div><div class="svv">${money(x.annualCost)}/yr</div></div>`).join('');
  return `<div class="savlist" id="savlist2">${rows}</div>`;
}
// ===== Results interface (exact 5-card summary) =====
const BRAND={hubspot:'#ff7a59',slack:'#611f69',google:'#1a73e8',chatgpt:'#10a37f',openai:'#10a37f',airtable:'#f82b60',zoom:'#2d8cff',stripe:'#635bff',mailchimp:'#ffcf3e',quickbooks:'#2ca01c',greenhouse:'#1a8f6e',calendly:'#006bff',docusign:'#d4a015',gusto:'#f45d48',claude:'#d97757',canva:'#00c4cc',buffer:'#2c4bff',notion:'#ffffff',descript:'#5b3df5',capcut:'#111111',asana:'#f06a6a',mono:'#111111'};
function brandColor(name){ const k=String(name).toLowerCase(); for(const b in BRAND){ if(k.includes(b)) return BRAND[b]; } return '#6366f1'; }
function svgWrap(inner){ return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${inner}</svg>`; }
function toolIcon(name){
  const k=String(name).toLowerCase();
  if(k.includes('drive')) return svgWrap('<path d="M9.3 3h5.4l6.8 11.8h-5.4z" fill="#ffcf3e"/><path d="M9.3 3 2.5 14.8l2.7 4.7 6.8-11.8z" fill="#00ac47"/><path d="M5.2 19.5h13.6l2.7-4.7H7.9z" fill="#2684fc"/>');
  if(k.includes('google')) return svgWrap('<rect x="3" y="3" width="8" height="8" rx="2" fill="#4285F4"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#EA4335"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#FBBC05"/><rect x="13" y="13" width="8" height="8" rx="2" fill="#34A853"/>');
  if(k.includes('hubspot')) return svgWrap('<circle cx="12.5" cy="10.5" r="4.4" fill="none" stroke="#ff7a59" stroke-width="2.3"/><circle cx="12.5" cy="10.5" r="1.5" fill="#ff7a59"/><circle cx="19.5" cy="4.8" r="2" fill="#ff7a59"/><path d="M12.5 14.9V18" stroke="#ff7a59" stroke-width="2.3"/><circle cx="9" cy="20" r="2.6" fill="none" stroke="#ff7a59" stroke-width="2.3"/>');
  if(k.includes('slack')) return svgWrap('<rect x="4" y="4" width="7" height="7" rx="2" fill="#36C5F0"/><rect x="13" y="4" width="7" height="7" rx="2" fill="#2EB67D"/><rect x="4" y="13" width="7" height="7" rx="2" fill="#ECB22E"/><rect x="13" y="13" width="7" height="7" rx="2" fill="#E01E5A"/>');
  if(k.includes('asana')) return svgWrap('<circle cx="12" cy="6.5" r="3" fill="#f06a6a"/><circle cx="6.6" cy="16" r="3" fill="#f06a6a"/><circle cx="17.4" cy="16" r="3" fill="#f06a6a"/>');
  if(k.includes('airtable')) return svgWrap('<path d="M12 4 20.5 7.4 12 10.8 3.5 7.4z" fill="#ffbf00"/><path d="M12.8 12 20 9.1v6.1L12.8 18z" fill="#26b5f8"/><path d="M11.2 12 4 9.1v6.1L11.2 18z" fill="#f82b60"/>');
  if(k.includes('zoom')) return svgWrap('<rect x="2.5" y="7" width="13" height="10" rx="3.2" fill="#2d8cff"/><path d="M15.5 10.4 21.5 7.4v9.2l-6-3z" fill="#2d8cff"/>');
  if(k.includes('chatgpt')||k.includes('openai')) return svgWrap('<path d="M12 2.3l2 7.7 7.7 2-7.7 2-2 7.7-2-7.7-7.7-2 7.7-2z" fill="#10a37f"/>');
  if(k.includes('claude')) return svgWrap('<path d="M12 2.3l2 7.7 7.7 2-7.7 2-2 7.7-2-7.7-7.7-2 7.7-2z" fill="#d97757"/>');
  return null;
}
function toolBadge(name){
  const ic=toolIcon(name);
  if(ic) return `<div class="tbadge logo" title="${esc(name)}" data-tool="${esc(name)}">${ic}</div>`;
  const k=String(name).toLowerCase(); const c=brandColor(name);
  const dark=/notion|mailchimp/.test(k); const txt=dark?'#111':'#fff';
  let label=(String(name).trim().replace(/[^a-z0-9]/gi,'')[0]||'?').toUpperCase();
  if(k.includes('quickbooks')) label='qb'; else if(k.includes('capcut')) label='C';
  return `<div class="tbadge mono" title="${esc(name)}" data-tool="${esc(name)}" style="background:${c};color:${txt}">${esc(label)}</div>`;
}
function donutMini(segs,big,small){
  const total=segs.reduce((s,x)=>s+x.value,0)||1; const C=2*Math.PI*46; let off=0;
  const rings=segs.map(s=>{ const dash=s.value/total*C; const seg=`<circle cx="62" cy="62" r="46" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${dash.toFixed(2)} ${(C-dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 62 62)"/>`; off+=dash; return seg; }).join('');
  return `<svg width="124" height="124" viewBox="0 0 124 124"><circle cx="62" cy="62" r="46" fill="none" stroke="rgba(148,163,184,.12)" stroke-width="16"/>${rings}<text x="62" y="58" text-anchor="middle" font-size="24" font-weight="750" fill="#F8FAFC">${big}</text><text x="62" y="77" text-anchor="middle" font-size="10.5" fill="#94A3B8">${small}</text></svg>`;
}
function miniFlow(tools){
  const t=tools.slice(0,3);
  return `<svg viewBox="0 0 224 122" width="100%" height="112" style="max-width:230px">
    <line x1="52" y1="61" x2="92" y2="61" stroke="#334155" stroke-width="2"/>
    <line x1="146" y1="61" x2="176" y2="34" stroke="#334155" stroke-width="2"/>
    <line x1="146" y1="61" x2="176" y2="88" stroke="#334155" stroke-width="2"/>
    <g><rect x="10" y="47" width="44" height="28" rx="8" fill="#0e2a33" stroke="#0891b2"/><text x="32" y="65" text-anchor="middle" font-size="9" fill="var(--acc)">${esc((t[0]||'Source').slice(0,6))}</text></g>
    <g><rect x="92" y="44" width="54" height="34" rx="9" fill="rgba(6,182,212,.14)" stroke="#06B6D4"/><text x="119" y="65" text-anchor="middle" font-size="9.5" fill="var(--acc)" font-weight="700">MAVIS</text></g>
    <g><rect x="176" y="20" width="44" height="26" rx="7" fill="#131c33" stroke="#6366F1"/><text x="198" y="37" text-anchor="middle" font-size="8.5" fill="var(--acc2)">${esc((t[1]||'Tool').slice(0,6))}</text></g>
    <g><rect x="176" y="76" width="44" height="26" rx="7" fill="#131c33" stroke="#6366F1"/><text x="198" y="93" text-anchor="middle" font-size="8.5" fill="var(--acc2)">${esc((t[2]||'Output').slice(0,6))}</text></g>
  </svg>`;
}
function miniBars(annH){
  const ramp=[0.06,0.26,0.5,1], labs=['Mo 1','Mo 3','Mo 6','Mo 12'];
  const dec=annH<50?1:0; const vals=ramp.map(r=>+(annH*r).toFixed(dec));
  const max=vals[3]||1, W=236, bw=34, gap=(W-bw*4)/5; let bars='';
  vals.forEach((v,i)=>{ const h=Math.max(5,(v/max)*78), x=gap+i*(bw+gap), y=92-h;
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="4" fill="url(#gbar)"/><text x="${(x+bw/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--ink2)" font-weight="600">${v.toLocaleString()}</text><text x="${(x+bw/2).toFixed(1)}" y="108" text-anchor="middle" font-size="8.5" fill="#94a3b8">${labs[i]}</text>`;
  });
  return `<div class="minichart-t">Impact Over Time (Hours Saved)</div><svg viewBox="0 0 ${W} 112" width="100%" height="112"><defs><linearGradient id="gbar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#065f46"/><stop offset="1" stop-color="#10B981"/></linearGradient></defs>${bars}</svg>`;
}
function rcWorkflows(w,tools){
  return `<section class="rcard rc-third"><div class="rc-h"><div class="rbadge b1">&#9096;</div><div><div class="rc-t">1. Workflows</div><div class="rc-s">Workflows analyzed by MAVIS</div></div></div>
   <div class="rc-body"><div class="rc-left"><div class="bignum">1</div><div class="bignum-l">Workflow Analyzed</div></div><div class="rc-right">${miniFlow(tools)}</div></div>
   <div class="rc-sum"><div class="rc-sumt">High Level Summary</div><div class="rc-sumd">MAVIS analyzed the end-to-end workflow and identified ${w.repetitive.length} repetitive tasks across ${tools.length} tools.</div></div>
   <a class="rlink" data-view>View Workflow &rarr;</a></section>`;
}
function rcOpps(w){
  const opp=w.repetitive.length||1;
  const hi=Math.max(1,Math.round(opp*0.4)), lo=Math.max(0,Math.round(opp*0.25)), me=Math.max(0,opp-hi-lo);
  const segs=[{label:'High',value:hi,color:'#10B981'},{label:'Medium',value:me,color:'#F59E0B'},{label:'Low',value:lo,color:'#06B6D4'}].filter(s=>s.value>0);
  const leg=`<div><span class="idot" style="background:#10B981"></span>${hi} High Impact</div>`+(me>0?`<div><span class="idot" style="background:#F59E0B"></span>${me} Medium Impact</div>`:'')+(lo>0?`<div><span class="idot" style="background:#06B6D4"></span>${lo} Low Impact</div>`:'');
  return `<section class="rcard rc-third"><div class="rc-h"><div class="rbadge b2">&#9889;</div><div><div class="rc-t">2. Automation Opportunities</div><div class="rc-s">Opportunities identified and prioritized</div></div></div>
   <div class="rc-body"><div class="rc-left"><div class="bignum">${opp}</div><div class="bignum-l">Opportunities Identified</div><div class="implist">${leg}</div></div><div class="rc-right">${donutMini(segs,String(opp),'Total')}</div></div>
   <a class="rlink" data-view>View Opportunities &rarr;</a></section>`;
}
function rcImpact(w){
  const annH=w.annualHours, roi3=Math.round(((w.annualCost*3-w.implCost)/w.implCost)*100);
  return `<section class="rcard rc-third"><div class="rc-h"><div class="rbadge b3">&#9202;</div><div><div class="rc-t">3. Business Impact</div><div class="rc-s">Estimated time, cost savings, and ROI</div></div></div>
   <div class="rc-body impact"><div class="rc-left">
     <div class="imetric"><div class="iv" style="color:var(--pos)">${annH.toLocaleString()}</div><div class="il">Hours Saved / Year</div></div>
     <div class="imetric"><div class="iv" style="color:var(--pos)">${money(w.annualCost)}</div><div class="il">Cost Savings / Year</div></div>
     <div class="imetric"><div class="iv">${roi3}%</div><div class="il">Est. ROI (3-Year)</div></div>
   </div><div class="rc-right">${miniBars(annH)}</div></div>
   <a class="rlink" data-view>View Business Impact &rarr;</a></section>`;
}
function rcRoadmap(w){
  const tiers=[['Quick Wins','#10B981','1-2 weeks','Start immediately'],['Medium Term','#F59E0B','1-2 months','Next 30 days'],['Strategic','#8B5CF6','3-6 months','Next 90 days']];
  const leg=tiers.map(t=>`<div class="rmrow"><span class="idot" style="background:${t[1]}"></span><span class="rmn">${t[0]}</span><span class="rmi">1 initiative</span><span class="rmt">${t[2]}</span></div>`).join('');
  const tl=tiers.map(t=>`<div class="tlrow"><span class="flag" style="color:${t[1]}">&#9873;</span><div><div class="tln">${t[0]}</div><div class="tld">${t[3]}</div></div></div>`).join('');
  return `<section class="rcard rc-half"><div class="rc-h"><div class="rbadge b4">&#9873;</div><div><div class="rc-t">4. Implementation Roadmap</div><div class="rc-s">Recommended roadmap and timeline</div></div></div>
   <div class="rc-body road"><div class="rc-left"><div class="bignum">3</div><div class="bignum-l">Roadmap Initiatives</div><div class="rmlist">${leg}</div></div>
     <div class="rc-right tlbox"><div class="tlt">Timeline Overview</div>${tl}</div></div>
   <a class="rlink" data-view>View Roadmap &rarr;</a></section>`;
}
function rcTools(w){
  const cur=[...new Set(w.currentTools.split(',').map(s=>s.trim()).filter(Boolean))];
  const rec=[...new Set(w.recommendedTools.split(',').map(s=>s.trim()).filter(Boolean))].filter(t=>!cur.some(c=>c.toLowerCase()===t.toLowerCase())).slice(0,4);
  return `<section class="rcard rc-half"><div class="rc-h"><div class="rbadge b5">&#9638;</div><div><div class="rc-t">5. Tools</div><div class="rc-s">Tools used and recommended by MAVIS</div></div></div>
   <div class="rc-body tools"><div class="rc-left"><div class="bignum">${w.integrations.length}</div><div class="bignum-l">Tools Involved</div>
     <div class="toolsdet"><div class="tsub">Tools Detected</div><div class="tbrow">${cur.slice(0,4).map(toolBadge).join('')}</div></div></div>
     <div class="rc-right"><div class="tsub">Recommended Tools</div><div class="tbrow">${(rec.length?rec:cur.slice(0,3)).map(toolBadge).join('')}</div></div></div>
   <a class="rlink" data-view>View Tools &rarr;</a></section>`;
}
function resultsHTML(w){
  const tools=[...new Set((w.integrations&&w.integrations.length?w.integrations:w.recommendedTools.split(',').map(s=>s.trim())).filter(Boolean))];
  return `<div class="resultshead">
     <div><div class="rhtitle"><span class="livedot"></span>Live MAVIS Analysis Results <span class="donepill">&#10003; Completed just now</span></div>
       <div class="ranalysis">Analysis: ${esc(w.name)} &mdash; ${esc(w.dept)}</div></div>
     <button class="detailsbtn" data-view>View Analysis Details &#8599;</button>
   </div>
   <div class="rgrid">${rcWorkflows(w,tools)}${rcOpps(w)}${rcImpact(w)}${rcRoadmap(w)}${rcTools(w)}</div>`;
}

let liveTimer=null;
let shownId=null;
const PHASES=['Reading workflow...','Mapping business process...','Detecting repetitive tasks...','Identifying automation opportunities...','Calculating business impact...','Building implementation roadmap...','Generating AI insights...'];
function wireLive(){ /* analysis runs from the global "Live MAVIS Analysis" button / search / Ask */ }
// switch to the live view and run the analysis for the active task
function runAnalysisNow(){
  const wasLive=(state.view==='live');
  state.view='live'; renderNav(); render(); window.scrollTo(0,0);
  setTimeout(runLive, wasLive?70:300);
}
function animateDiagram(){
  document.querySelectorAll('#c-tools .edge').forEach((p,idx)=>{ try{ const len=p.getTotalLength(); p.style.strokeDasharray=len; p.style.strokeDashoffset=len; p.getBoundingClientRect(); p.style.transition='stroke-dashoffset .7s ease '+(idx*0.05)+'s'; requestAnimationFrame(()=>{ p.style.strokeDashoffset='0'; }); }catch(e){} });
}
function finishLive(){
  const cards=$('#cards'); if(!cards) return;
  const w=currentWF(); shownId=w.id;
  const tp=$('#topprog'); if(tp) setTimeout(()=>tp.classList.remove('on'),600);
  const rh=document.querySelector('.livehint'); if(rh) rh.remove();
  cards.innerHTML=resultsHTML(w);
  cards.style.display='block'; cards.classList.add('show');
  const top=[...cards.querySelectorAll('.topgrid .storysec')];
  top.forEach((s,i)=>setTimeout(()=>{ s.classList.add('show'); animate(s); },i*160));
  setTimeout(()=>{
    document.querySelectorAll('#cards [data-view]').forEach(a=>{ a.style.cursor='pointer'; a.onclick=()=>openWorkflow(w.id); });
    document.querySelectorAll('#cards [data-tool]').forEach(g=>g.onclick=(ev)=>{ ev.stopPropagation(); openTool(g.getAttribute('data-tool')); });
    const sb=$('#startBtn'); if(sb) sb.onclick=revealStage2;
  }, top.length*160+120);
}
function revealStage2(){
  const s2=$('#stage2'); if(!s2) return; s2.classList.remove('hidden2');
  const items=[...s2.querySelectorAll('.storysec')];
  items.forEach((c,i)=>setTimeout(()=>{ c.classList.add('show'); animate(c); },i*150));
  const sb=$('#startBtn'); if(sb){ sb.textContent='✓ Automation Blueprint Ready'; sb.disabled=true; }
  const w=currentWF();
  setTimeout(()=>{
    s2.scrollIntoView({behavior:'smooth',block:'start'});
    document.querySelectorAll('#stage2 [data-view]').forEach(a=>{ a.style.cursor='pointer'; a.onclick=()=>openWorkflow(w.id); });
    document.querySelectorAll('#stage2 [data-tool]').forEach(g=>g.onclick=(ev)=>{ ev.stopPropagation(); openTool(g.getAttribute('data-tool')); });
  }, items.length*150+120);
}
function runLive(){
  if(liveTimer || state.view!=='live') return;
  const w=currentWF(); recordRecent(w);
  shownId=null;
  const rh=document.querySelector('.livehint'); if(rh) rh.remove();
  const cards=$('#cards'); if(cards){ cards.style.display='none'; cards.classList.remove('show'); }
  // compact reasoning status/progress under the global search bar
  const tp=$('#topprog'), fill=$('#tpFill'), pctEl=$('#tpPct'), stEl=$('#tpStatus');
  if(tp) tp.classList.add('on');
  if(fill) fill.style.width='0%';
  const hbtn=$('#liveBtn'); if(hbtn){ hbtn.disabled=true; hbtn.classList.add('busy'); }
  let p=0;
  liveTimer=setInterval(()=>{
    p+=2+Math.round((100-p)*0.05); if(p>100)p=100;
    if(fill) fill.style.width=p+'%'; if(pctEl) pctEl.textContent=p+'%';
    const idx=Math.min(PHASES.length-1,Math.floor(p/(100/PHASES.length)));
    if(stEl) stEl.textContent=PHASES[idx];
    if(p>=100){ clearInterval(liveTimer); liveTimer=null;
      if(stEl) stEl.textContent='Analysis complete'; if(pctEl) pctEl.textContent='100%';
      if(hbtn){ hbtn.disabled=false; hbtn.classList.remove('busy'); }
      finishLive();
    }
  },90);
}

function recordRecent(w){
  const i=recent.findIndex(r=>r.id===w.id); if(i>=0) recent.splice(i,1);
  recent.unshift({id:w.id,name:w.name,dept:w.dept,annualCost:w.annualCost});
  if(recent.length>8) recent.length=8;
}

// ---------- Ask MAVIS assistant ----------
// Suggestions are BUSINESS VERTICALS. Clicking one explains how MAVIS supports that industry
// + the automations we'd set up — all ranked by the same unified engine (mavisSearch), seeded per vertical.
const ASK_VERTICALS=[
  {name:'Law Firm',ic:'&#9878;',seed:'client intake contract document extraction matter research scheduling billing email follow-up',support:'client intake &amp; follow-up, pulling data out of contracts and filings, matter research, scheduling, and invoice prep &mdash; so attorneys bill more hours and chase less paperwork.',match:['law','legal','attorney','lawyer','litigation','law firm','paralegal']},
  {name:'Real Estate',ic:'&#127968;',seed:'lead follow-up listing content graphics showing scheduling e-signature documents CRM updates',support:'lead capture and nurture, listing content &amp; graphics, showing scheduling, transaction-document prep, and CRM updates &mdash; so agents stay in front of clients, not admin.',match:['real estate','realtor','property','broker','listing','realty','brokerage']},
  {name:'Medical / Dental Clinic',ic:'&#129658;',seed:'appointment scheduling reminders patient intake forms records extraction billing insurance follow-up',support:'appointment scheduling &amp; reminders, patient intake forms, records/PDF extraction, and billing follow-up &mdash; cutting front-desk load while staying organized.',match:['medical','dental','clinic','doctor','dentist','health','patient','practice','healthcare']},
  {name:'E-commerce / Retail',ic:'&#128722;',seed:'order sync inventory customer support tickets reviews sales reporting email marketing returns',support:'order &amp; inventory sync, support-ticket triage, review monitoring, sales reporting, and email/social marketing &mdash; so the store runs even while you sleep.',match:['ecommerce','e-commerce','retail','store','shopify','online shop','merch','dtc']},
  {name:'Marketing Agency',ic:'&#128226;',seed:'content creation repurpose social media scheduling branded graphics client reporting dashboards lead research',support:'content drafting &amp; repurposing, social scheduling, branded graphics, client reporting dashboards, and lead research &mdash; so the team scales output without scaling headcount.',match:['agency','marketing agency','ad agency','creative agency','marketing firm']},
  {name:'Accounting / Bookkeeping',ic:'&#128202;',seed:'invoice receipt extraction reconciliation expense reports data entry recurring financial reporting spreadsheets',support:'invoice/receipt extraction, reconciliation, expense reports, and recurring financial reporting &mdash; turning manual data entry into reviewed drafts.',match:['accounting','bookkeep','accountant','cpa','tax','finance firm']},
  {name:'Restaurant / Hospitality',ic:'&#127869;',seed:'reservation staff scheduling review responses social media posts supplier inventory performance reporting email',support:'reservation &amp; staff scheduling, review responses, social posts, supplier/inventory tracking, and performance reporting.',match:['restaurant','hospitality','cafe','hotel','food service','bar','catering']},
  {name:'Home Services',ic:'&#128296;',seed:'lead follow-up job scheduling dispatch quotes invoicing review requests CRM reminders',support:'lead follow-up, job scheduling/dispatch, quote &amp; invoice prep, and review requests &mdash; so techs stay booked and get paid faster.',match:['hvac','plumbing','plumber','electrician','contractor','home service','roofing','landscaping','cleaning service']},
  {name:'SaaS / Startup',ic:'&#128640;',seed:'lead generation outreach user onboarding sequences support ticket triage metrics reporting dashboards research',support:'lead gen &amp; outreach, onboarding sequences, support triage, and metrics dashboards &mdash; automating ops so the team can keep shipping.',match:['saas','startup','software company','tech company','b2b software','founder']},
  {name:'Nonprofit',ic:'&#129309;',seed:'donor outreach email grant research impact reporting event scheduling data entry social content',support:'donor outreach &amp; email, grant research, impact reporting, event scheduling, and social content &mdash; stretching a small team much further.',match:['nonprofit','non-profit','ngo','charity','donor','foundation']},
];
// Data bank: goal phrase -> real MAVIS capabilities that deliver it
const ASK_BANK=[
  {label:'reporting and dashboards',kw:['report','dashboard','kpi','reporting','deck','metrics','summary','analytics','performance','weekly report','monthly report'],wf:['CAP-01','CAP-02']},
  {label:'spreadsheets and data entry',kw:['spreadsheet','sheet','data entry','excel','formula','workbook','tracker','data cleanup','copy paste'],wf:['CAP-02','CAP-05']},
  {label:'organizing files',kw:['organize','drive','files','folder','rename','file management','document management','storage'],wf:['CAP-03']},
  {label:'research',kw:['research','competitor','market','look up','find out','competitive','intelligence','due diligence','vendor','prospect research'],wf:['CAP-04']},
  {label:'document and PDF extraction',kw:['pdf','extract','invoice','invoicing','billing','document data','scan document','ocr','receipt','receipts','contract','statement','forms'],wf:['CAP-05','CAP-02']},
  {label:'bookkeeping and finance ops',kw:['bookkeeping','accounting','expense','expenses','reconcile','reconciliation','ledger','payables','finance'],wf:['CAP-05','CAP-02','CAP-01']},
  {label:'graphics and design',kw:['graphic','graphics','image','design','social post','visual','logo','banner','thumbnail','ad creative'],wf:['CAP-06']},
  {label:'content and social media',kw:['content','blog','newsletter','copy','write','writing','repurpose','post','social media','social','caption','captions','marketing'],wf:['CAP-07','CAP-06']},
  {label:'scheduling and coordination',kw:['schedule','scheduling','calendar','meeting','book','booking','appointment','appointments','availability','reminders'],wf:['CAP-08']},
  {label:'web and form automation',kw:['scrape','form','forms','monitor','browser','web automation','fill out','website','landing page','intake'],wf:['CAP-09']},
  {label:'GitHub and dev automation',kw:['github','repo','issue','pull request','code','script','developer','engineering'],wf:['CAP-10','CAP-12']},
  {label:'email, outreach and CRM prep',kw:['email','inbox','outreach','follow-up','followup','reply','cold email','crm','contacts','leads','pipeline','email management','sales'],wf:['CAP-11','CAP-12']},
  {label:'onboarding and multi-step operations',kw:['automate everything','audit','migration','orchestrate','big project','multi-step','end to end','onboarding','onboard','operations','process','workflow','handoff'],wf:['CAP-12','CAP-09','CAP-03']},
  {label:'customer support and Q&A over your data',kw:['question','ask','q&a','answer','lookup','knowledge','customer support','support','help desk','helpdesk','tickets','faq','chatbot','client questions'],wf:['CAP-13','CAP-11']},
];
// rich recommendation block: capability cards each with a Run MAVIS Analysis button
function recommendHTML(results,intro){
  if(!results||!results.length) return '';
  const items=results.map(raw=>{
    const r=(raw&&raw.title&&raw.wfId)?raw:capRecipe(raw.w||raw);
    const w=DATA.workflows.find(x=>x.id===r.wfId);
    const meta=w?`${money(w.annualCost)}/yr &middot; ${w.readiness}% ready`:'';
    const tag=r.kind==='integration'?'<span class="askrecTag">Automation</span> ':'';
    return `<div class="askrec"><div class="askrec-h"><span>${esc(r.title)}</span>${meta?`<span class="askrec-v">${meta}</span>`:''}</div><div class="askrec-d">${tag}${esc(r.desc)}</div><button class="askrec-run" data-ask-run-wf="${esc(r.wfId)}">&#10022; Run MAVIS Analysis</button></div>`;
  }).join('');
  return `${intro}<div class="askrecs">${items}</div>`;
}
function bankAnswer(b){
  const W=DATA.workflows; const ws=b.wf.map(id=>W.find(w=>w.id===id)).filter(Boolean); if(!ws.length) return null;
  const caps=ws.map(w=>({w})).sort((a,c)=>c.w.annualCost-a.w.annualCost);
  const tot=ws.reduce((a,w)=>a+w.annualCost,0);
  return recommendHTML(caps,`For <b>${b.label}</b>, MAVIS recommends ${ws.length} automation${ws.length>1?'s':''} &mdash; together about <b>${money(tot)}/yr</b> in impact. Pick one to run a full analysis:`);
}
// per-vertical answer: same unified engine, seeded with that industry's typical work
function verticalAnswer(v){
  const results=mavisSearch(v.seed,5);
  const intro=`Here&rsquo;s how MAVIS supports a <b>${esc(v.name)}</b> &mdash; ${v.support}<br><br>Top automations we&rsquo;d set up for you, ranked by relevance &amp; impact:`;
  if(!results.length) return `MAVIS supports <b>${esc(v.name)}</b> businesses: ${v.support}`;
  return recommendHTML(results,intro);
}
function askAnswer(q){
  const e=DATA.exec, W=DATA.workflows, s=q.toLowerCase().trim();
  const has=(...k)=>k.some(x=>s.includes(x));
  const wfLink=w=>`<a data-ask-wf="${w.id}">${esc(w.name)}</a>`;
  if(has('hi','hello','hey')&&s.length<14) return `Hi, I'm MAVIS. Tell me your <b>industry</b> (like &ldquo;real estate&rdquo; or &ldquo;law firm&rdquo;), a goal, or ask about my capabilities, savings, ROI, or tools.`;
  // business-vertical match first — tailored support + automations for that industry
  const vHit=ASK_VERTICALS.find(v=>{ const n=v.name.toLowerCase(); return s===n||s.includes(n)||(v.match||[]).some(m=>s.includes(m)); });
  if(vHit) return verticalAnswer(vHit);
  // integration-specific answers first (before the broad goal bank)
  const CAT=(DATA.catalog&&DATA.catalog.tools)||[];
  const catHit=CAT.find(t=>{ const d=t.display.toLowerCase(); return s===d||s.startsWith(d+' ')||s.includes(' '+d+' ')||s.includes(' '+d+'?')||s.endsWith(' '+d); });
  if(catHit && has('work with','works with','integrat','connect','support','compatible','sync','use ','does mavis','can mavis','do you'))
    return `Yes &mdash; MAVIS integrates with <b>${esc(catHit.display)}</b> (${esc(catHit.cat)}). For example it can ${(catHit.caps||[]).slice(0,2).map(c=>esc(c.charAt(0).toLowerCase()+c.slice(1))).join('; ')}. <a data-ask-cat="${esc(catHit.slug)}">See all ${(catHit.caps||[]).length} capabilities</a>.`;
  if(has('integration','integrations','connectable','connect to','how many app','what app','which app','apps do','apps can','tools do you','what tools','which tools'))
    return `MAVIS connects to <b>${DATA.catalog.apps.toLocaleString()} apps</b> across <b>${DATA.catalog.categories.length} categories</b> &mdash; with <b>${DATA.catalog.documented}</b> documented, API-verified integrations (CRM, payments, e-signature, scheduling, marketing, support, and more). <a data-ask-view="catalog">Browse the Integration Library</a> to see what MAVIS can do with each.`;
  if(has('roi','return on','payback','pay back')){
    const best=[...W].sort((a,b)=>b.roi-a.roi)[0], avg=Math.round(W.reduce((a,x)=>a+x.roi,0)/W.length), pay=(e.totalImplCost/e.monthlyCost).toFixed(1);
    return `Average year-1 ROI is <b>${avg}%</b>. The strongest is ${wfLink(best)} at <b>${best.roi}%</b> (payback ${best.payback} mo). Blended payback across all builds is about <b>${pay} months</b> on <b>${money(e.totalImplCost)}</b> of build investment.`;
  }
  if(has('hour','hrs')&&!has('save')){ return `MAVIS projects <b>${e.monthlyHours.toLocaleString()} hours/mo</b> and <b>${e.annualHours.toLocaleString()} hours/yr</b> saved across all ${e.workflowsAnalyzed} workflows.`; }
  if(has('save','saving','cost','money','dollar','revenue','worth')){
    const top=[...W].sort((a,b)=>b.annualCost-a.annualCost)[0];
    return `MAVIS projects <b>${money(e.monthlyCost)}/mo</b> and <b>${money(e.annualCost)}/yr</b> in savings across <b>${e.workflowsAnalyzed} workflows</b>. The biggest single opportunity is ${wfLink(top)} at <b>${money(top.annualCost)}/yr</b>.`;
  }
  const named=DATA.departments.find(x=>s.includes(x.name.toLowerCase().split('/')[0]));
  if(named && has('department','dept','team',named.name.toLowerCase().split('/')[0]))
    return `<b>${esc(named.name)}</b> (owner: ${esc(named.owner)}) has <b>${named.count} workflows</b> saving <b>${money(named.monthlyCost)}/mo</b>. KPIs: ${named.kpis.map(esc).join('; ')}.`;
  if(has('department','dept','team')){
    const d=[...DATA.departments].sort((a,b)=>b.monthlyCost-a.monthlyCost);
    return `Top departments by savings: ${d.slice(0,4).map(x=>`${esc(x.name)} (${money(x.monthlyCost)}/mo)`).join(', ')}. <b>${esc(d[0].name)}</b> leads.`;
  }
  if(has('high priority','priorit','urgent')){
    const hi=W.filter(w=>w.priority==='High').sort((a,b)=>b.annualCost-a.annualCost);
    return `There are <b>${hi.length} high-priority</b> workflows. Top by savings: ${hi.slice(0,4).map(wfLink).join(', ')}.`;
  }
  if(has('quick win','phase 1','phase one','fastest')){
    const p1=W.filter(w=>w.phase==='Phase 1 - Quick Wins'); const tot=p1.reduce((a,x)=>a+x.monthlyCost,0);
    return `Phase 1 quick wins: <b>${p1.length} workflows</b> returning <b>${money(tot)}/mo</b>. For example ${p1.sort((a,b)=>b.annualCost-a.annualCost).slice(0,3).map(wfLink).join(', ')}.`;
  }
  if(has('agent')) return `MAVIS proposes <b>${e.aiAgents} specialized AI agents</b> across the ${e.workflowsAnalyzed} workflows, such as screening, drafting, scheduling, and reconciliation agents.`;
  if(has('deliverable','produce','showcase','example','portfolio','sample')) return `MAVIS produces real deliverables like this interactive showcase, live Google Sheets dashboards, styled reports, and research briefs. See the <b>What MAVIS Can Do</b> tab for examples and sample work.`;
  if(has('how many','count','number of','total workflows')){
    if(has('workflow','task')) return `MAVIS analyzed <b>${e.workflowsAnalyzed} workflows</b> across <b>${e.departments} departments</b>.`;
    return `Key counts: <b>${e.workflowsAnalyzed}</b> workflows, <b>${e.departments}</b> departments, <b>${DATA.catalog.apps.toLocaleString()}</b> connectable apps (${DATA.catalog.documented} documented), <b>${e.aiAgents}</b> AI agents, <b>${(DATA.deliverables||[]).length}</b> deliverables.`;
  }
  const tool=DATA.tools.find(t=>s.includes(t.name.toLowerCase()));
  if(tool && has('tool','integrat','connect','stack','api','use case')) return `<b>${esc(tool.name)}</b> (${esc(tool.cat)}) — API: ${esc(tool.api)}. Use cases: ${tool.useCases.slice(0,3).map(esc).join('; ')}. Tied to <b>${tool.related.length}</b> workflows. <a data-ask-tool="${esc(tool.name)}">Open details</a>.`;
  // ===== unified recommendation: same engine as CSA + global search =====
  const results=mavisSearch(s,4);
  const industry=has('law','legal','attorney','clinic','medical','dental','health','restaurant','retail','real estate','realtor','property','ecommerce','e-commerce','agency','startup','nonprofit','saas','consult','firm','industry','company','team','office','store','practice');
  if(results.length && has('tool','integrat','connect','stack')){
    const cap=results.find(r=>r.kind==='capability')||results[0];
    const w=cap.w||DATA.workflows.find(x=>x.id===cap.wfId);
    const toolList=(w&&w.integrations&&w.integrations.length?w.integrations:cap.tools||[]).map(esc).join(', ')||'connected tools';
    return `For <b>${esc(cap.title)}</b>, MAVIS uses ${toolList}, orchestrated end to end.`+recommendHTML(results,` Run a full analysis to see every tool, the workflow breakdown, and the roadmap:`);
  }
  const intro=industry
    ? `For a business like that, MAVIS most often automates these &mdash; ranked by relevance and impact:`
    : `Here are the automations that best fit &ldquo;${esc(q)}&rdquo;, ranked by relevance:`;
  return recommendHTML(results,intro);
}
function askAddMsg(html,who){
  const m=el(`<div class="msg ${who}">${html}</div>`); $('#askMsgs').appendChild(m);
  if(who==='bot'){
    m.querySelectorAll('[data-ask-run-wf]').forEach(a=>a.onclick=()=>{closeAsk();selectAnalysis(a.getAttribute('data-ask-run-wf'));});
    m.querySelectorAll('[data-ask-wf]').forEach(a=>a.onclick=()=>{closeAsk();openAnalysis(a.getAttribute('data-ask-wf'));});
    m.querySelectorAll('[data-ask-tool]').forEach(a=>a.onclick=()=>{closeAsk();openTool(a.getAttribute('data-ask-tool'));});
    m.querySelectorAll('[data-ask-cat]').forEach(a=>a.onclick=()=>{closeAsk();openCatalogTool(a.getAttribute('data-ask-cat'));});
    m.querySelectorAll('[data-ask-view]').forEach(a=>a.onclick=()=>{closeAsk();state.view=a.getAttribute('data-ask-view');renderNav();render();window.scrollTo(0,0);});
  }
  const box=$('#askMsgs'); box.scrollTop=box.scrollHeight;
}
function askSubmit(q){ q=(q||'').trim(); if(!q) return; askAddMsg(esc(q),'user'); let ans; try{ ans=askAnswer(q); }catch(err){ ans='Sorry, I hit a snag answering that. Try rephrasing.'; } setTimeout(()=>askAddMsg(ans,'bot'),240); }
function openAsk(){ const p=$('#askPanel'); p.classList.add('open'); const box=$('#askMsgs'); if(!box.dataset.init){ box.dataset.init='1'; askAddMsg(`Hi, I'm <b>MAVIS</b>, your automation consultant. <b>Pick your industry</b> below &mdash; or tell me one (like <i>"real estate"</i> or <i>"dental clinic"</i>) &mdash; and I'll show how I support that business and the automations I'd set up. You can also ask about capabilities, savings, ROI, or tools.`,'bot'); } $('#askIn').focus(); }
function closeAsk(){ $('#askPanel').classList.remove('open'); }

// ===== v12.2 business-value story results =====
const RATE_LABEL='$50/hr';
function calcM(w){
  const score=Math.max(40,Math.min(100,Math.round(w.readiness*0.7+w.confidence*0.3)));
  const fte=(w.annualHours/2080);
  const roi3=Math.round(((w.annualCost*3-w.implCost)/w.implCost)*100);
  const afterMo=Math.round(w.monthlyHours*0.15);
  const perRunManual=w.perExec, perRunMavis=Math.max(1,Math.round(w.perExec*0.08));
  const fteBefore=+(w.annualHours/2080).toFixed(2), fteAfter=+((afterMo*12)/2080).toFixed(2);
  const verdict=score>=85?'Excellent automation candidate':score>=70?'Strong automation candidate':'Solid automation candidate';
  const vsub=score>=85?'This workflow is a top-tier opportunity for immediate automation.':score>=70?'This workflow is well-suited for automation with fast payback.':'This workflow can be automated with meaningful returns.';
  return {score,fte,roi3,afterMo,perRunManual,perRunMavis,fteBefore,fteAfter,verdict,vsub};
}
function fmtDur(min){ min=Math.round(min); return min>=90?(min/60).toFixed(1)+' hrs':min+' min'; }
const REC_MAP={'Manual data entry':'Auto-capture and sync fields with an AI + API integration','Copy & paste':'Automated data transfer between connected tools','Status updates':'Auto-status pulled from the source system','Follow-ups':'Scheduled AI follow-up sequences','Report generation':'One-click auto-generated reports','Approvals':'Routed one-click approval workflow','Notifications':'Event-triggered smart notifications','Multi-app switching':'Single MAVIS orchestration across all tools'};
function secVerdict(w,m){
  const ring=donutMini([{label:'Score',value:m.score,color:'#06B6D4'},{label:'',value:100-m.score,color:'rgba(148,163,184,.15)'}],m.score,'/ 100');
  return `<section class="card verdict"><div class="vd-l"><div class="vd-tag"><span class="livedot"></span>MAVIS VERDICT</div>
     <div class="vd-h">${esc(m.verdict)}</div><div class="vd-s">${esc(m.vsub)}</div>
     <div class="vd-metrics">
       <div class="vdm"><div class="vdm-v">${w.priority}</div><div class="vdm-l">Priority</div></div>
       <div class="vdm"><div class="vdm-v">${w.confidence}%</div><div class="vdm-l">Confidence</div></div>
       <div class="vdm"><div class="vdm-v">${esc(w.implTime)}</div><div class="vdm-l">Est. Implementation</div></div>
     </div></div>
     <div class="vd-r"><div class="vd-ring">${ring}</div><div class="vd-ringl">Automation Score</div></div></section>`;
}
function secWorkflow(w){
  const steps=['Trigger','Collect inputs','Manual processing','Cross-tool updates','Deliver output'];
  const bottleneck=[2,3];
  const flow=steps.map((s,i)=>`<div class="wstep ${bottleneck.includes(i)?'bad':''}">${esc(s)}</div>${i<steps.length-1?'<div class="warrow">&rarr;</div>':''}`).join('');
  const bn=w.repetitive.map(r=>`<div class="bnrow"><span class="bni">&#9888;</span>${esc(r)}</div>`).join('');
  return `<section class="card"><div class="sec-h"><div class="rbadge b1">&#9096;</div><div><div class="sec-t">Workflow Breakdown</div><div class="sec-s">How the work flows today, and where it stalls</div></div><div class="sec-tag">${w.repetitive.length} tasks analyzed</div></div>
    <div class="wflow">${flow}</div>
    <div class="bntitle">Manual bottlenecks highlighted</div><div class="bnlist">${bn}</div></section>`;
}
function secOpps(w){
  const pr=['High','Medium','Low'];
  const rows=w.repetitive.map((r,i)=>{ const p=pr[Math.min(i,2)]; return `<div class="opprow"><div class="oppl"><div class="oppt">${esc(r)}</div><div class="oppd">${esc(REC_MAP[r]||'Automated with a MAVIS agent')}</div></div><span class="pill p-${p}">${p}</span></div>`; }).join('');
  return `<section class="card"><div class="sec-h"><div class="rbadge b2">&#9889;</div><div><div class="sec-t">Automation Opportunities</div><div class="sec-s">Repetitive tasks detected and how MAVIS automates them</div></div></div>
    <div class="opplist">${rows}</div>
    <div class="oppfoot"><b>Recommended approach:</b> ${esc(w.autoType)} &middot; ${esc(w.autoRec)}</div></section>`;
}
function secImpact(w,m){
  const tiles=[['Hours saved / year',w.annualHours.toLocaleString(),'#6ee7b7'],['Cost savings / year',money(w.annualCost),'#6ee7b7'],['ROI (3-year)',m.roi3+'%','#a5f3fc'],['Payback period',w.payback+' mo','#a5f3fc'],['Equivalent FTE saved',m.fte.toFixed(2),'#c7d2fe']].map(t=>`<div class="itile"><div class="itv" style="color:${t[2]}">${t[1]}</div><div class="itl">${t[0]}</div></div>`).join('');
  return `<section class="card"><div class="sec-h"><div class="rbadge b3">&#9202;</div><div><div class="sec-t">Business Impact</div><div class="sec-s">What changes for the business after automation</div></div></div>
    <div class="bagrid"><div class="ba before"><div class="bah">Before &middot; Manual</div><div class="bav">${w.monthlyHours} hrs/mo</div><div class="bad">Handled by staff across ${esc(w.currentTools)}</div></div>
      <div class="baarrow">&rarr;</div>
      <div class="ba after"><div class="bah">After &middot; MAVIS</div><div class="bav">~${m.afterMo} hrs/mo</div><div class="bad">MAVIS runs it; staff only reviews exceptions</div></div></div>
    <div class="itiles">${tiles}</div></section>`;
}
function secRoadmap(w){
  const tiers=[['Quick Wins','#10B981','1-2 weeks','Phase 1 - Quick Wins'],['Medium-Term','#F59E0B','1-2 months','Phase 2 - Build'],['Strategic','#8B5CF6','3-6 months','Phase 3 - Scale']];
  const rows=tiers.map(t=>{ const on=w.phase===t[3]; return `<div class="rmrow2 ${on?'on':''}"><span class="flag" style="color:${t[1]}">&#9873;</span><div class="rm2l"><div class="rm2n">${t[0]}${on?' <span class="rmnow">this workflow</span>':''}</div><div class="rm2d">${t[2]}</div></div></div>`; }).join('');
  return `<section class="card"><div class="sec-h"><div class="rbadge b4">&#9873;</div><div><div class="sec-t">Implementation Roadmap</div><div class="sec-s">A phased plan to roll this out</div></div><div class="sec-tag">Est. completion ${esc(w.implTime)}</div></div>
    <div class="rm2list">${rows}</div></section>`;
}
function secTools(w){
  const cur=[...new Set(w.currentTools.split(',').map(s=>s.trim()).filter(Boolean))];
  const rec=[...new Set(w.recommendedTools.split(',').map(s=>s.trim()).filter(Boolean))];
  const newTools=rec.filter(t=>!cur.some(c=>c.toLowerCase()===t.toLowerCase()));
  const reasons=newTools.slice(0,4).map(t=>`<div class="irrow"><span class="iri">&#43;</span><b>${esc(t)}</b> &middot; connects into the flow to remove manual steps and enable automation</div>`).join('')||'<div class="irrow">Works with the tools already in place &mdash; no new software required.</div>';
  const agents=w.aiAgents.map(a=>`<span class="chip ai">${esc(a)}</span>`).join('');
  return `<section class="card"><div class="sec-h"><div class="rbadge b5">&#9638;</div><div><div class="sec-t">Tools &amp; Integrations</div><div class="sec-s">What MAVIS uses to run this workflow</div></div></div>
    <div class="tgrid2"><div><div class="tsub">Current tools detected</div><div class="tbrow">${cur.map(toolBadge).join('')}</div></div>
      <div><div class="tsub">Recommended tools</div><div class="tbrow">${(newTools.length?newTools:cur).map(toolBadge).join('')}</div></div></div>
    <div class="tsub" style="margin-top:16px">Integration reasons</div><div class="irlist">${reasons}</div>
    <div class="tsub" style="margin-top:16px">AI agents involved</div><div>${agents}</div></section>`;
}
function secInsights(w,m){
  const bn=w.repetitive.slice(0,2).join(' and ')||'repetitive manual steps';
  const txt=`MAVIS analyzed <b>${esc(w.name)}</b> in <b>${esc(w.dept)}</b> &mdash; a ${esc(w.frequency.toLowerCase())} workflow run manually across ${w.integrations.length} tools. The biggest drag on the team is <b>${esc(bn)}</b>, which forces staff to move data by hand and switch between systems. Automating it with a <b>${esc(w.autoType)}</b> approach lets MAVIS handle the routine work end to end, with people stepping in only for exceptions. Expected impact: about <b>${w.annualHours.toLocaleString()} hours</b> and <b>${money(w.annualCost)}</b> saved per year &mdash; roughly <b>${m.fte.toFixed(2)} full-time employees</b> of capacity returned to higher-value work &mdash; with payback in <b>${w.payback} months</b>. Recommended next step: schedule this as a <b>${esc(w.phase.replace(/Phase \d+ - /,''))}</b> build and start with the highest-impact bottleneck first.`;
  return `<section class="card insights"><div class="sec-h"><div class="rbadge bi">&#10024;</div><div><div class="sec-t">MAVIS AI Insights</div><div class="sec-s">Executive summary generated for this workflow</div></div></div>
    <p class="insighttxt">${txt}</p></section>`;
}
function secCTA(w,m){
  return `<section class="card cta"><div class="cta-grid">
     <div class="ctam"><div class="ctav">${money(w.annualCost)}</div><div class="ctal">Estimated annual savings</div></div>
     <div class="ctam"><div class="ctav">${esc(w.implTime)}</div><div class="ctal">Estimated implementation</div></div>
     <div class="ctam"><div class="ctav">${w.confidence}%</div><div class="ctal">MAVIS confidence</div></div>
   </div>
   <div class="cta-b"><div class="cta-h">Ready to capture ${money(w.annualCost)} a year?</div><div class="cta-s">MAVIS can scope and stand up this automation for you.</div></div>
   <button class="ctabtn" data-cta>Start Your Automation Assessment &rarr;</button></section>`;
}
function resultsHTML(w){
  const m=calcM(w);
  return `<div class="resultshead">
     <div><div class="rhtitle"><span class="livedot"></span>Live MAVIS Analysis Results <span class="donepill">&#10003; Completed just now</span></div>
       <div class="ranalysis">Analysis: ${esc(w.name)} &mdash; ${esc(w.dept)}</div></div>
     <button class="detailsbtn" data-view>View Analysis Details &#8599;</button>
   </div>
   <div class="story">
     <div class="storysec">${secVerdict(w,m)}</div>
     <div class="storysec">${secWorkflow(w)}</div>
     <div class="storysec">${secOpps(w)}</div>
     <div class="storysec">${secImpact(w,m)}</div>
     <div class="storysec">${secRoadmap(w)}</div>
     <div class="storysec">${secTools(w)}</div>
     <div class="storysec">${secInsights(w,m)}</div>
     <div class="storysec">${secCTA(w,m)}</div>
   </div>`;
}

// ===== v12.3 two-stage value story =====
function fitText(s){ return s>=90?'Excellent Automation Fit':s>=75?'Strong Automation Fit':'Good Automation Fit'; }
function riskOf(w){ if(w.readiness>=85&&w.effort!=='L') return['Low','var(--pos)']; if(w.readiness>=72) return['Medium','var(--warn)']; return['Elevated','var(--neg)']; }
function greenRing(score){
  const C=2*Math.PI*44, dash=score/100*C;
  return `<svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="44" fill="none" stroke="rgba(148,163,184,.14)" stroke-width="12"/><circle cx="59" cy="59" r="44" fill="none" stroke="#10B981" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(C-dash).toFixed(1)}" transform="rotate(-90 59 59)"/><text x="59" y="64" text-anchor="middle" font-size="26" font-weight="800" fill="#F8FAFC">${score}</text></svg>`;
}
function cardVerdict2(w,m){
  const flame=w.priority==='High'?' &#128293;':'';
  return `<section class="card v2card"><div class="c2h"><div class="rbadge b1">&#129302;</div><div class="c2t">MAVIS Verdict</div></div>
    <div class="v2fit">&#129302; ${fitText(m.score)}</div>
    <div class="v2sl">Automation Score</div>
    <div class="v2score">${m.score}<span> / 100</span></div>
    <div class="mbar"><i style="width:${m.score}%"></i></div>
    <div class="v2metrics"><div class="v2m"><span>Priority</span><b class="p-${w.priority}" style="background:none;border:0;padding:0">${flame}${w.priority}</b></div><div class="v2m"><span>Confidence</span><b>${w.confidence}%</b></div></div></section>`;
}
function valueBars(annC){
  const vals=[1,2,3,4,5].map(y=>annC*y); const max=vals[4]||1, W=250, bw=30, gap=(W-bw*5)/6; let bars='';
  vals.forEach((v,i)=>{ const h=Math.max(6,(v/max)*66), x=gap+i*(bw+gap), y=80-h;
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="3" fill="url(#gv)"/><text x="${(x+bw/2).toFixed(1)}" y="94" text-anchor="middle" font-size="8" fill="#94a3b8">Y${i+1}</text>`; });
  return `<svg viewBox="0 0 ${W} 98" width="100%" height="96"><defs><linearGradient id="gv" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#065f46"/><stop offset="1" stop-color="#10B981"/></linearGradient></defs>${bars}</svg>`;
}
function cardValue(w,m){
  const days=Math.round(w.payback*30.4);
  const pct=Math.max(1,Math.min(99,Math.round((1-m.afterMo/Math.max(1,w.monthlyHours))*100)));
  return `<section class="card v2card"><div class="c2h"><div class="rbadge b3">$</div><div class="c2t">Business Impact</div></div>
    <div class="impbig"><div class="impbig-v">${pct}%</div><div class="impbig-l">faster than the manual process</div></div>
    <div class="imph"><span>Hours Saved</span><b>${w.annualHours.toLocaleString()} hrs/yr</b></div>
    <div class="mbar"><i style="width:${pct}%"></i></div>
    <div class="imptiles">
      <div class="imptile"><div class="itv2">${money(w.annualCost)}</div><div class="itl2">Saved / year</div></div>
      <div class="imptile"><div class="itv2">${m.roi3}%</div><div class="itl2">ROI (3-yr)</div></div>
      <div class="imptile"><div class="itv2">${days} days</div><div class="itl2">Payback</div></div>
    </div>
    <div class="bvnote">Estimate: <b>${w.monthlyHours} hrs/mo</b> of manual work automated &times; a blended <b>${RATE_LABEL}</b> labor rate. FTE = annual hours &divide; 2,080. Figures are modeled estimates, not guarantees.</div></section>`;
}
function cardInsight2(w,m){
  const pct=Math.max(1,Math.min(99,Math.round((1-m.afterMo/Math.max(1,w.monthlyHours))*100)));
  const bnPct=Math.max(55,Math.min(80,Math.round(w.readiness*0.85)));
  const bnTask=(w.repetitive[0]||'processing').replace(/^manual\s+/i,'').toLowerCase();
  const recList=(w.repetitive.length?w.repetitive.slice(0,3):['the routine steps']).map(r=>r.replace(/^manual\s+/i,'').toLowerCase());
  const rec=recList.length>1?recList.slice(0,-1).join(', ')+', and '+recList[recList.length-1]:recList[0];
  return `<section class="card v2card insight2"><div class="c2h"><div class="rbadge bi">&#10024;</div><div class="c2t">MAVIS Insight</div></div>
    <p class="in2lead">I analyzed <b>${esc(w.name)}</b> and found:</p>
    <div class="insl">
      <div class="inb bottleneck"><div class="inbk">Biggest Bottleneck</div><div class="inbv">Manual ${esc(bnTask)} consumes <b>${bnPct}%</b> of total execution time.</div></div>
      <div class="inb rec"><div class="inbk">Recommendation</div><div class="inbv">Automate ${esc(rec)}.</div></div>
      <div class="inb result"><div class="inbk">Expected Result</div><div class="inbchips"><span class="inbchip">${pct}% faster</span><span class="inbchip">${money(w.annualCost)}/yr saved</span><span class="inbchip">ROI ${m.roi3}%</span></div></div>
    </div></section>`;
}
function rocketSVG(){
  return `<div class="rocket"><svg width="46" height="46" viewBox="0 0 48 56"><g class="rbody"><path d="M24 2c7 5 10 13 10 22 0 5-2 9-4 12h-12c-2-3-4-7-4-12 0-9 3-17 10-22z" fill="var(--acc2)" stroke="#6366F1" stroke-width="1.5"/><circle cx="24" cy="19" r="4.5" fill="#0b1020" stroke="#06B6D4" stroke-width="1.6"/><path d="M14 30l-6 8 8-3z" fill="#6366F1"/><path d="M34 30l6 8-8-3z" fill="#6366F1"/></g><g class="rflame"><path d="M20 40h8l-4 12z" fill="#F59E0B"/><path d="M21.5 40h5l-2.5 7z" fill="var(--warn)"/></g></svg></div>`;
}
function cardReady(w,m){
  const [risk,rc]=riskOf(w);
  return `<section class="card v2card ready2"><div class="c2h">${rocketSVG()}<div><div class="c2t">Ready for Automation?</div><div class="c2s">You're all set to automate this workflow</div></div></div>
    <div class="rdrows">
      <div><span>&#10003; Estimated Annual Savings</span><b style="color:var(--pos)">${money(w.annualCost)}</b></div>
      <div><span>&#9201; Time per run</span><b><span style="color:var(--neg)">${fmtDur(m.perRunManual)}</span> &rarr; <span style="color:var(--pos)">~${fmtDur(m.perRunMavis)}</span></b></div>
      <div><span>&#128737; Risk Level</span><b style="color:${rc}">${risk}</b></div>
      <div><span>&#9737; Confidence Score</span><b style="color:var(--pos)">${w.confidence}%</b></div>
    </div>
    <button class="ctabtn" id="startBtn">&#128640;&nbsp; Launch Automation</button>
    <div class="rdsub">Let MAVIS build your automation and unlock real value.</div></section>`;
}
// ---- stage 2 ----
function cardWorkflow2(w){
  const mm=calcM(w);
  const manual=['Someone does the work by hand, step by step','Switches between '+w.integrations.length+' tools and re-keys data','Repeats it '+w.frequency.toLowerCase()+', every time'];
  const mavis=['Triggered automatically &mdash; no manual start','MAVIS runs it end to end across your tools','You review the finished result and approve'];
  const mcol=manual.map(s=>`<li>${s}</li>`).join('');
  const vcol=mavis.map(s=>`<li>${s}</li>`).join('');
  return `<section class="card s2card"><div class="c2h"><div class="rbadge b1">&#9096;</div><div class="c2t">Workflow Breakdown</div><div class="c2s2"><span style="color:var(--neg)">${fmtDur(mm.perRunManual)}</span> &rarr; <span style="color:var(--pos)">~${fmtDur(mm.perRunMavis)}</span> per run</div></div>
    <div class="mvm"><div class="mvcol manual"><div class="mvh"><span class="mvdot man"></span>Manual today</div><p class="mvp">${esc(w.currentProcess)}</p><ul class="mvul man">${mcol}</ul></div>
      <div class="mvcol mavis"><div class="mvh"><span class="mvdot mav"></span>With MAVIS</div><p class="mvp">${esc(w.autoRec)}</p><ul class="mvul mav">${vcol}</ul></div></div>
    <a class="rlink" data-view>View full workflow &rarr;</a></section>`;
}
function cardOpps2(w){
  const n=w.repetitive.length||1, perH=Math.round(w.annualHours/n), perC=Math.round(w.annualCost/n);
  const rows=w.repetitive.map((r,i)=>`<div class="op2row"><div class="op2i">&#9889;</div><div class="op2l"><div class="op2t">${esc(REC_MAP[r]?('Automate '+r.toLowerCase()):r)}</div><div class="op2d">${esc(REC_MAP[r]||'MAVIS agent automation')}</div></div><div class="op2v"><div>${perH} hrs/yr</div><div class="op2s">${money(perC)}</div></div></div>`).join('');
  return `<section class="card s2card"><div class="c2h"><div class="rbadge b2">&#9889;</div><div class="c2t">Top Automation Opportunities (${n})</div></div>
    <div class="op2list">${rows}</div><a class="rlink" data-view>View all opportunities &rarr;</a></section>`;
}
function cardRoadmap2(w){
  const days=Math.round(w.payback*0+ (w.implTime.includes('week')? (parseInt(w.implTime)||3)*7 : 19));
  const weeks=[['Week 1','Connect systems & integrations','Quick Win','#10B981'],['Week 2','Configure AI & automations','Quick Win','#10B981'],['Week 3','Test & validate workflows','Medium Term','#F59E0B'],['Week 4','Go live & monitor performance','Strategic','#8B5CF6']];
  const rows=weeks.map(k=>`<div class="wk2row"><span class="wk2dot" style="background:${k[3]}"></span><div class="wk2l"><div class="wk2n">${k[0]}</div><div class="wk2d">${k[1]}</div></div><span class="wk2tag" style="color:${k[3]};border-color:${k[3]}55;background:${k[3]}1a">${k[2]}</span></div>`).join('');
  return `<section class="card s2card"><div class="c2h"><div class="rbadge b4">&#9873;</div><div class="c2t">Implementation Roadmap</div></div>
    <div class="wk2list">${rows}</div><div class="wk2foot">&#128197; Estimated Completion: ~19 days</div></section>`;
}
function toolChip(t,kind){ return `<span class="tchip ${kind}" data-tool="${esc(t)}">${toolBadge(t)}<span class="tchl">${esc(t)}</span></span>`; }
function cardToolsNeeded(w){
  const cur=[...new Set(w.currentTools.split(',').map(s=>s.trim()).filter(Boolean))];
  const rec=[...new Set(w.recommendedTools.split(',').map(s=>s.trim()).filter(Boolean))].filter(t=>!cur.some(c=>c.toLowerCase()===t.toLowerCase()));
  const curChips=cur.map(t=>toolChip(t,'ok')).join('');
  const recChips=rec.map(t=>toolChip(t,'rec')).join('')||`<span class="tchl" style="color:var(--muted);font-size:12px">No new software required.</span>`;
  return `<section class="card s2card"><div class="c2h"><div class="rbadge b5">&#9638;</div><div class="c2t">Tools Needed</div><div class="c2s2">Recommended tools &amp; integrations</div></div>
    <div class="tnsub ok">Already connected</div><div class="tchips">${curChips}</div>
    <div class="tnsub rec">Recommended to add</div><div class="tchips">${recChips}</div></section>`;
}
function resultsHTML(w){
  const m=calcM(w);
  return `<div class="resultshead">
     <div><div class="rhtitle"><span class="livedot"></span>Live MAVIS Analysis Results <span class="donepill">&#10003; Completed just now</span></div>
       <div class="ranalysis">Analysis: ${esc(w.name)} &mdash; ${esc(w.dept)}</div></div>
     <button class="detailsbtn" data-view>View Analysis Details &#8599;</button>
   </div>
   <div class="topgrid">
     <div class="storysec">${cardVerdict2(w,m)}</div>
     <div class="storysec">${cardValue(w,m)}</div>
     <div class="storysec">${cardInsight2(w,m)}</div>
     <div class="storysec">${cardReady(w,m)}</div>
   </div>
   <div id="stage2" class="stage2 hidden2">
     <div class="s2head">Automation Blueprint</div>
     <div class="s2grid">
       <div class="storysec">${cardWorkflow2(w)}</div>
       <div class="storysec">${cardOpps2(w)}</div>
       <div class="storysec">${cardToolsNeeded(w)}</div>
       <div class="storysec">${cardRoadmap2(w)}</div>
     </div>
   </div>`;
}

// ---------- boot ----------
INDEX=buildIndex();
buildCapText();
renderNav(); render();
const liveBtn=$('#liveBtn'); if(liveBtn) liveBtn.onclick=()=>{
  const si=$('#search'); const q=(si?si.value:'').trim().toLowerCase();
  if(q){ const match=DATA.workflows.find(w=>(w.name+' '+w.desc+' '+w.dept+' '+w.currentTools+' '+w.recommendedTools+' '+w.repetitive.join(' ')+' '+(w.keywords||[]).join(' ')).toLowerCase().includes(q)); if(match) state.activeId=match.id; }
  const box=$('#results'); if(box) box.classList.remove('open');
  runAnalysisNow();
};
// theme toggle (persisted; defaults to dark)
(function initTheme(){
  let saved=null; try{ saved=localStorage.getItem('mavis-theme'); }catch(e){}
  const apply=(t)=>{ document.documentElement.setAttribute('data-theme',t); const b=$('#themeBtn'); if(b) b.innerHTML=(t==='light')?'&#9728;':'&#9789;'; };
  apply(saved==='light'?'light':'dark');
  const tb=$('#themeBtn'); if(tb) tb.onclick=()=>{ const cur=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light'; apply(cur); try{ localStorage.setItem('mavis-theme',cur); }catch(e){} };
})();
const filterBtn=$('#filterBtn'); if(filterBtn) filterBtn.onclick=(ev)=>{ ev.stopPropagation(); $('#scope').classList.toggle('open'); };
document.querySelectorAll('#scope .scb').forEach(b=>b.onclick=()=>{
  state.scope=b.dataset.scope;
  document.querySelectorAll('#scope .scb').forEach(x=>x.classList.toggle('active',x===b));
  $('#scope').classList.remove('open');
  if(filterBtn) filterBtn.innerHTML='Filters &#9662;'+(b.dataset.scope!=='all'?' &middot; '+b.textContent:'');
  const si=$('#search'); if(si.value) runDiscovery(si.value); si.focus();
});
document.addEventListener('click',(ev)=>{ if(!ev.target.closest('.filterwrap')) $('#scope').classList.remove('open'); });
const si=$('#search');
// Search now drives the AI-powered Automation Discovery experience (debounced), not a dropdown.
let discTimer=null;
si.addEventListener('input',()=>{ if(discTimer) clearTimeout(discTimer); const v=si.value; discTimer=setTimeout(()=>runDiscovery(v),320); });
si.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ if(discTimer) clearTimeout(discTimer); runDiscovery(si.value); } });
document.addEventListener('click',(ev)=>{ if(!ev.target.closest('.searchwrap')) $('#results').classList.remove('open'); });
document.addEventListener('keydown',(ev)=>{ if(ev.key==='Escape'){ closeDrawer(); closeAsk(); $('#results').classList.remove('open'); } });

// Ask MAVIS wiring
$('#askChips').innerHTML=`<span class="qchipLbl">Pick your industry:</span>`+ASK_VERTICALS.map(v=>`<span class="qchip" data-vert="${esc(v.name)}">${v.ic} ${esc(v.name)}</span>`).join('');
document.querySelectorAll('#askChips .qchip').forEach(c=>c.onclick=()=>askSubmit(c.getAttribute('data-vert')));
$('#askBtn').onclick=openAsk;
$('#askClose').onclick=closeAsk;
$('#askSend').onclick=()=>{ const inp=$('#askIn'); askSubmit(inp.value); inp.value=''; };
$('#askIn').addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ askSubmit($('#askIn').value); $('#askIn').value=''; } });

// Business-vertical bar under the global search (same verticals + engine as Ask MAVIS)
(function initVertbar(){
  const vb=$('#vertbar'); if(!vb) return;
  vb.innerHTML=`<span class="vertlbl">Or explore by business vertical:</span>`+ASK_VERTICALS.map(v=>`<button class="vchip" data-vert="${esc(v.name)}">${v.ic} ${esc(v.name)}</button>`).join('');
  vb.querySelectorAll('.vchip').forEach(b=>b.onclick=()=>{ const v=ASK_VERTICALS.find(x=>x.name===b.dataset.vert); if(v) searchVertical(v); });
})();



