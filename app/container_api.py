"""Internal gateway: session/attempt-scoped routes, no management endpoints."""
from fastapi import FastAPI
from .engine import Engine
from .container_execution import router
engine=Engine()
app=FastAPI(title='Container result gateway',docs_url=None,redoc_url=None,openapi_url=None)
app.include_router(router)
@app.get('/health')
def health():return {'status':'ok','service':'container-gateway'}

from .session_execution import router as session_router
app.include_router(session_router)

# Node Agents on the execution LAN report through this gateway; only the three
# reporting routes are forwarded to the management API, never management actions.
import os, re
import httpx
from fastapi import Request, Response
AGENT_REPORT = re.compile(r'^(register|[0-9a-fA-F-]{36}/(heartbeat|resources))$')
_api = os.getenv('CHANGAN_API_INTERNAL_URL', 'http://127.0.0.1:' + os.getenv('CHANGAN_PORT', '8310')).rstrip('/')
_forward = httpx.AsyncClient(timeout=5, trust_env=False)

@app.post('/api/v1/nodes/{path:path}')
async def agent_report(path: str, request: Request):
    if not AGENT_REPORT.match(path):
        return Response(status_code=404)
    headers = {k: v for k, v in request.headers.items() if k.lower() in ('content-type', 'x-pool-agent-token', 'user-agent')}
    try:
        r = await _forward.post(_api + '/api/v1/nodes/' + path, content=await request.body(), headers=headers)
    except httpx.HTTPError:
        return Response('{"detail":"管理平台暂不可用"}', status_code=503, media_type='application/json')
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get('content-type'))
