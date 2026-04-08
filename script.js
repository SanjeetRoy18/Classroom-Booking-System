const BASE = "http://localhost:3000";

// --- UI Utils ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-check-circle';
  toast.innerHTML = `<i class="fa-solid ${icon} toast-icon"></i><div><div style="font-weight: 600;">${type.charAt(0).toUpperCase() + type.slice(1)}</div><div style="font-size: 0.85rem; opacity:0.8;">${message}</div></div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'fadeOut 0.4s ease forwards'; setTimeout(() => toast.remove(), 400); }, 4000);
}

function updateClock() { document.getElementById('currentTime').textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
setInterval(updateClock, 1000); updateClock();

// --- Tab & Role Management ---
function showTab(tab) {
  const userId = document.getElementById("faculty").value; // Re-purposed as generic User ID
  const role = document.getElementById("userRole").value;

  if (tab !== 'login' && tab !== 'rooms' && tab !== 'timetable' && !userId) {
    showToast("Please authenticate first.", "warning");
    showTab('login'); return;
  }

  document.querySelectorAll(".nav-item").forEach(item => { item.classList.remove("active"); if (item.getAttribute("onclick").includes(tab)) item.classList.add("active"); });
  document.querySelectorAll(".view-panel").forEach(t => t.classList.add("hidden"));
  document.getElementById(tab)?.classList.remove("hidden");
  document.getElementById(tab)?.classList.add("active");

  if (tab === "rooms") loadRooms();
  if (tab === "timetable") loadTimetable();
  if (tab === "notifications") loadNotifications();
  if (tab === "admin-logs") loadAdminLogs();
  if (tab === "student-courses") loadStudentCourses();
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;
  if (!email || !password) return showToast("Enter email and password.", "warning");

  try {
    const res = await fetch(`${BASE}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (res.ok) {
      const user = await res.json();
      
      const rawId = user.USER_ID || user.user_id;
      const rawName = user.NAME || user.name || "User";
      const rawRole = user.ROLE || user.role || 'FACULTY';
      const roleNumStr = rawRole.toString().toUpperCase();
      
      document.getElementById("faculty").value = rawId; 
      document.getElementById("userRole").value = roleNumStr;
      
      // Update UI
      const profileSection = document.getElementById('currentUserProfile');
      if(profileSection) profileSection.classList.remove('hidden');
      
      const profileName = document.getElementById('profileName');
      if(profileName) profileName.textContent = rawName;
      
      const profileRole = document.getElementById('profileRole');
      if(profileRole) profileRole.textContent = roleNumStr + " SESSION";
      
      let icon = "fa-user";
      if(roleNumStr === 'ADMIN') icon = "fa-user-shield";
      if(roleNumStr === 'FACULTY') icon = "fa-user-tie";
      if(roleNumStr === 'STUDENT') icon = "fa-user-graduate";
      
      const profileIcon = document.getElementById('profileIcon');
      if(profileIcon) profileIcon.className = `fa-solid ${icon}`;

      // Reset Nav
      if(document.getElementById('nav-faculty')) document.getElementById('nav-faculty').classList.add('hidden');
      if(document.getElementById('nav-student')) document.getElementById('nav-student').classList.add('hidden');
      if(document.getElementById('nav-admin')) document.getElementById('nav-admin').classList.add('hidden');

      if(roleNumStr === 'FACULTY') { 
         if(document.getElementById('nav-faculty')) document.getElementById('nav-faculty').classList.remove('hidden'); 
         showTab('book'); 
      }
      else if(roleNumStr === 'STUDENT') { 
         if(document.getElementById('nav-student')) document.getElementById('nav-student').classList.remove('hidden'); 
         showTab('student-courses'); 
      }
      else if(roleNumStr === 'ADMIN') { 
         if(document.getElementById('nav-admin')) document.getElementById('nav-admin').classList.remove('hidden'); 
         showTab('admin-logs'); 
      } else {
         showTab('timetable');
      }

      showToast(`Welcome back, ${rawName}!`, "success");
      fetchNotifBadge(rawId);
    } else {
      showToast("Authentication Failed.", "error");
    }
  } catch (err) { showToast("Oracle Server disconnected.", "error"); }
}

// --- Modals ---
let pendingCancelId = null;
function cancelBooking(id) {
  const userId = document.getElementById("faculty").value;
  if(!userId) return showToast("Authentication Required.", "warning");
  pendingCancelId = id;
  document.getElementById('cancelModal').classList.remove('hidden');
}
function closeCancelModal() {
  pendingCancelId = null;
  document.getElementById('cancelReason').value = '';
  document.getElementById('cancelModal').classList.add('hidden');
}
async function confirmCancelBooking() {
  const reason = document.getElementById('cancelReason').value || "Self-cancelled";
  const userId = document.getElementById("faculty").value;
  if(!pendingCancelId) return;

  try {
    const res = await fetch(`${BASE}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: pendingCancelId, user_id: userId, reason })
    });
    const msg = await res.text();
    if(res.ok) {
      showToast("Booking Voided successfully.", "success");
      loadTimetable();
    } else showToast(msg, "error");
  } catch(e) { showToast("Error cancelling booking.", "error"); }
  closeCancelModal();
}

// --- Faculty Functions ---
async function loadCourses() {
  try {
    const res = await fetch(`${BASE}/courses`);
    const data = await res.json();
    const select = document.getElementById("courseSelect");
    select.innerHTML = '<option value="">-- No Course Context --</option>';
    data.forEach(c => select.innerHTML += `<option value="${c.COURSE_ID}">${c.COURSE_ID} - ${c.TITLE}</option>`);
  } catch (err) {}
}

async function bookRoom() {
  if(document.getElementById('userRole').value !== 'FACULTY') return showToast("Only Faculty can book rooms.","error");
  const data = {
    faculty_id: document.getElementById("faculty").value,
    room_id: document.getElementById("room").value,
    course_id: document.getElementById("courseSelect").value || null,
    date: document.getElementById("date").value,
    start: document.getElementById("start").value,
    end: document.getElementById("end").value,
    type_id: document.getElementById("bookingType").value,
    end_date: document.getElementById("endDate").value
  };
  if(!data.room_id || !data.date || !data.start || !data.end) return showToast("Fill all required fields.", "warning");
  if(data.type_id == 2 && !data.end_date) return showToast("Please define an End Date for recurring bookings.", "warning");

  try {
    const res = await fetch(`${BASE}/book`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { showToast("Reservation Confirmed!", "success"); } else showToast(await res.text(), "error");
  } catch(e) { showToast("Server error.", "error"); }
}

function toggleRecurring() { document.getElementById("recurringOptions").classList.toggle("hidden", document.getElementById("bookingType").value !== "2"); }
function selectRoom(id) { document.getElementById("room").value = id; showTab('book'); }

// --- Global Queries ---
async function loadRooms() {
  try {
    const res = await fetch(`${BASE}/rooms`);
    const data = await res.json();
    const list = document.getElementById("roomList"); list.innerHTML = "";
    data.forEach(r => {
      list.innerHTML += `
        <div class="room-card">
          <div class="room-header"><h4 class="room-number">Room ${r.ROOM_NUMBER}</h4><span class="room-id-tag">ID: ${r.ROOM_ID}</span></div>
          <p><i class="fa-solid fa-map-pin" style="color:var(--primary); margin-right:8px;"></i> ${r.BUILDING}</p>
          <p><i class="fa-solid fa-users" style="color:var(--primary); margin-right:8px;"></i> Cap: ${r.CAPACITY}</p>
          <button class="btn btn-secondary btn-block mt-4" onclick="selectRoom(${r.ROOM_ID})">Select Room</button>
        </div>`;
    });
  } catch (e) {}
}

async function loadTimetable() {
  try {
    // If student, fetch filtered timetable
    const role = document.getElementById("userRole").value;
    const userId = document.getElementById("faculty").value;
    const timestamp = new Date().getTime(); // Cache busting
    let url = `${BASE}/timetable?t=${timestamp}`;
    if(role === 'STUDENT') url = `${BASE}/student/timetable/${userId}?t=${timestamp}`;
    
    const res = await fetch(url);
    if(!res.ok) {
       let errorMsg = await res.text();
       try { const json = JSON.parse(errorMsg); errorMsg = json.error || errorMsg; } catch(e) {}
       console.error("Timetable Fetch Error:", errorMsg);
       showToast("Sync Error: " + errorMsg.substring(0, 50), "error"); 
       return;
    }
    const data = await res.json();
    const tbody = document.getElementById("tableBody"); tbody.innerHTML = "";
    if(data.length === 0) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--text-muted)">No active bookings found.</td></tr>`;
    
    data.forEach(d => {
      tbody.innerHTML += `
        <tr>
          <td>#${d.BOOKING_ID}</td>
          <td style="color:#fff;">${d.NAME}</td>
          <td>${d.COURSE_ID || '-'}</td>
          <td><i class="fa-solid fa-door-open" style="margin-right:6px;color:var(--text-muted)"></i>${d.ROOM_NUMBER}</td>
          <td>${new Date(d.BOOKING_DATE).toLocaleDateString()}</td>
          <td><span style="background:rgba(59,130,246,0.1); padding:4px 8px; border-radius:4px;">${d.START_TIME}</span></td>
          <td><span style="background:rgba(239,68,68,0.1); padding:4px 8px; border-radius:4px;">${d.END_TIME}</span></td>
          <td>${d.TYPE_NAME || 'One-time'}</td>
          <td><button class="btn btn-danger btn-sm" onclick="cancelBooking(${d.BOOKING_ID})">Void</button></td>
        </tr>`;
    });
  } catch(e) {
    console.error("Timetable Sync Error:", e);
    showToast("Network Error during Timetable Sync.", "error");
  }
}

// --- Notifications ---
async function fetchNotifBadge(userId) {
  try {
    const res = await fetch(`${BASE}/notifications/${userId}`);
    const data = await res.json();
    const count = data.filter(n => n.IS_READ === 0).length;
    const badge = document.getElementById('notif-badge');
    if(count>0) { badge.textContent=count; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
  } catch(e) {}
}
async function loadNotifications() {
  const id=document.getElementById("faculty").value;
  if(!id) return document.getElementById("notif-auth-warning").classList.remove('hidden');
  document.getElementById("notif-auth-warning").classList.add('hidden');
  try {
    const res = await fetch(`${BASE}/notifications/${id}`);
    const data = await res.json();
    const list = document.getElementById("notifList"); list.innerHTML = "";
    data.forEach(n => {
      let icon = n.MESSAGE.includes('cancel') ? 'fa-triangle-exclamation' : 'fa-bell';
      list.innerHTML += `<div class="notif-card ${n.IS_READ?'':'unread'}"><div style="display:flex;gap:16px;align-items:center;"><div style="width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${icon}"></i></div><div><div>${n.MESSAGE}</div><div style="font-size:0.8rem;color:var(--text-muted)">${new Date(n.CREATED_AT).toLocaleString()}</div></div></div></div>`;
    });
  } catch(e) {}
}

// --- Student Functions ---
async function loadStudentCourses() {
  const userId = document.getElementById("faculty").value;
  try {
    const res = await fetch(`${BASE}/student/courses/${userId}`);
    const data = await res.json();
    
    // Split data into enrolled vs valid
    const enrolled = data.filter(c => c.IS_ENROLLED);
    const unenrolled = data.filter(c => !c.IS_ENROLLED);

    const tbody = document.getElementById("enrollmentBody"); tbody.innerHTML = "";
    enrolled.forEach(c => tbody.innerHTML += `<tr><td>${c.COURSE_ID}</td><td style="color:#fff">${c.TITLE}</td><td>Dept ${c.DEPT_ID}</td><td>${c.CREDITS}</td></tr>`);

    const clist = document.getElementById("courseList"); clist.innerHTML = "";
    unenrolled.forEach(c => clist.innerHTML += `
      <div class="room-card">
        <h4 style="font-size:1.2rem; color:#fff; margin-bottom:12px;">${c.TITLE}</h4>
        <p style="color:var(--text-muted);"><i class="fa-solid fa-tag"></i> ${c.COURSE_ID}</p>
        <p style="color:var(--text-muted);"><i class="fa-solid fa-coins"></i> ${c.CREDITS} Credits</p>
        <button class="btn btn-primary btn-block mt-4" onclick="enrollCourse('${c.COURSE_ID}')">Enroll Now</button>
      </div>
    `);
  } catch(e) {}
}
async function enrollCourse(course_id) {
  const student_id = document.getElementById("faculty").value;
  try {
    const res=await fetch(`${BASE}/student/enroll`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({student_id, course_id, semester_id:1})});
    const msg = await res.text();
    if(res.ok) { showToast("Enrolled Successfully!", "success"); loadStudentCourses(); }
    else showToast(msg, "error");
  } catch(e) {}
}

// --- Admin Functions ---
async function loadAdminLogs() {
  try {
    const sRes = await fetch(`${BASE}/admin/stats`);
    const stats = await sRes.json();
    document.getElementById('statTotalBookings').textContent = stats.TOTAL_BOOKINGS || 0;
    document.getElementById('statCancellations').textContent = stats.TOTAL_CANCELLATIONS || 0;
    document.getElementById('statRooms').textContent = stats.TOTAL_ROOMS || 0;

    const lRes = await fetch(`${BASE}/admin/logs`);
    const logs = await lRes.json();
    const tbody = document.getElementById("adminTableBody"); tbody.innerHTML = "";
    if(logs.length === 0) tbody.innerHTML = '<tr><td colspan="5" class="text-center">No Audit Logs Available</td></tr>';
    logs.forEach(l => {
      tbody.innerHTML += `<tr>
        <td style="font-family:monospace; color:var(--text-muted)">ACT-${l.ID}</td>
        <td>#${l.BOOKING_ID}</td>
        <td style="color:#fff">${l.ACTOR_NAME || 'Unknown'}</td>
        <td>${l.DETAIL}</td>
        <td>${new Date(l.LOG_DATE).toLocaleString()}</td>
      </tr>`;
    });
    
    // Load courses stats table
    const cRes = await fetch(`${BASE}/admin/courses-stats`);
    const courses = await cRes.json();
    const ctbody = document.getElementById("adminCourseBody"); 
    if(ctbody) {
      ctbody.innerHTML = "";
      courses.forEach(c => {
         ctbody.innerHTML += `<tr>
           <td style="color:#fff">${c.TITLE} <span style="font-size:0.7rem; color:var(--text-muted)">(${c.COURSE_ID})</span></td>
           <td>${c.FACULTY_NAMES || '<span style="color:var(--warning)">Unscheduled</span>'}</td>
           <td><i class="fa-solid fa-users text-primary p-mr-2"></i>${c.STUDENT_COUNT} Enrolled</td>
           <td>${c.ROOM_NUMBERS || '-'}</td>
         </tr>`;
      });
    }
  } catch(e) {
    console.error("Admin Load Error:", e);
    showToast("Error loading Admin Dashboard.", "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
   loadCourses();
   const today = new Date().toISOString().split('T')[0];
   document.getElementById('date').min = today; document.getElementById('endDate').min = today;
});