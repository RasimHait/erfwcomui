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
    const menu = document.getElementById('profile-menu');
    const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const DRAG_THRESHOLD = 5;
    const SCROLL_EDGE = 24;
    let profiles = null;
    let applying = null;
    let applyTimer = 0;
    let applyFailed = false;
    let menuTarget = null;
    let drag = null;
    let renderPending = false;
    let suppressClick = false;

    const findProfile = id => profiles?.profiles.find(profile => profile.id === id);

    function profileMeta(profile) {
        if (profile.id === profiles.current) return 'Активен';
        if (profile.id === applying) return 'Применяем…';
        const updated = new Date(profile.updated);
        return Number.isNaN(updated.getTime()) ? '' : dateFormat.format(updated);
    }

    function renderProfiles() {
        if (drag?.active) {
            renderPending = true;
            return;
        }
        renderPending = false;

        const visible = status.dataset.state === 'connected' && profiles?.profiles?.length > 0;
        profilesPanel.hidden = !visible;
        if (!visible) {
            closeMenu();
            return;
        }

        profilesCharacter.textContent = applyFailed ? 'Аддон не принял профиль' : profiles.character;
        profilesCharacter.toggleAttribute('data-error', applyFailed);

        const focused = document.activeElement?.closest?.('.profile')?.dataset.id;
        profilesList.replaceChildren(...profiles.profiles.map(profile => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            const name = document.createElement('span');
            const meta = document.createElement('span');
            const current = profile.id === profiles.current;

            item.dataset.id = profile.id;
            button.type = 'button';
            button.className = 'profile';
            button.dataset.id = profile.id;
            button.setAttribute('aria-current', String(current));
            button.setAttribute('aria-haspopup', 'menu');
            if (applying !== null) button.setAttribute('aria-disabled', 'true');
            if (profile.id === applying) button.dataset.applying = '';
            button.title = current
                ? 'Этот профиль сейчас в игре. Перетащите, чтобы изменить порядок'
                : 'Нажмите, чтобы сделать активным. Перетащите, чтобы изменить порядок';
            name.className = 'profile-name';
            name.textContent = profile.name;
            meta.className = 'profile-meta';
            meta.textContent = profileMeta(profile);

            button.append(name, meta);
            item.append(button);
            return item;
        }));

        if (focused) profilesList.querySelector(`.profile[data-id="${CSS.escape(focused)}"]`)?.focus();
    }

    function finishApplying(failed) {
        clearTimeout(applyTimer);
        applying = null;
        applyFailed = failed;
        renderProfiles();
    }

    async function applyProfile(id) {
        if (applying !== null || id === profiles.current) return;

        applying = id;
        applyFailed = false;
        renderProfiles();
        applyTimer = setTimeout(() => finishApplying(true), 8000);
        try {
            if (!erfw.hosted) {
                setTimeout(() => {
                    profiles = { ...profiles, current: id };
                    finishApplying(false);
                }, 600);
            } else if (!await erfw.request('trpApply', id, 15000)) {
                finishApplying(true);
            }
        } catch (error) {
            console.error(error);
            finishApplying(true);
        }
    }

    async function deleteProfile(id) {
        if (id === profiles.current) return;

        profiles = { ...profiles, profiles: profiles.profiles.filter(profile => profile.id !== id) };
        renderProfiles();
        if (!erfw.hosted) return;
        try {
            await erfw.request('trpDelete', id);
        } catch (error) {
            console.error(error);
        }
    }

    async function saveOrder(ids) {
        const byId = new Map(profiles.profiles.map(profile => [profile.id, profile]));
        profiles = { ...profiles, profiles: ids.map(id => byId.get(id)).filter(Boolean) };
        renderProfiles();
        if (!erfw.hosted) return;
        try {
            await erfw.request('trpReorder', ids);
        } catch (error) {
            console.error(error);
        }
    }

    function moveProfile(id, step) {
        const ids = profiles.profiles.map(profile => profile.id);
        const from = ids.indexOf(id);
        const to = from + step;
        if (from < 0 || to < 0 || to >= ids.length) return;
        ids.splice(to, 0, ...ids.splice(from, 1));
        saveOrder(ids);
    }

    function openMenu(id, x, y) {
        const profile = findProfile(id);
        if (!profile) return;

        menuTarget = id;
        const current = id === profiles.current;
        menu.querySelector('[data-action="apply"]').disabled = current || applying !== null;
        menu.querySelector('[data-action="delete"]').disabled = current;
        menu.querySelector('[data-action="delete"]').title = current ? 'Активный профиль удалить нельзя' : '';
        menu.hidden = false;

        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
        menu.style.top = `${y + height > window.innerHeight - 8 ? y - height : y}px`;
        menu.querySelector('.menu-item:not(:disabled)')?.focus();
    }

    function closeMenu() {
        if (menu.hidden) return;
        menu.hidden = true;
        const target = menuTarget;
        menuTarget = null;
        if (menu.contains(document.activeElement) && target) {
            profilesList.querySelector(`.profile[data-id="${CSS.escape(target)}"]`)?.focus();
        }
    }

    function startDrag() {
        const rect = drag.item.getBoundingClientRect();
        drag.active = true;
        drag.grab = drag.startY - rect.top;
        drag.order = profiles.profiles.map(profile => profile.id).join('\n');
        drag.item.dataset.dragging = '';
        profilesList.dataset.sorting = '';
        closeMenu();
    }

    function animateSiblings(before) {
        if (reducedMotion.matches) return;
        for (const item of profilesList.children) {
            if (item === drag.item || !before.has(item)) continue;
            const delta = before.get(item) - item.getBoundingClientRect().top;
            if (!delta) continue;
            item.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 140, easing: 'ease-out' });
        }
    }

    function moveDrag(y) {
        const listRect = profilesList.getBoundingClientRect();
        if (y < listRect.top + SCROLL_EDGE) profilesList.scrollTop -= 6;
        else if (y > listRect.bottom - SCROLL_EDGE) profilesList.scrollTop += 6;

        const items = [...profilesList.children].filter(item => item !== drag.item);
        const before = new Map(items.map(item => [item, item.getBoundingClientRect().top]));
        const next = items.find(item => {
            const rect = item.getBoundingClientRect();
            return y < rect.top + rect.height / 2;
        }) ?? null;
        if (drag.item.nextElementSibling !== next) {
            profilesList.insertBefore(drag.item, next);
            animateSiblings(before);
        }

        drag.item.style.transform = '';
        const natural = drag.item.getBoundingClientRect().top;
        const top = Math.min(Math.max(y - drag.grab, listRect.top - 4), listRect.bottom - drag.item.offsetHeight + 4);
        drag.item.style.transform = `translateY(${top - natural}px)`;
    }

    function endDrag() {
        if (!drag) return;
        const finished = drag;
        drag = null;
        if (!finished.active) return;

        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        finished.item.style.transform = '';
        delete finished.item.dataset.dragging;
        delete profilesList.dataset.sorting;

        const ids = [...profilesList.children].map(item => item.dataset.id);
        if (ids.join('\n') !== finished.order) saveOrder(ids);
        else if (renderPending) renderProfiles();
    }

    erfw.on('trpProfiles', data => {
        profiles = data;
        if (menuTarget && !findProfile(menuTarget)) closeMenu();
        finishApplying(false);
    });

    profilesList.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !profiles) return;
        const item = event.target.closest('li');
        if (!item) return;
        drag = { item, pointer: event.pointerId, startY: event.clientY, active: false };
    });

    window.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointer) return;
        if (!drag.active) {
            if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
            startDrag();
        }
        event.preventDefault();
        moveDrag(event.clientY);
    });

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', () => {
        endDrag();
        closeMenu();
    });

    profilesList.addEventListener('click', event => {
        if (suppressClick) return;
        const button = event.target.closest('.profile');
        if (button) applyProfile(button.dataset.id);
    });

    profilesList.addEventListener('contextmenu', event => {
        const button = event.target.closest('.profile');
        if (!button) return;
        event.preventDefault();
        if (event.button === 2 || event.clientX || event.clientY) {
            openMenu(button.dataset.id, event.clientX, event.clientY);
        } else {
            const rect = button.getBoundingClientRect();
            openMenu(button.dataset.id, rect.left + 24, rect.bottom);
        }
    });

    profilesList.addEventListener('keydown', event => {
        const button = event.target.closest('.profile');
        if (!button || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        moveProfile(button.dataset.id, event.key === 'ArrowUp' ? -1 : 1);
    });

    menu.addEventListener('click', event => {
        const item = event.target.closest('.menu-item');
        if (!item || item.disabled || !menuTarget) return;
        const id = menuTarget;
        closeMenu();
        if (item.dataset.action === 'apply') applyProfile(id);
        else if (item.dataset.action === 'delete') deleteProfile(id);
    });

    menu.addEventListener('keydown', event => {
        const items = [...menu.querySelectorAll('.menu-item:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            closeMenu();
        }
    });

    document.addEventListener('pointerdown', event => {
        if (!menu.hidden && !menu.contains(event.target)) closeMenu();
    }, true);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMenu();
    });

    profilesList.addEventListener('scroll', closeMenu);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('contextmenu', event => event.preventDefault());

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
