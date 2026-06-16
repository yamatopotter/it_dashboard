export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background text-foreground">
      <svg
        width="56" height="56" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        className="text-muted-foreground"
      >
        <path d="M12 2.4V3.4"/>
        <path d="M9.8 6 12 3.7l2.2 2.3"/>
        <path d="M10.4 6h3.2v2.5h-3.2z"/>
        <circle cx="12" cy="7.25" r="0.7" fill="currentColor" stroke="none"/>
        <path d="M9.8 7.25H8M14.2 7.25H16"/>
        <path d="M8.9 8.5h6.2"/>
        <path d="M9.8 8.5 8.5 19.6M14.2 8.5 15.5 19.6"/>
        <path d="M9.3 12.4h5.4"/>
        <path d="M8.9 16h6.2"/>
        <path d="M7.3 19.6h9.4"/>
        <path d="M10.9 19.6v-2.3a1.1 1.1 0 0 1 2.2 0v2.3"/>
      </svg>

      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Sem conexão</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Você está offline. Conecte-se à rede onde o WatchIT Tower está hospedado e tente novamente.
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Tentar novamente
      </button>
    </div>
  );
}
