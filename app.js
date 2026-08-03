const config=window.MG2D_CONFIG;
if(!config||!config.supabaseUrl||config.supabaseUrl.includes("TON-PROJET")){
  document.getElementById("setupWarning").classList.remove("hidden");
}
const client=config?.supabaseUrl&&!config.supabaseUrl.includes("TON-PROJET")
  ? supabase.createClient(config.supabaseUrl,config.supabaseAnonKey):null;

let session=null,profile=null,monthOffset=0;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hours=(s,e)=>{let a=new Date(`2000-01-01T${s}`),b=new Date(`2000-01-01T${e}`);if(b<=a)b.setDate(b.getDate()+1);return(b-a)/36e5};

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();$("loginError").textContent="";
  if(!client)return $("loginError").textContent="Supabase n’est pas encore configuré.";
  const {data,error}=await client.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error)return $("loginError").textContent=error.message;
  session=data.session;await loadProfile();openApp();
});
$("logoutBtn").onclick=async()=>{await client.auth.signOut();location.reload()};
$("prevMonth").onclick=()=>{monthOffset--;renderDashboard()};
$("nextMonth").onclick=()=>{monthOffset++;renderDashboard()};
$("newLeaveBtn").onclick=()=>$("leaveDialog").showModal();
$("leaveForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if($("leaveEnd").value<$("leaveStart").value)return alert("Dates invalides.");
  const {error}=await client.from("leave_requests").insert({
    agent_id:profile.id,type:$("leaveType").value,start_date:$("leaveStart").value,end_date:$("leaveEnd").value,
    comment:$("leaveComment").value,status:"pending"
  });
  if(error)return alert(error.message);
  $("leaveDialog").close();await renderLeaves();await renderDashboard();
});

async function loadProfile(){
  const {data,error}=await client.from("profiles").select("*").eq("user_id",session.user.id).single();
  if(error)throw error;profile=data;
}
function openApp(){
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("identityName").textContent=profile.full_name;$("identityRole").textContent=profile.role==="admin"?"Administrateur":"Agent";
  buildNav();showPage("dashboard","Tableau de bord");renderDashboard();renderLeaves();renderProfile();
}
function buildNav(){
  const admin=profile.role==="admin";
  $("nav").innerHTML=`
    <button data-page="dashboard">📊 Tableau de bord</button>
    <button data-page="dashboard">📅 Planning</button>
    <button data-page="leaves">🌴 ${admin?"Demandes":"Mes congés"}</button>
    ${admin?'<button data-page="adminRequests">✅ Validations</button>':''}
    <button data-page="profile">👤 Mon profil</button>`;
  [...$("nav").children].forEach((b,i)=>{if(i===0)b.classList.add("active");b.onclick=()=>{
    [...$("nav").children].forEach(x=>x.classList.remove("active"));b.classList.add("active");
    showPage(b.dataset.page,b.textContent.trim());
  }});
}
function showPage(id,title){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");$("pageTitle").textContent=title;
  if(id==="adminRequests")renderAdminRequests();
}
async function fetchShifts(start,end){
  let q=client.from("shifts").select("*, sites(name), profiles!shifts_agent_id_fkey(full_name)").gte("shift_date",start).lte("shift_date",end).order("shift_date");
  if(profile.role!=="admin")q=q.eq("agent_id",profile.id);
  const {data,error}=await q;if(error)throw error;return data;
}
async function renderDashboard(){
  const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+monthOffset);
  const start=localISO(d),end=localISO(new Date(d.getFullYear(),d.getMonth()+1,0));
  $("monthLabel").textContent=d.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  const shifts=await fetchShifts(start,end);
  const total=shifts.reduce((n,s)=>n+hours(s.start_time,s.end_time),0);
  const pending=(await client.from("leave_requests").select("id",{count:"exact",head:true}).eq("status","pending")[
    profile.role==="admin"?"neq":"eq"
  ]("agent_id",profile.role==="admin"?"00000000-0000-0000-0000-000000000000":profile.id)).count||0;
  $("stats").innerHTML=`
    <div class="card"><small>Heures</small><b>${total.toFixed(1)}h</b></div>
    <div class="card"><small>Missions</small><b>${shifts.length}</b></div>
    <div class="card"><small>Demandes en attente</small><b>${pending}</b></div>
    <div class="card"><small>Profil</small><b>${profile.role==="admin"?"Admin":"Agent"}</b></div>`;
  renderCalendar(d,shifts);
}
function renderCalendar(d,shifts){
  const n=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),offset=(d.getDay()+6)%7;let h="";
  for(let i=0;i<offset;i++)h+='<div class="day empty"></div>';
  for(let day=1;day<=n;day++){
    const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const ss=shifts.filter(s=>s.shift_date===date);
    h+=`<div class="day"><div class="day-number">${String(day).padStart(2,"0")}</div>${ss.length?ss.map(s=>`<div class="shift"><b>${esc(s.sites?.name||"Mission")}</b>${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}${profile.role==="admin"?`<br>${esc(s.profiles?.full_name||"")}`:""}</div>`).join(""):'<span class="rest">Repos</span>'}</div>`;
  }
  $("calendar").innerHTML=h;
}
async function renderLeaves(){
  let q=client.from("leave_requests").select("*, profiles!leave_requests_agent_id_fkey(full_name)").order("created_at",{ascending:false});
  if(profile.role!=="admin")q=q.eq("agent_id",profile.id);
  const {data,error}=await q;if(error)return;
  $("leaveList").innerHTML=data.map(leaveCard).join("")||"<p>Aucune demande.</p>";
}
function leaveCard(r){
  return `<div class="item"><div><b>${esc(r.profiles?.full_name||profile.full_name)} — ${esc(r.type)}</b><br><small>Du ${r.start_date.split("-").reverse().join("/")} au ${r.end_date.split("-").reverse().join("/")} · ${esc(r.comment||"")}</small></div><span class="badge ${r.status}">${r.status==="pending"?"En attente":r.status==="approved"?"Acceptée":"Refusée"}</span></div>`;
}
async function renderAdminRequests(){
  const {data,error}=await client.from("leave_requests").select("*, profiles!leave_requests_agent_id_fkey(full_name)").order("created_at",{ascending:false});
  if(error)return;
  $("adminLeaveList").innerHTML=data.map(r=>`<div class="item"><div><b>${esc(r.profiles?.full_name)} — ${esc(r.type)}</b><br><small>${r.start_date} → ${r.end_date} · ${esc(r.comment||"")}</small></div><div><span class="badge ${r.status}">${r.status}</span>${r.status==="pending"?`<br><button class="btn small" onclick="decide('${r.id}','approved')">Accepter</button> <button class="btn small" onclick="decide('${r.id}','rejected')">Refuser</button>`:""}</div></div>`).join("");
}
window.decide=async(id,status)=>{
  const admin_comment=prompt("Commentaire facultatif :","")||"";
  const {error}=await client.from("leave_requests").update({status,admin_comment,decided_at:new Date().toISOString(),decided_by:profile.id}).eq("id",id);
  if(error)return alert(error.message);renderAdminRequests();renderLeaves();renderDashboard();
};
function renderProfile(){
  $("profileContent").innerHTML=`<p><b>Nom :</b> ${esc(profile.full_name)}</p><p><b>Email :</b> ${esc(session.user.email)}</p><p><b>Rôle :</b> ${esc(profile.role)}</p><p><b>Téléphone :</b> ${esc(profile.phone||"Non renseigné")}</p><p><b>Carte professionnelle :</b> ${esc(profile.card_number||"Non renseignée")}</p>`;
}
(async()=>{
  if(!client)return;
  const {data}=await client.auth.getSession();
  if(data.session){session=data.session;try{await loadProfile();openApp()}catch(e){$("loginError").textContent="Profil utilisateur introuvable."}}
})();
