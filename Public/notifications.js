(() => {
    'use strict';

    let registrationPromise = null;
    let configPromise = null;

    function supported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    }

    async function getConfig() {
        if (!configPromise) {
            configPromise = fetch('/api/client-config', { credentials: 'same-origin' })
                .then(async response => {
                    if (!response.ok) throw new Error('notification-config-unavailable');
                    return response.json();
                })
                .then(data => data?.notifications || {})
                .catch(() => ({}));
        }
        return configPromise;
    }

    async function getRegistration() {
        if (!supported()) throw new Error('push-not-supported');
        if (!registrationPromise) {
            registrationPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(() => navigator.serviceWorker.ready);
        }
        return registrationPromise;
    }

    async function sendSubscriptionToServer(subscription) {
        const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: subscription.toJSON ? subscription.toJSON() : subscription })
        });
        if (!response.ok) throw new Error('push-subscribe-failed');
        return response.json().catch(() => ({ success: true }));
    }

    async function subscribeIfPossible() {
        if (!supported() || Notification.permission !== 'granted') {
            return { ok: false, permission: supported() ? Notification.permission : 'unsupported' };
        }

        const config = await getConfig();
        const publicKey = String(config?.vapidPublicKey || '');
        if (!config?.pushSupported || !publicKey) {
            return { ok: false, permission: Notification.permission, reason: 'server-push-unavailable' };
        }

        const registration = await getRegistration();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        await sendSubscriptionToServer(subscription);
        return { ok: true, permission: Notification.permission, subscription };
    }

    async function enableFromUserGesture() {
        if (!supported()) {
            return { ok: false, permission: 'unsupported', reason: 'unsupported' };
        }
        let permission = Notification.permission;
        if (permission !== 'granted') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            return { ok: false, permission, reason: 'permission-denied' };
        }
        try {
            return await subscribeIfPossible();
        } catch (error) {
            console.warn('Push subscription failed:', error);
            return { ok: false, permission, reason: error?.message || 'subscribe-failed' };
        }
    }

    async function init() {
        if (!supported()) return;
        try {
            await getRegistration();
            if (Notification.permission === 'granted') {
                await subscribeIfPossible();
            }
        } catch (error) {
            console.warn('Notification init failed:', error);
        }
    }

    window.TomiNotifications = {
        supported,
        init,
        enableFromUserGesture,
        subscribeIfPossible,
        getPermission: () => supported() ? Notification.permission : 'unsupported'
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(), { once: true });
    } else {
        init();
    }
})();
