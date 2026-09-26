/* Project Tessera — selects the AI visual language for a page.
 *
 * To change the style for the whole site, edit DEFAULT below (one line).
 * To preview a style on any page, add ?ai=<style> to its URL; internal links on
 * that page keep the parameter so a whole walkthrough stays in one style.
 * Styles: marginalia (default) · tabs · perforated · tiles.  See docs/assets/ai-voice.css.
 */
(function () {
  var DEFAULT = 'marginalia';
  var STYLES = ['marginalia', 'tabs', 'perforated', 'tiles'];
  var param = new URLSearchParams(location.search).get('ai');
  var style = STYLES.indexOf(param) >= 0 ? param : DEFAULT;
  document.documentElement.setAttribute('data-ai-style', style);
  window.TesseraAI = { DEFAULT: DEFAULT, STYLES: STYLES, style: style };

  if (!param || style === DEFAULT) return;
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (/^(https?:|mailto:|#)/.test(href)) return;
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return;
      u.searchParams.set('ai', style);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    });
  });
})();
