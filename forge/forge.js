/* ProductForge entry point.
   Browser: load in this order (no build step):
     <link rel="stylesheet" href="../../forge/forge.css">
     <script src="../../assets/core.js"></script>
     <script src="../../forge/forge-core.js"></script>
     <script src="../../forge/forge-ui.js"></script>
     <script src="../../forge/forge.js"></script>   (optional: adds forge.css if you forgot it and checks the order)
   Node: require('../forge/forge.js') returns the pure core (same as forge-core.js) for tests.
   See forge/README.md for how to build an app. */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) { module.exports = require('./forge-core.js'); return; }
  var me = document.currentScript && document.currentScript.src;
  if (me && !document.querySelector('link[href*="forge.css"]')) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = me.replace(/forge\.js(\?.*)?$/, 'forge.css'); document.head.appendChild(l);
  }
  if (!root.B) console.error('ProductForge: load assets/core.js before forge.');
  if (!root.ForgeCore) console.error('ProductForge: load forge/forge-core.js before forge-ui.js and forge.js.');
  if (!root.Forge) console.error('ProductForge: load forge/forge-ui.js before forge.js.');
  else root.Forge.version = '1.0';
})(this);
