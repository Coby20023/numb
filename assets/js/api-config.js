/* Set this to the origin of the API service when the site and API are hosted separately. */
window.MOYENDA_API_BASE = "";
/* Optional server-only features (for example the AI guide) stay off on static-only hosts. */
window.MOYENDA_API_ENABLED = false;

(function () {
  "use strict";

  var base = String(window.MOYENDA_API_BASE || "").replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) {
    throw new Error("MOYENDA_API_BASE must be an absolute HTTP(S) URL.");
  }

  window.moyendaApiUrl = function (path) {
    if (typeof path !== "string" || path.charAt(0) !== "/") {
      throw new Error("API paths must start with '/'.");
    }
    return base + path;
  };
})();
