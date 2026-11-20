// Мост между страницей и приложением ERFW Companion (C#).
//
//   erfw.on(type, handler)          подписка на сообщения приложения; возвращает функцию отписки.
//                                   Если приложение ждёт ответ, возвращённое значение (или Promise) уйдёт обратно.
//   erfw.send(type, data)           сообщение приложению без ответа.
//   erfw.request(type, data, ms)    запрос к приложению; Promise с ответом обработчика из C#.
//   erfw.hosted                     true, если страница открыта внутри приложения.
//   erfw.minimize(), erfw.close()   свернуть и закрыть окно.
//
// Формат сообщений (JSON) в обе стороны:
//   { type, data }                  обычное сообщение
//   { type, data, id }              запрос, ждёт ответа
//   { replyTo, data } | { replyTo, error }   ответ на запрос
(() => {
    'use strict';

    const host = window.chrome?.webview ?? null;
    const handlers = new Map();
    const pending = new Map();
    let nextId = 1;

    const post = message => host?.postMessage(message);

    function on(type, handler) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(handler);
        return () => off(type, handler);
    }

    function off(type, handler) {
        handlers.get(type)?.delete(handler);
    }

    function send(type, data) {
        post({ type, data: data ?? null });
    }

    function request(type, data, timeoutMs = 10000) {
        if (!host) return Promise.reject(new Error('Страница открыта не в приложении'));

        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`Приложение не ответило на «${type}» за ${timeoutMs} мс`));
            }, timeoutMs);
            pending.set(id, { resolve, reject, timer });
            post({ type, id, data: data ?? null });
        });
    }

    async function receive(message) {
        if (!message || typeof message !== 'object') return;

        if (message.replyTo != null) {
            const call = pending.get(message.replyTo);
            if (!call) return;
            pending.delete(message.replyTo);
            clearTimeout(call.timer);
            if (message.error != null) call.reject(new Error(message.error));
            else call.resolve(message.data);
            return;
        }

        if (typeof message.type !== 'string') return;

        const list = [...(handlers.get(message.type) ?? [])];
        if (message.id == null) {
            for (const handler of list) {
                try { handler(message.data); } catch (error) { console.error(error); }
            }
            return;
        }

        if (list.length === 0) {
            post({ replyTo: message.id, error: `На странице нет обработчика «${message.type}»` });
            return;
        }

        try {
            const result = await list[0](message.data);
            post({ replyTo: message.id, data: result ?? null });
        } catch (error) {
            post({ replyTo: message.id, error: String(error?.message ?? error) });
        }
    }

    host?.addEventListener('message', event => receive(event.data));

    window.erfw = Object.freeze({
        hosted: host !== null,
        on,
        off,
        send,
        request,
        minimize: () => window.erfwWindow?.minimize(),
        close: () => window.erfwWindow?.close(),
    });

    // Приложение копит сообщения, пока страница не скажет, что готова.
    const ready = () => send('ready');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
})();
