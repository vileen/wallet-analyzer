import { useState } from 'react';

export default function NotificationFAQ() {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: '1px solid #333',
          background: '#1a1a1a',
          color: '#888',
          cursor: 'pointer',
          fontSize: '0.875rem',
          width: '100%',
          marginTop: '1rem',
        }}
      >
        📱 How to enable notifications on iOS
      </button>
    );
  }

  return (
    <div style={{ marginTop: '1rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>iOS Notifications Setup</h3>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.25rem' }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#ccc', lineHeight: 1.6 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          To receive push notifications for wallet activity on your iPhone/iPad:
        </p>

        <ol style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Open this app in Safari</strong> — Add to Home Screen for the best experience (Share → Add to Home Screen)
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Enable Push Notifications</strong> — When prompted, tap "Allow" for notifications. If you missed the prompt, go to Settings → Safari → Notifications → Allow
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Check per-wallet settings</strong> — In this app, click the bell icon (🔔/🔕) next to each wallet to toggle notifications on/off
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Keep the app running</strong> — Safari periodically checks for updates. Keep the app open occasionally or add it to your Home Screen for background refresh
          </li>
        </ol>

        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Note:</strong> iOS Safari push notifications require the app to be added to the Home Screen and opened at least once. Notifications are sent via the web push API and may be delayed by iOS's power management.
        </p>

        <p style={{ color: '#888', fontSize: '0.75rem' }}>
          If notifications aren't working, try: Settings → Notifications → Safari → Allow Notifications → toggle off and on again.
        </p>
      </div>
    </div>
  );
}
