const c=supabase.createClient(MG2D_CONFIG.supabaseUrl,MG2D_CONFIG.supabaseAnonKey);
let session,profile,agents=[],sites=[],shifts=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]));

const FR_HOLIDAYS_2026 = new Set([
"2026-01-01","2026-04-06","2026-05-01","2026-05-08","2026-05-14","2026-05-25",
"2026-07-14","2026-08-15","2026-11-01","2026-11-11","2026-12-25"
]);

function localDate(dateStr){ return new Date(dateStr+"T12:00:00"); }
function isSunday(dateStr){ return localDate(dateStr).getDay()===0; }
function isHoliday(dateStr){ return FR_HOLIDAYS_2026.has(dateStr); }

function minutes(t){
  const [h,m]=t.slice(0,5).split(":").map(Number);
  return h*60+m;
}
function splitHours(start,end){
  let s=minutes(start), e=minutes(end);
  if(e<=s)e+=1440;
  let day=0,night=0;
  for(let m=s;m<e;m++){
    const mm=m%1440;
    const isNight = mm>=21*60 || mm<6*60;
    if(isNight) night++; else day++;
  }
  return {day:day/60,night:night/60,total:(e-s)/60};
}
function classForShift(s){
  if(isHoliday(s.shift_date)) return "holiday";
  if(isSunday(s.shift_date)) return "sunday";
  const parts=splitHours(s.start_time,s.end_time);
  return parts.night>0 && parts.day===0 ? "night" : "daytime";
}
function summaryForShift(s){
  const p=splitHours(s.start_time,s.end_time);
  return {
    ...p,
    sunday:isSunday(s.shift_date)?p.total:0,
    holiday:isHoliday(s.shift_date)?p.total:0
  };
}

loginForm.onsubmit=async e=>{e.preventDefault();error.textContent="";let r=await c.auth.signInWithPassword({email:email.value,password:password.value});if(r.error)return error.textContent=r.error.message;session=r.data.session;await boot()};
logout.onclick=async()=>{await c.auth.signOut();location.reload()};
async function boot(){let r=await c.from("profiles").select("*").eq("user_id",session.user.id).single();if(r.error)return error.textContent="Profil introuvable";profile=r.data;login.classList.add("hidden");app.classList.remove("hidden");name.textContent=profile.full_name;role.textContent=profile.role;document.querySelectorAll(".admin").forEach(x=>x.classList.toggle("hidden",profile.role!=="admin"));leaveBtn.classList.toggle("hidden",profile.role==="admin");bindNav();await refresh()}
function bindNav(){document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));$(b.dataset.page).classList.add("active");title.textContent=b.textContent.trim()})}
async function refresh(){let [a,s,sh,l]=await Promise.all([c.from("profiles").select("*").eq("role","agent").order("full_name"),c.from("sites").select("*").order("name"),c.from("shifts").select("*,sites(name),profiles!shifts_agent_id_fkey(full_name)").order("shift_date"),c.from("leave_requests").select("*,profiles!leave_requests_agent_id_fkey(full_name)").order("created_at",{ascending:false})]);agents=a.data||[];sites=s.data||[];shifts=(sh.data||[]).filter(x=>profile.role==="admin"||x.agent_id===profile.id);renderAgents();renderSites();renderShifts();renderLeaves();renderDashboard()}

function renderDashboard(){
  let now=new Date(),m=now.getMonth(),y=now.getFullYear();
  let ms=shifts.filter(s=>{let d=localDate(s.shift_date);return d.getMonth()===m&&d.getFullYear()===y});
  let totals=ms.reduce((acc,s)=>{
    const x=summaryForShift(s);
    acc.total+=x.total;acc.day+=x.day;acc.night+=x.night;acc.sunday+=x.sunday;acc.holiday+=x.holiday;
    return acc;
  },{total:0,day:0,night:0,sunday:0,holiday:0});

  stats.innerHTML=`
    <div class="card"><small>Heures totales</small><b>${totals.total.toFixed(1)}h</b></div>
    <div class="card"><small>Heures jour</small><b>${totals.day.toFixed(1)}h</b></div>
    <div class="card night-card"><small>Heures nuit</small><b>${totals.night.toFixed(1)}h</b></div>
    <div class="card sunday-card"><small>Dimanche</small><b>${totals.sunday.toFixed(1)}h</b></div>
    <div class="card holiday-card"><small>Jours fÃ©riÃ©s</small><b>${totals.holiday.toFixed(1)}h</b></div>`;

  let first=new Date(y,m,1),n=new Date(y,m+1,0).getDate(),off=(first.getDay()+6)%7,h='<div class="legend"><span><i class="dot day-dot"></i> Jour</span><span><i class="dot night-dot"></i> Nuit</span><span><i class="dot sunday-dot"></i> Dimanche</span><span><i class="dot holiday-dot"></i> FÃ©riÃ©</span></div><div class="month-grid">';
  for(let i=0;i<off;i++)h+='<div></div>';
  for(let d=1;d<=n;d++){
    let date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,ss=ms.filter(x=>x.shift_date===date);
    let dayClass=isHoliday(date)?"holiday-day":isSunday(date)?"sunday-day":"";
    h+=`<div class="day ${dayClass}"><b>${d}</b>${ss.map(x=>{
      const sum=summaryForShift(x);
      return `<div class="mission ${classForShift(x)}">${esc(x.sites?.name)}<br>${x.start_time.slice(0,5)}-${x.end_time.slice(0,5)}${profile.role==="admin"?`<br>${esc(x.profiles?.full_name)}`:""}<div class="hours-mini">J ${sum.day.toFixed(1)}h Â· N ${sum.night.toFixed(1)}h</div></div>`;
    }).join("")}</div>`;
  }
  monthPlanning.innerHTML=h+"</div>";
}
function renderAgents(){agentsList.innerHTML=agents.map(a=>`<div class="item"><div><b>${esc(a.full_name)}</b><br><small>${esc(a.phone||"")} Â· ${esc((a.qualifications||[]).join(", "))}</small></div><button onclick="openAgent('${a.id}')">Modifier</button></div>`).join("")||"<p>Aucun agent.</p>"}
function renderSites(){sitesList.innerHTML=sites.map(s=>`<div class="item"><div><b>${esc(s.name)}</b><br><small>${esc(s.address||"")}</small></div><button onclick="openSite('${s.id}')">Modifier</button></div>`).join("")||"<p>Aucun site.</p>"}
function renderShifts(){shiftsList.innerHTML=shifts.map(s=>{const x=summaryForShift(s);return `<div class="item"><div><b>${s.shift_date} â€” ${esc(s.sites?.name)}</b><br><small>${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)} Â· ${esc(s.profiles?.full_name||profile.full_name)} Â· Jour ${x.day.toFixed(1)}h Â· Nuit ${x.night.toFixed(1)}h${x.sunday?` Â· Dimanche ${x.sunday.toFixed(1)}h`:""}${x.holiday?` Â· FÃ©riÃ© ${x.holiday.toFixed(1)}h`:""}</small></div>${profile.role==="admin"?`<button onclick="openShift('${s.id}')">Modifier</button>`:""}</div>`}).join("")||"<p>Aucune mission.</p>"}
function renderLeaves(){c.from("leave_requests").select("*,profiles!leave_requests_agent_id_fkey(full_name)").order("created_at",{ascending:false}).then(r=>{let rows=(r.data||[]).filter(x=>profile.role==="admin"||x.agent_id===profile.id);leavesList.innerHTML=rows.map(x=>`<div class="item leave ${x.status}"><div><b>${esc(x.profiles?.full_name||profile.full_name)} â€” ${esc(x.type)}</b><br><small>${x.start_date} â†’ ${x.end_date}</small></div><div>${x.status}${profile.role==="admin"&&x.status==="pending"?`<br><button onclick="decide('${x.id}','approved')">Accepter</button> <button onclick="decide('${x.id}','rejected')">Refuser</button>`:""}</div></div>`).join("")||"<p>Aucune demande.</p>"})}
window.openAgent=id=>{let a=agents.find(x=>x.id===id);agentId.value=a?.id||"";agentName.value=a?.full_name||"";agentPhone.value=a?.phone||"";agentCard.value=a?.card_number||"";agentExpiry.value=a?.card_expiry||"";agentQualifs.value=(a?.qualifications||[]).join(", ");agentDialog.showModal()}
agentForm.onsubmit=async e=>{e.preventDefault();let p={full_name:agentName.value,phone:agentPhone.value,card_number:agentCard.value,card_expiry:agentExpiry.value||null,qualifications:agentQualifs.value.split(",").map(x=>x.trim()).filter(Boolean)};if(!agentId.value)return alert("Pour crÃ©er un nouveau compte automatiquement, on branche l'invitation email Ã  l'Ã©tape suivante.");let r=await c.from("profiles").update(p).eq("id",agentId.value);if(r.error)return alert(r.error.message);agentDialog.close();await refresh()}
window.openSite=id=>{let s=sites.find(x=>x.id===id);siteId.value=s?.id||"";siteName.value=s?.name||"";siteAddress.value=s?.address||"";siteQualif.value=s?.required_qualification||"";siteNotes.value=s?.instructions||"";siteDialog.showModal()}
siteForm.onsubmit=async e=>{e.preventDefault();let p={name:siteName.value,address:siteAddress.value,required_qualification:siteQualif.value,instructions:siteNotes.value},r=siteId.value?await c.from("sites").update(p).eq("id",siteId.value):await c.from("sites").insert(p);if(r.error)return alert(r.error.message);siteDialog.close();await refresh()}
window.openShift=id=>{let s=shifts.find(x=>x.id===id);shiftId.value=s?.id||"";shiftAgent.innerHTML=agents.map(a=>`<option value="${a.id}">${esc(a.full_name)}</option>`).join("");shiftSite.innerHTML=sites.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");shiftAgent.value=s?.agent_id||agents[0]?.id||"";shiftSite.value=s?.site_id||sites[0]?.id||"";shiftDate.value=s?.shift_date||new Date().toISOString().slice(0,10);shiftStart.value=s?.start_time?.slice(0,5)||"18:00";shiftEnd.value=s?.end_time?.slice(0,5)||"00:00";shiftNote.value=s?.note||"";shiftDialog.showModal()}
shiftForm.onsubmit=async e=>{e.preventDefault();let p={agent_id:shiftAgent.value,site_id:shiftSite.value,shift_date:shiftDate.value,start_time:shiftStart.value,end_time:shiftEnd.value,note:shiftNote.value,created_by:profile.id},r=shiftId.value?await c.from("shifts").update(p).eq("id",shiftId.value):await c.from("shifts").insert(p);if(r.error)return alert(r.error.message);shiftDialog.close();await refresh()}
window.openLeave=()=>leaveDialog.showModal();leaveForm.onsubmit=async e=>{e.preventDefault();let r=await c.from("leave_requests").insert({agent_id:profile.id,type:leaveType.value,start_date:leaveStart.value,end_date:leaveEnd.value,comment:leaveComment.value,status:"pending"});if(r.error)return alert(r.error.message);leaveDialog.close();await refresh()}
window.decide=async(id,status)=>{let r=await c.from("leave_requests").update({status,decided_by:profile.id,decided_at:new Date().toISOString()}).eq("id",id);if(r.error)return alert(r.error.message);await refresh()}
(async()=>{let r=await c.auth.getSession();if(r.data.session){session=r.data.session;await boot()}})();
