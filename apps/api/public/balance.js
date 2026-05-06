(function () {
  // Token is the last path segment of /balance/<token>
  var match = location.pathname.match(/\/balance\/([^/?#]+)/);
  var token = match && match[1];
  if (!token) { showError("Missing token"); return; }

  fetch("/api/v1/balance/" + encodeURIComponent(token), { headers: { accept: "application/json" } })
    .then(function (r) {
      if (!r.ok) {
        return r.json().then(function (j) { throw new Error(j.error || ("HTTP " + r.status)); });
      }
      return r.json();
    })
    .then(render)
    .catch(function (err) { showError(err.message || "Could not load balance"); });

  function showError(msg) {
    var loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    var c = document.getElementById("errorCard");
    c.style.display = "block";
    document.getElementById("errorMsg").textContent = msg;
  }

  function render(data) {
    var brand = data.brand || {};
    if (brand.primary_color) document.documentElement.style.setProperty("--primary", brand.primary_color);
    if (brand.accent_color)  document.documentElement.style.setProperty("--accent",  brand.accent_color);

    document.title = (brand.brand_name || "RFID Loyalty") + " — Balance";
    document.getElementById("brand").textContent     = brand.brand_name || "RFID Loyalty";
    document.getElementById("footBrand").textContent = brand.brand_name || "RFID Loyalty";

    if (brand.logo_url) {
      var glyph = document.getElementById("glyph");
      var img = document.createElement("img");
      img.src = brand.logo_url;
      img.alt = "";
      img.width = 36; img.height = 36;
      img.style.borderRadius = "8px";
      img.style.background = "rgba(255,255,255,.15)";
      glyph.replaceWith(img);
    }

    var m = data.member || {};
    document.getElementById("greet").textContent = "Hi, " + (m.first_name || "there") + "!";
    document.getElementById("memberNo").textContent = m.member_no || "";

    var st = document.getElementById("memberStatus");
    if (m.status && m.status !== "active") {
      st.innerHTML = ' · <span class="badge badge-' + escapeAttr(m.status) + '">' + escapeText(m.status) + '</span>';
    }

    var balances = data.balances || [];
    var box = document.getElementById("balances");
    if (!balances.length) {
      box.innerHTML = '<div class="empty">No stamps yet. Tap your card on a branch terminal to start collecting.</div>';
    } else {
      balances.forEach(function (b) {
        var el = document.createElement("div");
        el.className = "bal";
        var label = b.service_line_name || b.service_line;
        el.innerHTML =
          '<div>' +
            '<div class="name">' + escapeText(label) + '</div>' +
            '<div class="sub">' + escapeText(String(b.stamps_earned)) + ' earned · ' +
                                   escapeText(String(b.stamps_spent)) + ' spent</div>' +
          '</div>' +
          '<div class="val">' + escapeText(String(b.stamps_balance)) + '</div>';
        box.appendChild(el);
      });
    }

    var when = new Date(data.generated_at || Date.now());
    document.getElementById("updated").textContent = "Balance as of " + when.toLocaleString();
    document.getElementById("footStamp").textContent = when.toLocaleString();

    var loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    document.getElementById("card").style.display = "block";
  }

  function escapeText(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escapeAttr(s) { return escapeText(s).replace(/\s+/g, "-"); }
})();
