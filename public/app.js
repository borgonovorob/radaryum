const q=s=>document.querySelector(s);
let view="companies",controller=null,forceNextRefresh=false,refreshing=false;

document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{
  view=btn.dataset.view;
  document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===btn));
  q("#signalWrap").hidden=view!=="events";
  q("#countLabel").textContent=view==="archive"?"archived companies":view;
  load();
}));

["country","window","minScore","signal"].forEach(id=>q(`#${id}`).addEventListener("change",load));

q("#refresh").addEventListener("click",async()=>{
  if(refreshing)return;
  refreshing=true;
  const button=q("#refresh");
  button.disabled=true;
  button.textContent="Refreshing…";

  try{
    const before=await load(false);
    const baseline=before?.snapshotId||before?.snapshotCreatedAt||before?.generatedAt||"";
    forceNextRefresh=true;
    await load(false);
    button.textContent="Collecting signals…";

    let changed=false;
    for(let attempt=0;attempt<15;attempt+=1){
      await new Promise(resolve=>setTimeout(resolve,5000));
      button.textContent=`Collecting signals… ${Math.min(75,(attempt+1)*5)}s`;
      const current=await load(false);
      const marker=current?.snapshotId||current?.snapshotCreatedAt||current?.generatedAt||"";
      if(marker&&marker!==baseline){changed=true;break;}
    }
    button.textContent=changed?"Updated":"Refresh queued";
    await new Promise(resolve=>setTimeout(resolve,1200));
  }finally{
    refreshing=false;
    button.disabled=false;
    button.textContent="Refresh live";
  }
});

async function load(showLoading=true){
  controller?.abort();controller=new AbortController();
  q("#refresh").disabled=true;q("#error").hidden=true;
  q("#status").textContent=view==="archive"?"Reading persistent archive":"Reading latest ready snapshot";
  if(showLoading)q("#list").innerHTML=`<div class="loading">${view==="archive"?"Reading accumulated opportunity history…":"Loading industrial signals…"}</div>`;

  const p=new URLSearchParams({minScore:q("#minScore").value});
  if(q("#country").value)p.set("country",q("#country").value);
  if(forceNextRefresh&&view!=="archive")p.set("refresh","1");
  forceNextRefresh=false;

  let endpoint;
  if(view==="archive"){
    p.set("limit","100");
    endpoint=`/api/archive?${p}`;
  }else{
    p.set("window",q("#window").value);
    if(view==="events"&&q("#signal").value)p.set("signal",q("#signal").value);
    endpoint=`/api/${view}?${p}`;
  }

  try{
    const d=await apiJson(endpoint,{cache:"no-store",signal:controller.signal});
    let items;
    if(view==="companies"){items=d.companies||[];renderCompanies(items,false);}
    else if(view==="events"){items=d.events||[];renderEvents(items);}
    else{
      if(!d.configured){
        q("#list").innerHTML='<div class="empty">The D1 archive is not connected yet.</div>';
        updateMetrics([],d.generatedAt);return;
      }
      items=d.companies||[];renderCompanies(items,true);
    }
    updateMetrics(items,d.generatedAt);
    q("#status").textContent=`Live · ${items.length} ${view}`;
    return d;
  }catch(e){
    if(e.name==="AbortError")return;
    q("#error").hidden=false;q("#error").textContent=`${e.message} Please retry shortly.`;
    q("#list").innerHTML='<div class="empty">No results can be displayed until the service responds.</div>';
  }finally{
    if(!refreshing)q("#refresh").disabled=false;
  }
}

async function apiJson(endpoint,options){
  const r=await fetch(endpoint,options);
  const text=await r.text();
  if(!text.trim())throw new Error(`Empty API response from ${endpoint}`);
  let d;
  try{d=JSON.parse(text);}catch{throw new Error(`Invalid JSON from API. Status ${r.status}`);}
  if(!r.ok)throw new Error(d.error||`Request failed with status ${r.status}`);
  return d;
}

function updateMetrics(items,generatedAt){
  q("#count").textContent=items.length;
  q("#multi").textContent=(view==="companies"||view==="archive")?items.filter(x=>x.signalCount>=2).length:"—";
  const domains=view==="events"?new Set(items.map(x=>x.domain)):new Set((items||[]).flatMap(x=>(x.timeline||[]).map(t=>t.domain)));
  q("#sources").textContent=domains.size;
  q("#updated").textContent=new Date(generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}

function renderCompanies(items,archived){
  if(!items.length){q("#list").innerHTML='<div class="empty">No companies matched these filters.</div>';return;}
  q("#list").innerHTML=items.map(c=>`
  <article class="company-card">
    <div class="company-head">
      <div class="score">${c.score}<span>${archived?"ARCHIVED SCORE":"COMPANY SCORE"}</span></div>
      <div><h2>${esc(c.company)}</h2><div class="meta">${c.eventCount} events · ${c.signalCount} signal types · ${c.sourceCount} source domains${archived?` · first seen ${date(c.firstSeenAt)}`:""}</div>
      <div class="chips">${(c.signals||[]).map(s=>`<span class="chip">${esc(label(s))}</span>`).join("")}${(c.countries||[]).map(x=>`<span class="chip">${esc(x)}</span>`).join("")}</div>
      <div class="reason">${(c.reasons||[]).map(r=>`<div>• ${esc(r)}</div>`).join("")}</div></div>
      <div><span class="confidence">${esc(c.confidence)} confidence</span><div class="company-action"><b>Suggested action</b><br>${esc(c.suggestedAction||"Review and verify.")}</div>
      <div class="feedback"><button onclick="feedback('company','${attr(c.id)}','useful')">Useful</button><button onclick="feedback('company','${attr(c.id)}','review')">Review</button><button onclick="feedback('company','${attr(c.id)}','dismiss')">Dismiss</button></div></div>
    </div>
    ${(c.timeline||[]).length?`<div class="timeline">${(archived?(c.timeline||[]).slice(0,5):(c.timeline||[])).map(t=>`
      <div class="timeline-row"><time>${date(t.publishedAt)}</time><span class="chip">${esc(t.signalLabel)}</span><a href="${attr(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>${relatedCompanies(t,c.company)}<span class="domain">${esc(t.domain)}</span></div>`).join("")}${archived?`<div class="archive-source-note">Showing the latest ${(c.timeline||[]).slice(0,5).length} archived source${(c.timeline||[]).slice(0,5).length===1?"":"s"}.</div>`:""}</div>`:""}
  </article>`).join("");
}

function renderEvents(items){
  if(!items.length){q("#list").innerHTML='<div class="empty">No events matched these filters.</div>';return;}
  q("#list").innerHTML=items.map(x=>`
  <article class="event-card"><div class="score">${x.score}<span>EVENT SCORE</span></div>
  <div><h2>${esc(x.title)}</h2><div class="meta">${esc(companyNames(x))} · ${esc(x.country)} · ${date(x.publishedAt)}</div>
  <div class="chips"><span class="chip">${esc(x.signalLabel)}</span><span class="chip">${esc(x.domain)}</span></div>
  <div class="source-box"><div><b>Source:</b> ${esc(x.provider||"Public source")}</div><div><b>Published:</b> ${date(x.publishedAt)}</div>${secEvidence(x)}</div>
  <div class="reason">${(x.reasons||[]).map(r=>`<div>• ${esc(r)}</div>`).join("")}</div></div>
  <div><span class="confidence">${esc(x.confidence)} confidence</span><a class="open" href="${attr(x.url)}" target="_blank" rel="noopener">Open source ↗</a>
  <div class="feedback"><button onclick="feedback('event','${attr(x.id)}','useful')">Useful</button><button onclick="feedback('event','${attr(x.id)}','dismiss')">Dismiss</button></div></div></article>`).join("");
}

function secEvidence(x){
  if(x.provider!=="SEC EDGAR")return "";
  const terms=(x.secMatchedTerms||[]).slice(0,6);
  return `<div class="sec-evidence">
    <div><b>SEC form:</b> ${esc(x.secForm||"Unavailable")}</div>
    <div><b>Relevance:</b> ${esc(x.secRelevanceScore??"Unavailable")}</div>
    ${terms.length?`<div><b>Matched terms:</b> ${terms.map(esc).join(", ")}</div>`:""}
    ${x.secEvidenceSnippet?`<div><b>Evidence:</b> “${esc(x.secEvidenceSnippet)}”</div>`:""}
  </div>`;
}

async function feedback(targetType,targetId,rating){
  try{
    const r=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetType,targetId,rating})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Feedback failed");
    q("#status").textContent=d.stored?"Feedback saved":"Feedback requires D1";
  }catch(e){q("#status").textContent=e.message;}
}

function companyNames(event){
  const companies=Array.isArray(event?.companies)&&event.companies.length
    ? event.companies
    : event?.company?[event.company]:[];
  return companies.length?companies.join(" · "):"Company undetected";
}

function relatedCompanies(event,currentCompany){
  const companies=Array.isArray(event?.companies)?event.companies:[];
  const related=companies.filter(name=>String(name).toLowerCase()!==String(currentCompany||"").toLowerCase());
  return related.length?`<span class="related-companies">Also: ${related.map(esc).join(", ")}</span>`:"";
}

function label(s){return({expansion:"Factory expansion",procurement:"Procurement activity",product:"Product launch",supply:"Supply-chain change"})[s]||s;}
function date(v){const d=new Date(v);return Number.isNaN(d.getTime())?"Date unavailable":d.toLocaleString();}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function attr(v){return esc(v);}
load();
