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
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>iOS Notifications via Shortcuts</h3>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.25rem' }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#ccc', lineHeight: 1.6 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          iOS doesn't allow websites to send push notifications directly. Use the <strong>Shortcuts</strong> app instead:
        </p>

        <ol style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Open Shortcuts app</strong> → Automation tab → Create Personal Automation
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Choose trigger:</strong> Time of Day → Set to check every hour (or whatever interval you want)
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Add action:</strong> Get contents of URL → Paste your API endpoint:
            <code style={{ display: 'block', background: '#252525', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              https://solana-tracker.vileen.pl/api/notifications?unread=true
            </code>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Add action:</strong> Get Dictionary Value → Get <code>notifications</code> array from the JSON
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Add action:</strong> If → Count of notifications &gt; 0
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Inside If:</strong> Show Notification → Title: "Wallet Activity" → Body: "X new transactions"
          </li>
        </ol>

        <p style={{ marginBottom: '0.5rem', color: '#888' }}>
          <strong>Tip:</strong> You can also trigger the shortcut manually from the Shortcuts app or widget. For more detailed notifications, parse individual items from the JSON response.
        </p>

        <p style={{ color: '#888', fontSize: '0.75rem' }}>
          Note: Background automation requires the device to be unlocked. Consider using a time-based trigger when you're likely to be using your phone.
        </p>
      </div>
    </div>
  );
}
