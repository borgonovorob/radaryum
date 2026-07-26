const q=s=>document.querySelector(s);
let view="companies",controller=null,forceNextRefresh=false,refreshing=false,authReady=false;

document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{
  view=btn.dataset.view;
  document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===btn));
  q("#signalWrap").hidden=view!=="events";
  q("#countLabel").textContent=view==="archive"?"archived companies":view;
  load();
}));

["country","window","minScore","signal"].forEach(id=>q(`#${id}`).addEventListener("change",load));

q("#refresh").addEventListener("click",async()=>{
  if(!signedIn()){openSignIn();return;}
  if(refreshing)return;

  refreshing=true;
  const button=q("#refresh");
  button.disabled=true;
  button.textContent="Starting refresh…";

  try{
    const before=await load(false);
    const baseline=snapshotMarker(before);

    forceNextRefresh=true;
    const requested=await load(false);

    if(requested?.refresh?.requested){
      button.textContent="Collecting signals…";
    }else{
      button.textContent="Refresh queued…";
    }

    // The collectors run in the Worker background and can legitimately take
    // longer than the browser should remain locked. Poll for at most 30 seconds.
    let changed=false;

    for(let attempt=0;attempt<6;attempt+=1){
      await sleep(5000);
      const current=await load(false);
      const marker=snapshotMarker(current);

      if(marker&&baseline&&marker!==baseline){
        changed=true;
        break;
      }

      button.textContent=`Collecting signals… ${(attempt+1)*5}s`;
    }

    button.textContent=changed
      ? "Updated"
      : "Refresh continues in background";

    await sleep(changed?1200:2200);
  }catch(error){
    console.error("Refresh failed",error);
    button.textContent="Refresh failed";
    await sleep(1800);
  }finally{
    refreshing=false;
    button.disabled=false;
    button.textContent="Refresh live";
  }
});

function snapshotMarker(payload){
  return payload?.snapshotId||
    payload?.snapshotCreatedAt||
    payload?.generatedAt||
    "";
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

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

async function apiJson(endpoint,options={}){
  const token=await authToken();
  if(!token)throw new Error("Sign in is required.");
  const headers=new Headers(options.headers||{});
  headers.set("authorization",`Bearer ${token}`);
  const r=await fetch(endpoint,{...options,headers});
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
    const token=await authToken(); if(!token)throw new Error("Sign in is required.");
    const r=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({targetType,targetId,rating})});
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

async function initializeAuthentication(){try{await waitForClerk();await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});authReady=true;q("#signInButton").onclick=openSignIn;q("#gateSignInButton").onclick=openSignIn;q("#signUpButton").onclick=openSignUp;q("#gateSignUpButton").onclick=openSignUp;q("#startTrackingButton").onclick=()=>signedIn()?q("#opportunities")?.scrollIntoView({behavior:"smooth"}):openSignUp();window.Clerk.addListener(renderAuthentication);await renderAuthentication();}catch(e){console.error(e);q("#status").textContent="Authentication unavailable";}}
async function renderAuthentication(){const a=signedIn();q("#signInButton").hidden=a;q("#signUpButton").hidden=a;q("#userButton").hidden=!a;q("#authGate").hidden=a;q("#protectedControls").hidden=!a;q("#protectedResults").hidden=!a;if(a){if(!q("#userButton").dataset.mounted){window.Clerk.mountUserButton(q("#userButton"),{afterSignOutUrl:"/"});q("#userButton").dataset.mounted="true";}await load();}else q("#status").textContent="Sign in to access live intelligence";}
function signedIn(){return Boolean(authReady&&window.Clerk?.user&&window.Clerk?.session);}
async function authToken(){return signedIn()?window.Clerk.session.getToken():null;}
function openSignIn(){if(authReady)window.Clerk.openSignIn({redirectUrl:location.href,signUpUrl:location.href});}
function openSignUp(){if(authReady)window.Clerk.openSignUp({redirectUrl:location.href,signInUrl:location.href});}
function waitForClerk(){return new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{if(window.Clerk){clearInterval(timer);resolve();}else if(Date.now()-start>15000){clearInterval(timer);reject(new Error("ClerkJS did not load"));}},50);});}
initializeAuthentication();
