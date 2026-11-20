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
        renderProfiles();
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

    const profilesPanel = document.getElementById('profiles');
    const profilesList = document.getElementById('profiles-list');
    const profilesCharacter = document.getElementById('profiles-character');
    const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let profiles = null;
    let applying = null;
    let applyTimer = 0;
    let applyFailed = false;

    function profileMeta(profile) {
        if (profile.id === profiles.current) return 'Активен';
        if (profile.id === applying) return 'Применяем…';
        const updated = new Date(profile.updated);
        return Number.isNaN(updated.getTime()) ? 'Применить' : dateFormat.format(updated);
    }

    function renderProfiles() {
        const visible = status.dataset.state === 'connected' && profiles?.profiles?.length > 0;
        profilesPanel.hidden = !visible;
        if (!visible) return;

        profilesCharacter.textContent = applyFailed ? 'Аддон не принял профиль' : profiles.character;
        profilesCharacter.toggleAttribute('data-error', applyFailed);
        profilesList.replaceChildren(...profiles.profiles.map(profile => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            const name = document.createElement('span');
            const meta = document.createElement('span');
            const current = profile.id === profiles.current;

            button.type = 'button';
            button.className = 'profile';
            button.dataset.id = profile.id;
            button.setAttribute('aria-current', String(current));
            button.disabled = current || applying !== null;
            if (profile.id === applying) button.dataset.applying = '';
            button.title = current ? 'Этот профиль сейчас в игре' : 'Сделать профилем персонажа';
            name.className = 'profile-name';
            name.textContent = profile.name;
            meta.className = 'profile-meta';
            meta.textContent = profileMeta(profile);

            button.append(name, meta);
            item.append(button);
            return item;
        }));
    }

    function finishApplying(failed) {
        clearTimeout(applyTimer);
        applying = null;
        applyFailed = failed;
        renderProfiles();
    }

    erfw.on('trpProfiles', data => {
        profiles = data;
        finishApplying(false);
    });

    profilesList.addEventListener('click', async event => {
        const button = event.target.closest('.profile');
        if (!button || button.disabled) return;

        applying = button.dataset.id;
        applyFailed = false;
        renderProfiles();
        applyTimer = setTimeout(() => finishApplying(true), 8000);
        try {
            if (!await erfw.request('trpApply', applying, 15000)) finishApplying(true);
        } catch (error) {
            console.error(error);
            finishApplying(true);
        }
    });

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
    profiles = {
        character: 'Доукс-Darkmoon',
        current: 'a',
        profiles: [
            { id: 'a', name: 'Доукс', updated: new Date().toISOString() },
            { id: 'b', name: 'Доукс в маске', updated: new Date(Date.now() - 864e5).toISOString() },
            { id: 'c', name: 'Тренировочный', updated: new Date(Date.now() - 6048e5).toISOString() },
        ],
    };
    let step = 0;
    setStatus(demo[0]);
    setInterval(() => setStatus(demo[++step % demo.length]), 3500);
})();
