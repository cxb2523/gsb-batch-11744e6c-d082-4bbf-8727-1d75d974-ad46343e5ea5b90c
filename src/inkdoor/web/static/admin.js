// inkdoor admin: small enhancements. Every page works without this file.
// The Content-Security-Policy forbids inline scripts and handlers, so behavior is attached here
// to elements marked with data attributes:
//   form[data-confirm]      asks before submitting (remove buttons) and marks the form's
//                           "confirmed" field, so the server does not ask again
//   form[data-test-target]  runs a link test in the background and shows the result in the
//                           element with that id; data-error is shown when the test cannot run
//   button[data-copy]       copies the text of the element with that id (shown only with JS)
//   [data-preview]          the home page's preview: with data-poll (after a save or Update now),
//                           asks /status.json every 3 s for a minute and shows the new screen
(function () {
  "use strict";

  var FRAGMENT_HEADER = "X-Inkdoor-Fragment";

  function confirmBeforeSubmit(form) {
    form.addEventListener("submit", function (event) {
      if (!window.confirm(form.getAttribute("data-confirm"))) {
        event.preventDefault();
        return;
      }
      var field = form.querySelector("input[name=confirmed]");
      if (field) {
        field.value = "1";
      }
    });
  }

  function showError(target, form) {
    var box = document.createElement("div");
    var line = document.createElement("p");
    box.className = "test-result";
    line.className = "result-line result-fail";
    line.textContent = form.getAttribute("data-error") || "";
    box.appendChild(line);
    target.textContent = "";  // not replaceChildren: missing in Safari before 14
    target.appendChild(box);
  }

  function testInBackground(form) {
    var target = document.getElementById(form.getAttribute("data-test-target"));
    if (!target || !window.fetch || !window.FormData) {
      return;  // the form posts normally and the page comes back with the result
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector("button[type=submit]");
      var label = button ? button.textContent : "";
      if (button) {
        button.disabled = true;
        button.textContent = button.getAttribute("data-busy-label") || label;
      }
      target.setAttribute("aria-busy", "true");

      function done() {
        target.removeAttribute("aria-busy");
        if (button) {
          button.disabled = false;
          button.textContent = label;
        }
      }

      function failed() {
        try {
          showError(target, form);
        } catch (ignored) {
          // the button must come back even if the message cannot be drawn
        }
      }

      var request;
      try {
        // the CSRF token and the digest travel in the form body, like a normal submit
        request = fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          credentials: "same-origin",
          headers: { "X-Requested-With": "inkdoor" }
        });
      } catch (error) {
        failed();
        done();
        return;
      }
      request.then(function (response) {
        return response.text().then(function (text) {
          // only a result fragment is shown; an error page (e.g. an expired session) is not
          if (response.headers.get(FRAGMENT_HEADER) === "1") {
            target.innerHTML = text;
          } else {
            failed();
          }
        });
      }).then(done, function () {
        failed();
        done();
      });
    });
  }

  function copyButton(button) {
    var source = document.getElementById(button.getAttribute("data-copy"));
    if (!source || !window.getSelection || !document.createRange) {
      return;
    }
    var label = button.textContent;
    var timer = null;

    function copied() {
      button.textContent = button.getAttribute("data-copied-label") || label;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        button.textContent = label;
      }, 2000);
    }

    function selectAndCopy() {
      // plain HTTP has no navigator.clipboard; the old command still works there
      var range = document.createRange();
      var selection = window.getSelection();
      range.selectNodeContents(source);
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        if (document.execCommand("copy")) {
          copied();
        }
      } catch (ignored) {
        // the text stays selected, ready for a manual copy
      }
    }

    button.addEventListener("click", function () {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(source.textContent).then(copied, selectAndCopy);
      } else {
        selectAndCopy();
      }
    });
    button.hidden = false;
  }

  var POLL_EVERY = 3000;
  var POLL_TIMES = 20;  // one minute

  function setStatus(name, text) {
    var element = document.querySelector("[data-status=" + name + "]");
    if (element) {
      element.textContent = text || "";
    }
    return element;
  }

  function showErrors(errors) {
    var box = document.querySelector("[data-status=errors]");
    var list = box ? box.querySelector("ul") : null;
    if (!list) {
      return;
    }
    list.textContent = "";
    (errors || []).forEach(function (source) {
      var item = document.createElement("li");
      item.textContent = source;
      list.appendChild(item);
    });
    box.hidden = !errors || errors.length === 0;
  }

  function pollPreview(frame) {
    if (!window.fetch || !window.JSON) {
      return;
    }
    if (!frame.hasAttribute("data-poll")) {
      return;
    }
    var at = frame.getAttribute("data-at");
    var left = POLL_TIMES;
    var timer = window.setInterval(check, POLL_EVERY);

    function stop() {
      window.clearInterval(timer);
    }

    function show(data) {
      var image = frame.querySelector("img");
      if (!image || !setStatus("word", data.word)) {
        window.location.reload();  // nothing drawn when the page loaded: load it whole
        return;
      }
      image.src = "/kindle.png?t=" + Date.now();
      setStatus("headline", data.headline);
      setStatus("updated", data.updated);
      showErrors(data.errors);
      frame.setAttribute("data-at", data.at);
    }

    function check() {
      left -= 1;
      if (left < 0) {
        stop();
        return;
      }
      fetch("/status.json", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (response) {
          var type = response.headers.get("Content-Type") || "";
          if (!response.ok || type.indexOf("application/json") !== 0) {
            stop();  // not a status (e.g. the session ended: the login page): asking again won't help
            return null;
          }
          return response.json();
        })
        .then(function (data) {
          if (data && data.at && data.at !== at) {
            at = data.at;
            stop();
            show(data);
          }
        })
        .catch(function () {
          // a network hiccup: keep asking until the minute is over
        });
    }
  }

  document.querySelectorAll("form[data-confirm]").forEach(confirmBeforeSubmit);
  document.querySelectorAll("form[data-test-target]").forEach(testInBackground);
  document.querySelectorAll("button[data-copy]").forEach(copyButton);
  document.querySelectorAll("[data-preview]").forEach(pollPreview);
})();
