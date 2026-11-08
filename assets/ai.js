/* Optional AI helper shared by every app. Nothing is sent anywhere unless the visitor turns a provider on
   at /ai/. Providers:
   - "gemini": the visitor's own free Google AI Studio key, stored only in this browser (localStorage).
   - "local":  WebLLM runs a small model inside the browser (WebGPU, ~1 GB one-off download, fully private).
   Usage: B.ai.enabled() -> bool;  B.ai.ask(prompt, {system, json}) -> Promise<string>
          B.ai.button(container, label, getPrompt, onAnswer)  adds a button that is hidden when AI is off. */
(function (root) {
  'use strict';
  var B = root.B; if (!B) throw new Error('Load core.js before ai.js');
  var DEFAULTS = { provider: 'off', geminiKey: '', geminiModel: 'gemini-flash-lite-latest', localModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' };
  var WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2.87';
  var engine = null, enginePromise = null;

  function settings() { var s = B.store.get('ai', {}); var o = {}; Object.keys(DEFAULTS).forEach(function (k) { o[k] = s[k] != null ? s[k] : DEFAULTS[k]; }); return o; }
  function save(s) { B.store.set('ai', s); document.dispatchEvent(new CustomEvent('bh-ai-change')); }
  function enabled() { var s = settings(); return (s.provider === 'gemini' && !!s.geminiKey) || s.provider === 'local'; }

  function askGemini(s, prompt, opts) {
    var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: opts.temperature == null ? 0.4 : opts.temperature } };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.json) body.generationConfig.responseMimeType = 'application/json';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(s.geminiModel) + ':generateContent';
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('Gemini error ' + r.status)); return j; }); })
      .then(function (j) {
        var c = j.candidates && j.candidates[0]; var parts = (c && c.content && c.content.parts) || [];
        var text = parts.map(function (p) { return p.text || ''; }).join('');
        if (!text) throw new Error('The AI returned nothing (it may have blocked the request).'); return text;
      });
  }

  function loadLocal(s, onProgress) {
    if (engine) return Promise.resolve(engine);
    if (enginePromise) return enginePromise;
    if (!navigator.gpu) return Promise.reject(new Error('This browser has no WebGPU. Use Chrome or Edge on a recent computer, or use a Gemini key instead.'));
    enginePromise = import(WEBLLM).then(function (m) {
      return m.CreateMLCEngine(s.localModel, { initProgressCallback: function (p) { if (onProgress) onProgress(p.text || ''); } });
    }).then(function (e) { engine = e; return e; }, function (err) { enginePromise = null; throw err; });
    return enginePromise;
  }
  function askLocal(s, prompt, opts) {
    return loadLocal(s, opts.onProgress).then(function (e) {
      var msgs = []; if (opts.system) msgs.push({ role: 'system', content: opts.system }); msgs.push({ role: 'user', content: prompt });
      return e.chat.completions.create({ messages: msgs, temperature: opts.temperature == null ? 0.4 : opts.temperature });
    }).then(function (r) { return r.choices[0].message.content; });
  }

  function ask(prompt, opts) {
    opts = opts || {}; var s = settings();
    if (s.provider === 'gemini' && s.geminiKey) return askGemini(s, prompt, opts);
    if (s.provider === 'local') return askLocal(s, prompt, opts);
    return Promise.reject(new Error('AI helper is off. Turn it on in AI settings.'));
  }
  // Pull the first JSON object/array out of a model answer.
  function parseJSON(text) {
    try { return JSON.parse(text); } catch (e) {}
    var m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
    var a = text.indexOf('{'), b = text.indexOf('['), i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    if (i >= 0) { var end = text.lastIndexOf(text[i] === '{' ? '}' : ']'); try { return JSON.parse(text.slice(i, end + 1)); } catch (e) {} }
    return null;
  }

  // A button that only shows when AI is on; shows a status line under it.
  function button(container, label, getPrompt, onAnswer, opts) {
    opts = opts || {};
    var btn = B.h('button', { class: 'btn', type: 'button', text: '✨ ' + label });
    var status = B.h('span', { class: 'small muted' });
    var wrap = B.h('span', { class: 'row ai-only' }, [btn, status]);
    function sync() { wrap.style.display = enabled() ? '' : 'none'; }
    btn.addEventListener('click', function () {
      var p = getPrompt(); if (!p) return;
      btn.disabled = true; status.textContent = 'Thinking…';
      ask(p, Object.assign({ onProgress: function (t) { status.textContent = t; } }, opts)).then(function (ans) { status.textContent = ''; onAnswer(ans); },
        function (err) { status.textContent = err.message; }).then(function () { btn.disabled = false; });
    });
    document.addEventListener('bh-ai-change', sync); sync(); container.appendChild(wrap); return wrap;
  }
  // Small note to put on pages: "AI is off — turn it on" / "AI: Gemini"
  function note(container) {
    var s = settings(), el = B.h('p', { class: 'privacy' });
    el.innerHTML = enabled() ? 'AI helper is on (' + (s.provider === 'local' ? 'in-browser model' : 'your Gemini key') + '). <a href="' + B.base + 'ai/">Change</a>'
      : 'Everything here works without AI. For extra AI writing help, <a href="' + B.base + 'ai/">turn on the free AI helper</a>.';
    container.appendChild(el); return el;
  }
  B.ai = { settings: settings, save: save, enabled: enabled, ask: ask, parseJSON: parseJSON, button: button, note: note, loadLocal: loadLocal, DEFAULTS: DEFAULTS };
})(window);
