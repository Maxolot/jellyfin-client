const asianLocale = /^(?:ja|ko|zh)(?:-|$)/i;
const asianCharacters = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

function hasAsianText(node) {
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') return false;
    return asianCharacters.test(node.textContent || '');
}

// The complete CJK character sets keep their original font and local fallbacks.
export function loadCjkFontFallbacks() {
    const root = document.documentElement;
    const importFonts = () => import(/* webpackChunkName: "fonts-noto-cjk" */ '../styles/noto-sans/index.scss')
        .catch(error => console.warn('Could not load CJK font fallbacks', error));
    if (asianLocale.test(root.lang) || hasAsianText(document.body)) {
        void importFonts();
        return;
    }
    if (!('MutationObserver' in window)) return;
    const observer = new MutationObserver(records => {
        const needsFonts = asianLocale.test(root.lang) || records.some(record =>
            record.type === 'characterData' ? hasAsianText(record.target) : Array.from(record.addedNodes).some(hasAsianText));
        if (needsFonts) {
            observer.disconnect();
            void importFonts();
        }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
}
