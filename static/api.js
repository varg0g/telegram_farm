function getCsrfToken() {
    var m = document.cookie.match(/(?:^|;\s*)tf_csrf=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    var csrf = getCsrfToken();
    if (csrf && !opts.headers["X-CSRF-Token"]) {
      opts.headers["X-CSRF-Token"] = csrf;
    }
    return fetch(url, opts);
  }