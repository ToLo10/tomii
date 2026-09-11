'use strict';

self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (_) {
        data = { body: event.data ? event.data.text() : 'لديك إشعار جديد' };
    }

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const roomId = String(data.roomId || '');

        // Do not duplicate a system notification while the user is already
        // actively looking at the exact same conversation.
        const activelyViewingRoom = windows.some(client => {
            try {
                const url = new URL(client.url);
                return client.visibilityState === 'visible' && roomId && url.searchParams.get('roomId') === roomId;
            } catch (_) {
                return false;
            }
        });
        if (activelyViewingRoom && data.type !== 'call') return;

        await self.registration.showNotification(data.title || 'TOMI', {
            body: data.body || 'لديك نشاط جديد',
            tag: data.tag || undefined,
            renotify: true,
            requireInteraction: Boolean(data.requireInteraction),
            data: {
                url: data.url || '/',
                roomId,
                type: data.type || 'message'
            },
            vibrate: data.type === 'call' ? [250, 120, 250, 120, 250] : [120, 80, 120]
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification?.data?.url || '/', self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if ('focus' in client) {
                try {
                    if (client.url === target) return client.focus();
                    await client.navigate(target);
                    return client.focus();
                } catch (_) {}
            }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
    })());
});
