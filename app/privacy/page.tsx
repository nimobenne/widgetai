export default function PrivacyPage() {
  return (
    <main className="site-shell" style={{ paddingTop: 56, paddingBottom: 80 }}>
      <a href="/">← WidgetAI</a>
      <h1 style={{ marginTop: 48, fontSize: 44 }}>Privacy</h1>
      <p style={{ maxWidth: 620, color: 'var(--muted)' }}>
        Questions sent to WidgetAI are logged without an IP address or identity for 30 days so Nimo can improve the answers. Please do not enter personal data in the assistant.
      </p>
    </main>
  );
}
