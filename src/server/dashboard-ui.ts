export function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeOps — Repository Intelligence Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f293d;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --badge-bg: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: #0d1322;
      border-bottom: 1px solid var(--card-border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo { font-size: 1.25rem; font-weight: 700; color: #60a5fa; display: flex; align-items: center; gap: 8px; }
    .repo-pill { background: var(--badge-bg); border: 1px solid var(--card-border); padding: 4px 12px; border-radius: 9999px; font-size: 0.85rem; color: var(--text-muted); }
    nav {
      background: #0f172a;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      padding: 0 24px;
      gap: 8px;
    }
    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 12px 16px;
      font-size: 0.9rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--text-main); }
    .tab-btn.active { color: #60a5fa; border-bottom: 2px solid #60a5fa; font-weight: 600; }
    main {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
    }
    .card h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px; }
    .card .val { font-size: 2rem; font-weight: 700; }
    .card .sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge-critical { background: #7f1d1d; color: #fca5a5; }
    .badge-high { background: #991b1b; color: #fecaca; }
    .badge-medium { background: #78350f; color: #fde68a; }
    .badge-low { background: #064e3b; color: #a7f3d0; }
    .badge-healthy { background: #064e3b; color: #a7f3d0; }
    .badge-warning { background: #78350f; color: #fde68a; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border); }
    th { color: var(--text-muted); font-weight: 600; background: #0f172a; }
    tr:hover { background: #1a2234; }
    .graph-container {
      width: 100%;
      height: 540px;
      background: #090e1a;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg text { user-select: none; font-size: 12px; fill: #cbd5e1; }
    .btn { background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
    .btn:hover { background: var(--primary-hover); }
    input[type="text"] { background: #0f172a; border: 1px solid var(--card-border); color: white; padding: 8px 12px; border-radius: 6px; width: 300px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header>
    <div class="logo">⚡ CodeOps <span>Intelligence</span></div>
    <div id="repoPill" class="repo-pill">Loading...</div>
    <button class="btn" onclick="fetchData()">Refresh Analysis</button>
  </header>
  <nav>
    <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
    <button class="tab-btn" onclick="switchTab('explorer')">Repository Explorer</button>
    <button class="tab-btn" onclick="switchTab('graph')">Dependency Graph</button>
    <button class="tab-btn" onclick="switchTab('architecture')">Architecture</button>
    <button class="tab-btn" onclick="switchTab('security')">Security</button>
    <button class="tab-btn" onclick="switchTab('hotspots')">Hotspots</button>
    <button class="tab-btn" onclick="switchTab('impact')">Change Impact</button>
  </nav>

  <main>
    <!-- OVERVIEW TAB -->
    <div id="tab-overview" class="tab-content active">
      <div class="grid">
        <div class="card">
          <h3>Dependency Health</h3>
          <div id="ovHealthScore" class="val">--</div>
          <div id="ovHealthStatus" class="sub">--</div>
        </div>
        <div class="card">
          <h3>Security Grade</h3>
          <div id="ovSecurityGrade" class="val">--</div>
          <div id="ovSecuritySub" class="sub">--</div>
        </div>
        <div class="card">
          <h3>Total Files</h3>
          <div id="ovTotalFiles" class="val">--</div>
          <div id="ovTotalSymbols" class="sub">--</div>
        </div>
        <div class="card">
          <h3>Circular Dependencies</h3>
          <div id="ovCycles" class="val">--</div>
          <div class="sub">Cycles detected</div>
        </div>
      </div>

      <div class="card">
        <h3>Structural Recommendations</h3>
        <div id="ovRecommendations" style="margin-top: 12px; line-height: 1.6;"></div>
      </div>
    </div>

    <!-- EXPLORER TAB -->
    <div id="tab-explorer" class="tab-content">
      <div class="card">
        <h3>Repository Files</h3>
        <input type="text" id="fileFilter" placeholder="Filter files..." oninput="renderFiles()" style="margin: 12px 0;">
        <table id="filesTable">
          <thead>
            <tr><th>File</th><th>Layer</th><th>Symbols</th><th>Imports</th><th>Calls</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- GRAPH TAB -->
    <div id="tab-graph" class="tab-content">
      <div class="card">
        <h3>Dependency Graph Visualization</h3>
        <div class="graph-container">
          <svg id="depSvg" width="100%" height="100%"></svg>
        </div>
      </div>
    </div>

    <!-- ARCHITECTURE TAB -->
    <div id="tab-architecture" class="tab-content">
      <div class="card">
        <h3>Architectural Layers</h3>
        <div id="archLayersList" class="grid" style="margin-top: 16px;"></div>
      </div>
      <div class="card" style="margin-top: 16px;">
        <h3>Cross-Layer Dependencies</h3>
        <table id="archDepsTable">
          <thead><tr><th>Source Layer</th><th>Target Layer</th><th>Edge Count</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- SECURITY TAB -->
    <div id="tab-security" class="tab-content">
      <div class="card">
        <h3>Security Findings</h3>
        <table id="securityTable">
          <thead><tr><th>Severity</th><th>Title</th><th>Category</th><th>File</th><th>CWE</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- HOTSPOTS TAB -->
    <div id="tab-hotspots" class="tab-content">
      <div class="card">
        <h3>Ranked Structural Hotspots</h3>
        <table id="hotspotsTable">
          <thead><tr><th>Rank</th><th>Risk Tier</th><th>File</th><th>Score</th><th>Fan-in / Fan-out</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- IMPACT TAB -->
    <div id="tab-impact" class="tab-content">
      <div class="card">
        <h3>Change Impact Simulator</h3>
        <div style="display:flex; gap:12px; margin: 12px 0;">
          <input type="text" id="impactFile" placeholder="Enter file path (e.g. src/db.ts)">
          <button class="btn" onclick="runImpact()">Analyze Impact</button>
        </div>
        <div id="impactOutput" style="margin-top: 16px; line-height: 1.6;"></div>
      </div>
    </div>
  </main>

  <script>
    let appData = null;

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
      if (name === 'graph' && appData) renderGraph();
    }

    async function fetchData() {
      try {
        const res = await fetch('/api/overview');
        appData = await res.json();
        document.getElementById('repoPill').innerText = appData.repository.path;
        renderOverview();
        renderFiles();
        renderArchitecture();
        renderSecurity();
        renderHotspots();
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
    }

    function renderOverview() {
      document.getElementById('ovHealthScore').innerText = appData.dependencyHealth.healthScore + ' / 100';
      document.getElementById('ovHealthStatus').innerText = 'Status: ' + appData.dependencyHealth.status.toUpperCase();
      document.getElementById('ovSecurityGrade').innerText = appData.security ? appData.security.summary.grade : 'A';
      document.getElementById('ovSecuritySub').innerText = (appData.security ? appData.security.findings.length : 0) + ' finding(s)';
      document.getElementById('ovTotalFiles').innerText = appData.repository.scannedFiles;
      document.getElementById('ovTotalSymbols').innerText = appData.analysis.metrics.symbolCount + ' symbols';
      document.getElementById('ovCycles').innerText = appData.dependencyHealth.circularDependencyCount;

      const recContainer = document.getElementById('ovRecommendations');
      if (appData.recommendations && appData.recommendations.length > 0) {
        recContainer.innerHTML = appData.recommendations.map(r => 
          '<div style="margin-bottom:8px;"><strong>[' + r.priority.toUpperCase() + '] ' + r.title + ':</strong> ' + r.description + '</div>'
        ).join('');
      } else {
        recContainer.innerHTML = '<div>No critical architectural improvements required. Repository is healthy!</div>';
      }
    }

    function renderFiles() {
      const q = (document.getElementById('fileFilter').value || '').toLowerCase();
      const files = (appData.analysis.metrics.files || []).filter(f => f.filePath.toLowerCase().includes(q));
      const tbody = document.querySelector('#filesTable tbody');
      tbody.innerHTML = files.map(f =>
        '<tr><td>' + f.filePath + '</td><td>' + (f.layer || 'app') + '</td><td>' + f.symbolCount + '</td><td>' + f.importCount + '</td><td>' + f.callCount + '</td></tr>'
      ).join('');
    }

    function renderArchitecture() {
      const arch = appData.architecture;
      const layersContainer = document.getElementById('archLayersList');
      layersContainer.innerHTML = (arch.layers || []).map(l =>
        '<div class="card" style="padding:12px;"><strong>' + l.layer.toUpperCase() + '</strong><div style="font-size:1.5rem;font-weight:700;">' + l.fileCount + '</div><div class="sub">files in layer</div></div>'
      ).join('');

      const depsTbody = document.querySelector('#archDepsTable tbody');
      depsTbody.innerHTML = (arch.layerDependencies || []).map(d =>
        '<tr><td>' + d.sourceLayer + '</td><td>' + d.targetLayer + '</td><td>' + d.edgeCount + '</td></tr>'
      ).join('');
    }

    function renderSecurity() {
      const findings = (appData.security ? appData.security.findings : []) || [];
      const tbody = document.querySelector('#securityTable tbody');
      tbody.innerHTML = findings.map(f =>
        '<tr><td><span class="badge badge-' + f.severity + '">' + f.severity.toUpperCase() + '</span></td><td>' + f.title + '</td><td>' + f.category + '</td><td>' + f.filePath + '</td><td>' + (f.cwe || 'N/A') + '</td></tr>'
      ).join('');
    }

    function renderHotspots() {
      const hotspots = (appData.hotspots ? appData.hotspots.topHotspots : []) || [];
      const tbody = document.querySelector('#hotspotsTable tbody');
      tbody.innerHTML = hotspots.map((h, i) =>
        '<tr><td>#' + (i + 1) + '</td><td><span class="badge badge-' + h.riskTier + '">' + h.riskTier.toUpperCase() + '</span></td><td>' + h.filePath + '</td><td><strong>' + h.score + '</strong> / 100</td><td>' + h.fanIn + ' in / ' + h.fanOut + ' out</td></tr>'
      ).join('');
    }

    function renderGraph() {
      const svg = document.getElementById('depSvg');
      svg.innerHTML = '';
      const nodes = appData.analysis.dependencyGraph.nodes || [];
      const edges = appData.analysis.dependencyGraph.edges || [];

      const count = Math.min(24, nodes.length);
      const radius = 180;
      const cx = svg.clientWidth / 2 || 350;
      const cy = 250;

      const nodeCoords = new Map();
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        nodeCoords.set(nodes[i].id, { x, y, name: nodes[i].filePath.split('/').pop() });
      }

      edges.forEach(e => {
        const s = nodeCoords.get(e.source);
        const t = nodeCoords.get(e.target);
        if (s && t) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', s.x);
          line.setAttribute('y1', s.y);
          line.setAttribute('x2', t.x);
          line.setAttribute('y2', t.y);
          line.setAttribute('stroke', '#334155');
          line.setAttribute('stroke-width', '1.5');
          svg.appendChild(line);
        }
      });

      nodeCoords.forEach((val, id) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', val.x);
        circle.setAttribute('cy', val.y);
        circle.setAttribute('r', '8');
        circle.setAttribute('fill', '#3b82f6');
        svg.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', val.x + 10);
        text.setAttribute('y', val.y + 4);
        text.textContent = val.name;
        svg.appendChild(text);
      });
    }

    async function runImpact() {
      const file = document.getElementById('impactFile').value.trim();
      if (!file) return;
      const res = await fetch('/api/impact?file=' + encodeURIComponent(file));
      const data = await res.json();
      const out = document.getElementById('impactOutput');
      out.innerHTML = '<div><strong>Target:</strong> ' + data.impact.changedFile + '</div>' +
        '<div><strong>Total Affected:</strong> ' + data.impact.totalAffected + '</div>' +
        '<div><strong>Impact Depth:</strong> ' + data.impact.impactDepth + '</div>' +
        '<div style="margin-top:8px;"><strong>Explanations:</strong>' +
        (data.impact.explanations || []).map(e => '<div>• [Depth ' + e.depth + '] ' + e.filePath + ': ' + e.explanation + '</div>').join('') +
        '</div>';
    }

    window.onload = fetchData;
  </script>
</body>
</html>`;
}
