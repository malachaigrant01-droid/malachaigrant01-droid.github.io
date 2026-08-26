// Page behaviour for the ABiZmuth hub.
//
// This lives in a file rather than inline in index.html so the site can ship a
// Content-Security-Policy without 'unsafe-inline'. An inline <script> forces
// either unsafe-inline — which defeats most of what a CSP is for — or per-block
// hashes that must be recomputed on every edit and silently break the page when
// someone forgets. An external file needs neither.
//
// Configuration lives at the top of each section. Both features stay inert
// until configured: an unset value renders nothing rather than a dead control.

// The button is inert until a real link replaces the placeholder. A payment
// control that looks live but is not is worse than no control at all — a
// payer who clicks it and lands nowhere assumes they have already paid.
(function () {
  var LINK = "STRIPE_PAYMENT_LINK";
  var a = document.getElementById("pay-link");
  var mode = document.getElementById("pay-mode");
  if (!/^https:\/\/(buy\.stripe\.com|[a-z0-9-]+\.stripe\.com)\//.test(LINK)) return;
  a.href = LINK;
  a.textContent = "Pay via Stripe";
  a.setAttribute("aria-disabled", "false");
  a.rel = "noopener";
  mode.textContent = "Stripe — live";
  mode.className = "pill on";
})();

// Handles only, not URLs — the template per platform is below, so a typo
// cannot turn into a link pointing somewhere unintended. An empty string
// means "not set" and renders nothing: a social row on a public site that
// links to a 404, or worse to someone else's account, is a real cost.
//
// Mastodon is the exception and takes a full https URL, because the
// instance is part of the identity and cannot be templated.
var SOCIALS = {
  github:    "malachaigrant01-droid",
  x:   "",
  linkedin:  "",
  instagram: "",
  youtube:   "",
  bluesky:   "",
  tiktok:    "",
  facebook:  "",
  threads:   "",
  substack:  "",
  medium:    "",
  mastodon:  ""
};

(function () {
  var TEMPLATES = {
    github:    ["GitHub",    "https://github.com/"],
    x:   ["X",   "https://x.com/"],
    linkedin:  ["LinkedIn",  "https://www.linkedin.com/in/"],
    instagram: ["Instagram", "https://instagram.com/"],
    youtube:   ["YouTube",   "https://youtube.com/@"],
    bluesky:   ["Bluesky",   "https://bsky.app/profile/"],
    tiktok:    ["TikTok",    "https://tiktok.com/@"],
    facebook:  ["Facebook",  "https://facebook.com/"],
    threads:   ["Threads",   "https://threads.net/@"],
    substack:  ["Substack",  "https://substack.com/@"],
    medium:    ["Medium",    "https://medium.com/@"]
  };
  var list = document.getElementById("socials");
  var empty = document.getElementById("socials-empty");
  var count = 0;

  Object.keys(SOCIALS).forEach(function (key) {
    var raw = (SOCIALS[key] || "").trim();
    if (!raw) return;
    var label, href;
    if (key === "mastodon") {
// Full URL required; reject anything that is not plain https.
if (!/^https:\/\/[a-z0-9.-]+\/@[A-Za-z0-9_]+\/?$/i.test(raw)) return;
label = "Mastodon";
href = raw;
    } else {
var t = TEMPLATES[key];
if (!t) return;
// A handle is a handle. Anything with a slash, scheme, or dot could
// redirect the link off-platform, so it is dropped rather than shown.
if (!/^[A-Za-z0-9_.-]{1,40}$/.test(raw) || raw.indexOf("..") !== -1) return;
label = t[0];
href = t[1] + encodeURIComponent(raw);
    }
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.href = href;
    a.rel = "me noopener";
    a.innerHTML = '<span class="site"></span>';
    a.firstChild.textContent = label;
    a.appendChild(document.createTextNode(raw));
    li.appendChild(a);
    list.appendChild(li);
    count += 1;
  });

  if (count) empty.classList.add("hidden");
})();
