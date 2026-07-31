export default function WorkspaceLoading() {
  return (
    <div className="workspace-loading" aria-label="Cargando inventario">
      <div className="loading-sidebar" />
      <div className="loading-main">
        <div className="loading-topbar" />
        <div className="loading-content">
          <div className="loading-metric-band" />
          <div className="loading-grid">
            <div />
            <div />
          </div>
          <div className="loading-table" />
        </div>
      </div>
    </div>
  );
}
