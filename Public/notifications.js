(() => {
    'use strict';

    let registrationPromise = null;
    let configPromise = null;
    const DISABLED_STORAGE_KEY = 'tomi_notifications_disabled_v1';

    function supported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function userDisabledNotifications() {
        try {
            return localStorage.getItem(DISABLED_STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function setUserDisabledNotifications(disabled) {
        try {
            if (disabled) localStorage.setItem(DISABLED_STORAGE_KEY, '1');
            else localStorage.removeItem(DISABLED_STORAGE_KEY);
        } catch (_) {}
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
                .catch(() => {
                    // The script can load before the authenticated session is
                    // ready. Do not cache that initial 401 forever.
                    configPromise = null;
                    return {};
                });
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

    async function removeSubscriptionFromServer(endpoint) {
        const response = await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: String(endpoint || '') })
        });
        if (!response.ok) throw new Error('push-unsubscribe-failed');
        return response.json().catch(() => ({ success: true }));
    }

    async function subscribeIfPossible() {
        if (userDisabledNotifications()) {
            return { ok: false, permission: supported() ? Notification.permission : 'unsupported', reason: 'user-disabled' };
        }
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

    async function disableFromUserGesture() {
        if (!supported()) {
            return { ok: false, permission: 'unsupported', reason: 'unsupported' };
        }

        // Notification.permission cannot be changed by JavaScript. Disabling
        // the TOMI subscription is the reversible, per-device equivalent.
        setUserDisabledNotifications(true);
        let subscription = null;
        let serverError = null;
        try {
            const registration = await getRegistration();
            subscription = await registration.pushManager.getSubscription();
            if (subscription?.endpoint) {
                try {
                    await removeSubscriptionFromServer(subscription.endpoint);
                } catch (error) {
                    serverError = error;
                }
                try {
                    await subscription.unsubscribe();
                } catch (error) {
                    serverError = serverError || error;
                }
            }
        } catch (error) {
            serverError = error;
        }

        return {
            ok: true,
            disabled: true,
            permission: Notification.permission,
            hadSubscription: Boolean(subscription),
            serverError: serverError ? (serverError.message || 'unsubscribe-failed') : ''
        };
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
            setUserDisabledNotifications(false);
            return await subscribeIfPossible();
        } catch (error) {
            console.warn('Push subscription failed:', error);
            return { ok: false, permission, reason: error?.message || 'subscribe-failed' };
        }
    }

    function syncButton(button, active = null) {
        if (!button) return;
        if (!supported()) {
            button.style.display = 'none';
            return;
        }
        button.style.display = 'inline-flex';
        const permission = Notification.permission;
        const isActive = active === null
            ? button.dataset.notificationsActive === '1'
            : Boolean(active);
        button.dataset.notificationsActive = isActive ? '1' : '0';
        button.classList.toggle('notifications-enabled', isActive);
        button.classList.toggle('notifications-disabled', !isActive);
        button.setAttribute('aria-pressed', String(isActive));
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-bell', isActive);
            icon.classList.toggle('fa-bell-slash', !isActive);
        }
        button.title = isActive
            ? 'إيقاف إشعارات TOMI على هذا الجهاز'
            : permission === 'denied'
                ? 'الإشعارات محظورة من إعدادات المتصفح'
                : 'تفعيل إشعارات TOMI على هذا الجهاز';
        button.setAttribute('aria-label', button.title);
    }

    async function refreshButton(button) {
        if (!button || !supported()) return false;
        let active = false;
        if (Notification.permission === 'granted' && !userDisabledNotifications()) {
            try {
                const registration = await getRegistration();
                active = Boolean(await registration.pushManager.getSubscription());
            } catch (_) {}
        }
        syncButton(button, active);
        return active;
    }

    function bindButton(button) {
        if (!button || button.dataset.notificationsBound === '1') return;
        button.dataset.notificationsBound = '1';
        syncButton(button, false);
        button.disabled = true;
        refreshButton(button).finally(() => { button.disabled = false; });
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                const result = button.dataset.notificationsActive === '1'
                    ? await disableFromUserGesture()
                    : await enableFromUserGesture();
                if (result.ok && result.disabled) {
                    window.alert('تم إيقاف إشعارات TOMI على هذا الجهاز. يمكنك إعادتها من نفس الزر.');
                } else if (result.ok) {
                    window.alert('تم تفعيل إشعارات TOMI على هذا الجهاز.');
                } else if (result.permission === 'denied') {
                    window.alert('المتصفح مانع الإشعارات. افتح إعدادات الموقع من رمز القفل/الإعدادات واسمح بإشعارات TOMI، ثم حاول مرة ثانية.');
                } else if (result.reason === 'server-push-unavailable') {
                    window.alert('خدمة الإشعارات تحتاج إعداد VAPID على السيرفر. ستبقى إشعارات الموقع الداخلية تعمل.');
                } else {
                    window.alert('هذا الجهاز أو المتصفح لا يدعم إشعارات الخلفية. ستبقى الإشعارات داخل الموقع متاحة.');
                }
            } finally {
                button.disabled = false;
                await refreshButton(button);
            }
        });
    }

    async function init() {
        if (!supported()) return;
        try {
            await getRegistration();
            if (Notification.permission === 'granted' && !userDisabledNotifications()) {
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
        disableFromUserGesture,
        subscribeIfPossible,
        bindButton,
        refreshButton,
        getPermission: () => supported() ? Notification.permission : 'unsupported',
        isDisabled: userDisabledNotifications
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(), { once: true });
    } else {
        init();
    }
})();
