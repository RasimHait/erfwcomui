(() => {
    'use strict';

    const TICKS = 24;
    const STATES = new Set(['waiting', 'connected', 'error']);

    const status = document.getElementById('status');
    const copy = status.querySelector('.status-copy');
    const text = document.getElementById('status-text');
    const detail = document.getElementById('status-detail');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const ticks = document.getElementById('ticks');
    for (let i = 0; i < TICKS; i++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'tick');
        line.setAttribute('x1', '60');
        line.setAttribute('y1', '6');
        line.setAttribute('x2', '60');
        line.setAttribute('y2', '16');
        line.setAttribute('transform', `rotate(${(360 / TICKS) * i} 60 60)`);
        line.style.setProperty('--i', i);
        ticks.append(line);
    }

    let changeTimer = 0;

    function setStatus(next = {}) {
        const state = STATES.has(next.state) ? next.state : 'waiting';
        const nextText = next.text ?? '';
        const nextDetail = next.detail ?? '';

        status.dataset.state = state;
        document.title = nextText ? `${nextText} | ERFW Companion` : 'ERFW Companion';

        if (text.textContent === nextText && detail.textContent === nextDetail) return;

        const apply = () => {
            text.textContent = nextText;
            detail.textContent = nextDetail;
            copy.classList.remove('is-changing');
        };

        clearTimeout(changeTimer);
        if (reducedMotion.matches) {
            apply();
        } else {
            copy.classList.add('is-changing');
            changeTimer = setTimeout(apply, 180);
        }
    }

    erfw.on('status', setStatus);

    document.getElementById('minimize').addEventListener('click', () => erfw.minimize());
    document.getElementById('close').addEventListener('click', () => erfw.close());

    const runTest = document.getElementById('run-test');
    runTest.addEventListener('click', async () => {
        runTest.disabled = true;
        try {
            const sent = await erfw.request('runTestCode');
            if (!sent) console.warn('Код не отправлен: аддон не подключён');
        } catch (error) {
            console.error(error);
        } finally {
            runTest.disabled = false;
        }
    });

    if (erfw.hosted) {
        setStatus({ state: 'waiting', text: 'Запуск' });
        return;
    }

    document.getElementById('preview-note').hidden = false;
    const demo = [
        { state: 'waiting', text: 'Ожидание World of Warcraft', detail: 'Запустите игру, компаньон подключится сам.' },
        { state: 'connected', text: 'Подключено к игре', detail: 'Аддон отвечает, проверка орфографии работает.' },
        { state: 'error', text: 'Аддон не отвечает', detail: 'Убедитесь, что !EFW_Companion включён, и выполните /reload.' },
    ];
    let step = 0;
    setStatus(demo[0]);
    setInterval(() => setStatus(demo[++step % demo.length]), 3500);
})();
