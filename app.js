const config = window.MG2D_CONFIG;

const client = supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

let session = null;
let profile = null;
let monthOffset = 0;

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);

function localISO(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function calculateHours(start, end) {
  const startDate = new Date(`2000-01-01T${start}`);
  const endDate = new Date(`2000-01-01T${end}`);

  if (endDate <= startDate) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return (endDate - startDate) / 3600000;
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";

  const { data, error } = await client.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) {
    $("loginError").textContent = error.message;
    return;
  }

  session = data.session;

  try {
    await loadProfile();
    await openApplication();
  } catch (profileError) {
    $("loginError").textContent =
      "Connexion réussie, mais le profil MG2D est introuvable.";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await client.auth.signOut();
  location.reload();
});

$("prevMonth").addEventListener("click", async () => {
  monthOffset -= 1;
  await renderDashboard();
});

$("nextMonth").addEventListener("click", async () => {
  monthOffset += 1;
  await renderDashboard();
});

$("newLeaveBtn").addEventListener("click", () => {
  $("leaveStart").value = "";
  $("leaveEnd").value = "";
  $("leaveComment").value = "";
  $("leaveDialog").showModal();
});

$("leaveForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if ($("leaveEnd").value < $("leaveStart").value) {
    alert("La date de fin doit être après la date de début.");
    return;
  }

  const { error } = await client.from("leave_requests").insert({
    agent_id: profile.id,
    type: $("leaveType").value,
    start_date: $("leaveStart").value,
    end_date: $("leaveEnd").value,
    comment: $("leaveComment").value.trim(),
    status: "pending"
  });

  if (error) {
    alert(error.message);
    return;
  }

  $("leaveDialog").close();
  await renderLeaves();
  await renderDashboard();
});

async function loadProfile() {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("user_id", session.user.id)
    .single();

  if (error) {
    throw error;
  }

  profile = data;
}

async function openApplication() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("identityName").textContent = profile.full_name;
  $("identityRole").textContent =
    profile.role === "admin" ? "Administrateur" : "Agent";

  buildNavigation();
  showPage("dashboard", "Tableau de bord");

  await Promise.all([
    renderDashboard(),
    renderLeaves(),
    renderProfile()
  ]);
}

function buildNavigation() {
  const isAdmin = profile.role === "admin";

  $("nav").innerHTML = isAdmin
    ? `
      <button data-page="dashboard">📊 Tableau de bord</button>
      <button data-page="leaves">🌴 Demandes de congé</button>
      <button data-page="adminRequests">✅ Validations</button>
      <button data-page="profile">👤 Mon profil</button>
    `
    : `
      <button data-page="dashboard">📅 Mon planning</button>
      <button data-page="leaves">🌴 Mes congés</button>
      <button data-page="profile">👤 Mon profil</button>
    `;

  [...$("nav").children].forEach((button, index) => {
    if (index === 0) {
      button.classList.add("active");
    }

    button.addEventListener("click", async () => {
      [...$("nav").children].forEach((item) =>
        item.classList.remove("active")
      );

      button.classList.add("active");
      showPage(button.dataset.page, button.textContent.trim());

      if (button.dataset.page === "leaves") {
        await renderLeaves();
      }

      if (button.dataset.page === "adminRequests") {
        await renderAdminRequests();
      }
    });
  });
}

function showPage(pageId, title) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  $(pageId).classList.add("active");
  $("pageTitle").textContent = title;
}

async function fetchMonthlyShifts(startDate, endDate) {
  let query = client
    .from("shifts")
    .select("*, sites(name), profiles!shifts_agent_id_fkey(full_name)")
    .gte("shift_date", startDate)
    .lte("shift_date", endDate)
    .order("shift_date");

  if (profile.role !== "admin") {
    query = query.eq("agent_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function renderDashboard() {
  const month = new Date();
  month.setDate(1);
  month.setMonth(month.getMonth() + monthOffset);

  const startDate = localISO(month);
  const endDate = localISO(
    new Date(month.getFullYear(), month.getMonth() + 1, 0)
  );

  $("monthLabel").textContent = month.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });

  const shifts = await fetchMonthlyShifts(startDate, endDate);

  const totalHours = shifts.reduce(
    (total, shift) =>
      total + calculateHours(shift.start_time, shift.end_time),
    0
  );

  let pendingQuery = client
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (profile.role !== "admin") {
    pendingQuery = pendingQuery.eq("agent_id", profile.id);
  }

  const { count } = await pendingQuery;

  $("stats").innerHTML = `
    <div class="card">
      <small>Heures du mois</small>
      <b>${totalHours.toFixed(1)} h</b>
    </div>
    <div class="card">
      <small>Missions</small>
      <b>${shifts.length}</b>
    </div>
    <div class="card">
      <small>Congés en attente</small>
      <b>${count ?? 0}</b>
    </div>
    <div class="card">
      <small>Compte</small>
      <b>${profile.role === "admin" ? "Admin" : "Agent"}</b>
    </div>
  `;

  renderCalendar(month, shifts);
}

function renderCalendar(month, shifts) {
  const numberOfDays = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();

  const firstDayOffset = (month.getDay() + 6) % 7;
  let html = "";

  for (let emptyDay = 0; emptyDay < firstDayOffset; emptyDay += 1) {
    html += `<div class="day empty"></div>`;
  }

  for (let day = 1; day <= numberOfDays; day += 1) {
    const date = [
      month.getFullYear(),
      String(month.getMonth() + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");

    const dayShifts = shifts.filter(
      (shift) => shift.shift_date === date
    );

    html += `
      <div class="day">
        <div class="day-number">${String(day).padStart(2, "0")}</div>
        ${
          dayShifts.length
            ? dayShifts.map((shift) => `
                <div class="shift">
                  <b>${escapeHtml(shift.sites?.name || "Mission")}</b>
                  ${shift.start_time.slice(0, 5)}
                  –
                  ${shift.end_time.slice(0, 5)}
                  ${
                    profile.role === "admin"
                      ? `<br>${escapeHtml(
                          shift.profiles?.full_name || ""
                        )}`
                      : ""
                  }
                </div>
              `).join("")
            : `<span class="rest">Repos</span>`
        }
      </div>
    `;
  }

  $("calendar").innerHTML = html;
}

async function renderLeaves() {
  let query = client
    .from("leave_requests")
    .select("*, profiles!leave_requests_agent_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (profile.role !== "admin") {
    query = query.eq("agent_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    return;
  }

  $("leaveList").innerHTML = (data ?? []).map((request) => `
    <div class="item">
      <div>
        <b>
          ${escapeHtml(
            request.profiles?.full_name || profile.full_name
          )}
          — ${escapeHtml(request.type)}
        </b>
        <br>
        <small>
          Du ${request.start_date.split("-").reverse().join("/")}
          au ${request.end_date.split("-").reverse().join("/")}
        </small>
      </div>
      <span class="badge ${request.status}">
        ${
          request.status === "pending"
            ? "En attente"
            : request.status === "approved"
              ? "Acceptée"
              : "Refusée"
        }
      </span>
    </div>
  `).join("") || "<p>Aucune demande.</p>";
}

async function renderAdminRequests() {
  const { data, error } = await client
    .from("leave_requests")
    .select("*, profiles!leave_requests_agent_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (error) {
    return;
  }

  $("adminLeaveList").innerHTML = (data ?? []).map((request) => `
    <div class="item">
      <div>
        <b>
          ${escapeHtml(request.profiles?.full_name || "Agent")}
          — ${escapeHtml(request.type)}
        </b>
        <br>
        <small>
          ${request.start_date} → ${request.end_date}
        </small>
      </div>
      ${
        request.status === "pending"
          ? `
            <div>
              <button onclick="decideLeave(
                '${request.id}',
                'approved'
              )">Accepter</button>
              <button onclick="decideLeave(
                '${request.id}',
                'rejected'
              )">Refuser</button>
            </div>
          `
          : `<span class="badge ${request.status}">
              ${request.status}
            </span>`
      }
    </div>
  `).join("") || "<p>Aucune demande.</p>";
}

window.decideLeave = async (requestId, status) => {
  const adminComment =
    prompt("Commentaire facultatif :", "") || "";

  const { error } = await client
    .from("leave_requests")
    .update({
      status,
      admin_comment: adminComment,
      decided_at: new Date().toISOString(),
      decided_by: profile.id
    })
    .eq("id", requestId);

  if (error) {
    alert(error.message);
    return;
  }

  await renderAdminRequests();
  await renderLeaves();
  await renderDashboard();
};

function renderProfile() {
  $("profileContent").innerHTML = `
    <p><b>Nom :</b> ${escapeHtml(profile.full_name)}</p>
    <p><b>Email :</b> ${escapeHtml(session.user.email)}</p>
    <p><b>Rôle :</b> ${escapeHtml(profile.role)}</p>
    <p>
      <b>Téléphone :</b>
      ${escapeHtml(profile.phone || "Non renseigné")}
    </p>
    <p>
      <b>Carte professionnelle :</b>
      ${escapeHtml(profile.card_number || "Non renseignée")}
    </p>
  `;
}

(async () => {
  const { data } = await client.auth.getSession();

  if (data.session) {
    session = data.session;

    try {
      await loadProfile();
      await openApplication();
    } catch (sessionError) {
      $("loginError").textContent =
        "Profil utilisateur introuvable.";
    }
  }
})();
