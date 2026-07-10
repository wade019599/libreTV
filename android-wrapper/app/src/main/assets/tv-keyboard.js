(function () {
    if (window.__JMTV_TV_KEYBOARD_INJECTED__) return;
    window.__JMTV_TV_KEYBOARD_INJECTED__ = true;

    const focusStyle = document.createElement('style');
    focusStyle.textContent = `
        [data-jmtv-tv-focus='true']:focus {
            outline: 3px solid #fff !important;
            outline-offset: 3px !important;
        }
    `;
    document.head.appendChild(focusStyle);

    const focusSelector = [
        'button:not([disabled])',
        'a[href]',
        'input:not([type=hidden]):not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[role=button]',
        '[onclick]',
        '[tabindex]:not([tabindex=-1])',
        'video[controls]'
    ].join(',');
    const getFocusableElements = () => Array.from(document.querySelectorAll(focusSelector)).filter(element => {
        if (element.closest('[aria-hidden=true]')) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        if (element.matches('[onclick],[role=button]') && element.tabIndex < 0) element.tabIndex = 0;
        element.dataset.jmtvTvFocus = 'true';
        return true;
    });
    document.addEventListener('keydown', event => {
        const directions = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
        };
        const direction = directions[event.key];
        if (!direction) return;

        const focusable = getFocusableElements();
        if (!focusable.length) return;
        const current = document.activeElement;
        if (!focusable.includes(current)) {
            event.preventDefault();
            event.stopPropagation();
            focusable[0].focus();
            return;
        }

        const currentRect = current.getBoundingClientRect();
        const currentX = currentRect.left + currentRect.width / 2;
        const currentY = currentRect.top + currentRect.height / 2;
        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;
        focusable.forEach(candidate => {
            if (candidate === current) return;
            const rect = candidate.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const dx = x - currentX;
            const dy = y - currentY;
            if (direction === 'up' && dy >= -4) return;
            if (direction === 'down' && dy <= 4) return;
            if (direction === 'left' && dx >= -4) return;
            if (direction === 'right' && dx <= 4) return;

            const horizontal = direction === 'left' || direction === 'right';
            const primaryDistance = horizontal ? Math.abs(dx) : Math.abs(dy);
            const secondaryDistance = horizontal ? Math.abs(dy) : Math.abs(dx);
            const crossGap = horizontal
                ? Math.max(0, Math.max(currentRect.top, rect.top) - Math.min(currentRect.bottom, rect.bottom))
                : Math.max(0, Math.max(currentRect.left, rect.left) - Math.min(currentRect.right, rect.right));
            const score = primaryDistance + secondaryDistance * 0.25 + crossGap * 5;
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        });

        event.preventDefault();
        event.stopPropagation();
        if (best) {
            best.focus();
            best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, true);

    if (typeof window.initTvSearchKeyboard === 'function' && document.getElementById('tvKeyboardToggle')) {
        window.initTvSearchKeyboard();
        return;
    }

    const input = document.getElementById('searchInput');
    if (!input || !input.parentElement) return;
    const toolbar = input.parentElement;
    const searchButton = Array.from(toolbar.querySelectorAll('button')).find(button =>
        (button.getAttribute('onclick') || '').includes('search()')
    );
    if (!searchButton) return;

    const toggle = document.createElement('button');
    toggle.id = 'jmtvNativeTvKeyboardToggle';
    toggle.type = 'button';
    toggle.textContent = 'ABC';
    toggle.setAttribute('aria-label', '打开电视键盘');
    Object.assign(toggle.style, {
        width: '64px', flex: '0 0 64px', background: '#111', color: '#fff',
        border: '1px solid #333', fontSize: '16px', fontWeight: '700'
    });
    toolbar.insertBefore(toggle, searchButton);

    const panel = document.createElement('div');
    panel.id = 'jmtvNativeTvKeyboard';
    Object.assign(panel.style, {
        display: 'none', margin: '0 0 16px', padding: '12px', background: '#111',
        border: '1px solid #333', borderRadius: '8px', position: 'relative', zIndex: '30'
    });
    toolbar.insertAdjacentElement('afterend', panel);

    const createKey = (label, value, primary) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.value = value;
        Object.assign(button.style, {
            height: '48px', minWidth: '0', background: primary ? '#fff' : '#222',
            color: primary ? '#000' : '#fff', border: '1px solid #444', borderRadius: '6px',
            fontSize: '17px', fontWeight: '600', outline: 'none'
        });
        button.addEventListener('focus', () => {
            button.style.background = '#fff';
            button.style.color = '#000';
            button.style.boxShadow = '0 0 0 3px rgba(255,255,255,.45)';
        });
        button.addEventListener('blur', () => {
            button.style.background = primary ? '#fff' : '#222';
            button.style.color = primary ? '#000' : '#fff';
            button.style.boxShadow = 'none';
        });
        return button;
    };

    [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ].forEach(row => {
        const rowElement = document.createElement('div');
        Object.assign(rowElement.style, {
            display: 'grid', gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
            gap: '8px', marginBottom: '8px'
        });
        row.forEach(value => rowElement.appendChild(createKey(value, value, false)));
        panel.appendChild(rowElement);
    });

    const actions = document.createElement('div');
    Object.assign(actions.style, {
        display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '8px'
    });
    [
        ['退格', 'backspace', false], ['空格', 'space', false], ['清空', 'clear', false],
        ['搜索', 'search', true], ['关闭', 'close', false]
    ].forEach(item => actions.appendChild(createKey(item[0], item[1], item[2])));
    panel.appendChild(actions);

    const openKeyboard = focusFirst => {
        panel.style.display = 'block';
        if (focusFirst) {
            const firstKey = panel.querySelector('button');
            if (firstKey) firstKey.focus();
        }
    };
    const closeKeyboard = () => { panel.style.display = 'none'; };
    input.setAttribute('inputmode', 'none');
    input.addEventListener('focus', () => openKeyboard(false));
    input.addEventListener('click', () => openKeyboard(false));
    toggle.addEventListener('click', () => {
        if (panel.style.display === 'none') openKeyboard(true);
        else closeKeyboard();
    });
    panel.addEventListener('click', event => {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        const value = button.dataset.value;
        if (value === 'close') {
            closeKeyboard();
            toggle.focus();
            return;
        }
        if (value === 'search') {
            if (typeof window.search === 'function') window.search();
            return;
        }
        if (value === 'backspace') input.value = input.value.slice(0, -1);
        else if (value === 'space') input.value += ' ';
        else if (value === 'clear') input.value = '';
        else input.value += value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
})();
