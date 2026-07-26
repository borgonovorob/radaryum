const q=s=>document.querySelector(s);
let view="companies",controller=null;

document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{
  view=btn.dataset.view;
  document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===btn));
  q("#signalWrap").hidden=view!=="events";
  q("#countLabel").textContent=view==="archive"?"archived companies":view;
  load();
}));

["country","window","minScore","signal"].forEach(id=>q(`#${id}`).addEventListener("change",load));
q("#refresh").addEventListener("click",load);

async function load(){
  controller?.abort();controller=new AbortController();
  q("#refresh").disabled=true;q("#error").hidden=true;
  q("#status").textContent=view==="archive"?"Reading persistent archive":"Correlating current public sources";
  q("#list").innerHTML=`<div class="loading">${view==="archive"?"Reading accumulated opportunity history…":"Correlating current industrial signals…"}</div>`;

  const p=new URLSearchParams({minScore:q("#minScore").value});
  if(q("#country").value)p.set("country",q("#country").value);

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
    const r=await fetch(endpoint,{cache:"no-store",signal:controller.signal});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");

    let items;
    if(view==="companies"){
      items=d.companies||[];renderCompanies(items,false);
    }else if(view==="events"){
      items=d.events||[];renderEvents(items,false);
    }else{
      if(!d.configured){
        q("#list").innerHTML='<div class="empty">The D1 archive is not connected yet. Create and bind a D1 database named DB in Cloudflare.</div>';
        updateMetrics([],d.generatedAt);
        return;
      }
      items=d.companies||[];renderCompanies(items,true);
    }

    updateMetrics(items,d.generatedAt);
    q("#status").textContent=`Live · ${items.length} ${view}`;
  }catch(e){
    if(e.name==="AbortError")return;
    q("#error").hidden=false;q("#error").textContent=`${e.message} Please retry shortly.`;
    q("#list").innerHTML='<div class="empty">No results can be displayed until the service responds.</div>';
  }finally{q("#refresh").disabled=false;}
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
      <div>
        <h2>${esc(c.company)}</h2>
        <div class="meta">${c.eventCount} events · ${c.signalCount} signal types · ${c.sourceCount} source domains${archived?` · first seen ${date(c.firstSeenAt)}`:""}</div>
        <div class="chips">${(c.signals||[]).map(s=>`<span class="chip">${esc(label(s))}</span>`).join("")}${(c.countries||[]).map(x=>`<span class="chip">${esc(x)}</span>`).join("")}</div>
        <div class="reason">${(c.reasons||[]).map(r=>`<div>• ${esc(r)}</div>`).join("")}</div>
        ${companySourceSummary(c)}
      </div>
      <div>
        <span class="confidence">${esc(c.confidence)} confidence</span>
        <div class="company-action"><b>Suggested action</b><br>${esc(c.suggestedAction||"Review and verify.")}</div>
        ${primarySourceButton(c)}
        <div class="feedback"><button onclick="feedback('company','${attr(c.id)}','useful')">Useful</button><button onclick="feedback('company','${attr(c.id)}','review')">Review</button><button onclick="feedback('company','${attr(c.id)}','dismiss')">Dismiss</button></div>
      </div>
    </div>
    ${companyTimeline(c)}
  </article>`).join("");
}

function renderEvents(items,archived){
  if(!items.length){q("#list").innerHTML='<div class="empty">No events matched these filters.</div>';return;}
  q("#list").innerHTML=items.map(x=>`
  <article class="event-card"><div class="score">${x.score}<span>EVENT SCORE</span></div>
  <div><h2>${esc(x.title)}</h2><div class="meta">${esc(x.company||"Company undetected")} · ${esc(x.country)} · ${date(x.publishedAt)}</div>
  <div class="chips"><span class="chip">${esc(x.signalLabel)}</span><span class="chip">${esc(x.domain)}</span></div>
  <div class="source-box">
    <div><b>Source:</b> ${esc(x.provider||"GDELT DOC 2.0")}</div>
    <div><b>Published:</b> ${date(x.publishedAt)}</div>
    <div><b>Domain:</b> ${esc(x.domain||"Source unavailable")}</div>
  </div>
  <div class="reason">${(x.reasons||[]).map(r=>`<div>• ${esc(r)}</div>`).join("")}</div></div>
  <div><span class="confidence">${esc(x.confidence)} confidence</span><a class="open" href="${attr(x.url)}" target="_blank" rel="noopener">Open source ↗</a>
  <div class="feedback"><button onclick="feedback('event','${attr(x.id)}','useful')">Useful</button><button onclick="feedback('event','${attr(x.id)}','dismiss')">Dismiss</button></div></div></article>`).join("");
}

function companySourceSummary(c){
  const timeline=c.timeline||[];
  if(!timeline.length){
    return `<div class="source-box"><b>Source:</b> Stored company signal<br><b>Original article:</b> not available in this archive response</div>`;
  }
  const first=timeline[0];
  return `<div class="source-box">
    <div><b>Source:</b> ${esc(first.provider||"GDELT DOC 2.0")}</div>
    <div><b>Published:</b> ${date(first.publishedAt)}</div>
    <div><b>Domain:</b> ${esc(first.domain||"Source unavailable")}</div>
  </div>`;
}

function primarySourceButton(c){
  const first=(c.timeline||[])[0];
  if(!first?.url)return "";
  return `<a class="open" href="${attr(first.url)}" target="_blank" rel="noopener">Open source ↗</a>`;
}

function companyTimeline(c){
  const timeline=c.timeline||[];
  if(!timeline.length){
    return `<div class="timeline"><div class="timeline-row"><span class="domain">No source timeline available in this response.</span></div></div>`;
  }
  return `<div class="timeline">${timeline.map(t=>`
    <div class="timeline-row">
      <time>${date(t.publishedAt)}</time>
      <span class="chip">${esc(t.signalLabel||label(t.signal))}</span>
      <a href="${attr(t.url)}" target="_blank" rel="noopener">${esc(t.title||"Open source")}</a>
      <span class="domain">${esc(t.domain||"")}</span>
    </div>`).join("")}</div>`;
}

async function feedback(targetType,targetId,rating){
  try{
    const r=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetType,targetId,rating})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Feedback failed");
    q("#status").textContent=d.stored?"Feedback saved":"Feedback requires D1";
  }catch(e){q("#status").textContent=e.message;}
}

function label(s){return({expansion:"Factory expansion",procurement:"Procurement activity",product:"Product launch",supply:"Supply-chain change"})[s]||s;}
function date(v){const d=new Date(v);return Number.isNaN(d.getTime())?"Date unavailable":d.toLocaleString();}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function attr(v){return esc(v);}
load();
