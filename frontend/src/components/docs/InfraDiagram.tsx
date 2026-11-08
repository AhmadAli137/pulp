/* Request flow and deployment, as a small SVG. No hosts, IPs or keys. */
type Box = { x: number; y: number; w: number; h: number; title: string; lines: string[]; kind: 'edge' | 'app' | 'ext' | 'store' | 'ci' }

const BOXES: Box[] = [
  { x: 16, y: 70, w: 150, h: 70, title: 'Browser', lines: ['web app, SSE, WebSocket'], kind: 'edge' },
  { x: 206, y: 70, w: 160, h: 70, title: 'Caddy', lines: ['automatic HTTPS', 'askpulp.com'], kind: 'edge' },
  { x: 406, y: 30, w: 300, h: 160, title: 'Docker container: FastAPI', lines: ['/api routes and SSE streams', 'voice relay (WebSocket)', 'built web app (static files)', 'Engine: pandas, numpy', 'Agents: Google ADK'], kind: 'app' },
  { x: 750, y: 30, w: 230, h: 70, title: 'Gemini API', lines: ['3.5 Flash: model roles', '3.8 Live: native audio'], kind: 'ext' },
  { x: 750, y: 120, w: 230, h: 70, title: 'Vultr Serverless Inference', lines: ['optional fallback provider'], kind: 'ext' },
  { x: 406, y: 226, w: 140, h: 62, title: 'data/', lines: ['PKDD’99 CSVs, mounted'], kind: 'store' },
  { x: 566, y: 226, w: 140, h: 62, title: 'Context storage', lines: ['JSON files or KV'], kind: 'store' },
  { x: 16, y: 226, w: 350, h: 62, title: 'GitHub Actions', lines: ['push to master: tests, build, then SSH deploy (docker compose up --build)'], kind: 'ci' },
]

export function InfraDiagram() {
  return (
    <figure className="docs-figure">
      <div className="docs-diagram-scroll" tabIndex={0} aria-label="Infrastructure diagram, scrolls sideways on small screens">
        <svg className="docs-flow docs-infra" viewBox="0 0 1000 310" role="img" aria-labelledby="infra-title infra-desc">
          <title id="infra-title">Request flow and deployment</title>
          <desc id="infra-desc">The browser talks to Caddy over HTTPS. Caddy proxies to one Docker container running FastAPI, which serves the API,
            the server-sent event streams, the voice WebSocket relay and the built web app. The engine and agents run inside it and call the
            Gemini API, with Vultr Serverless Inference as an optional fallback. Data CSVs are mounted into the container; context is stored in
            JSON files or a key-value store. GitHub Actions tests every push to master and redeploys over SSH.</desc>
          <defs>
            <marker id="infra-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="docs-arrowhead" />
            </marker>
          </defs>
          {[
            'M 166 105 L 206 105', 'M 366 105 L 406 105', 'M 706 65 L 750 65', 'M 706 155 L 750 155',
            'M 476 226 L 476 190', 'M 636 226 L 636 190', 'M 366 257 C 390 257, 390 160, 406 160',
          ].map((d) => <path key={d} d={d} className="docs-edge" markerEnd="url(#infra-arrow)" />)}
          {BOXES.map((b) => (
            <g key={b.title} className={`docs-infra-box ${b.kind}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
              <text x={b.x + 12} y={b.y + 22} className="docs-node-name">{b.title}</text>
              {b.lines.map((l, i) => <text key={l} x={b.x + 12} y={b.y + 40 + i * 17} className="docs-node-sub">{l}</text>)}
            </g>
          ))}
        </svg>
      </div>
    </figure>
  )
}
