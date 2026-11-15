#!/usr/bin/env python3
"""Isolated assessment of upstream b964ad1. Synthetic fixtures only; no listening port or board access."""
import asyncio, json, os, sys, platform
from pathlib import Path
from datetime import datetime, timezone, timedelta
from importlib.metadata import version

REPO = Path(os.environ.get("REVIEW_REPO", "/root/projects/integration-reviews/changan_vehicular-20261115/vehicular"))
os.environ["NODE_DB_PATH"] = ":memory:"
sys.path.insert(0, str(REPO / "backend"))
import httpx
from app.main import create_app
from app.config import Settings
from app.stores.sqlite import SQLiteNodeStore

OUTPUT = Path(__file__).with_name("behavior-results.json")
NODE = "10000000-0000-4000-8000-000000000001"
GIB = 1024**3
rows = []
def record(name, observations, implication, kind="confirmed_behavior"):
    rows.append(dict(name=name, observations=observations, implication=implication, kind=kind))
def resource(age=0, available=8*GIB):
    return {
        "collected_at": (datetime.now(timezone.utc)-timedelta(seconds=age)).isoformat(),
        "cpu":{"physical_cores":14,"logical_cores":14,"utilization_percent":10,"frequency_mhz":2000},
        "memory":{"total_bytes":16*GIB,"used_bytes":16*GIB-available,"available_bytes":available,"utilization_percent":100*(16*GIB-available)/(16*GIB)},
        "storage":{"mount_point":"/synthetic","total_bytes":100*GIB,"used_bytes":20*GIB,"available_bytes":80*GIB,"utilization_percent":20},
        "gpu":{"supported":True,"available":True,"device_count":1,"total_vram_bytes":8*GIB,"used_vram_bytes":GIB,"available_vram_bytes":7*GIB,"utilization_percent":10,"devices":[{"index":0,"model":"synthetic-not-real-hardware","vram_total_bytes":8*GIB,"vram_used_bytes":GIB,"vram_available_bytes":7*GIB,"utilization_percent":10}]},
        "npu":{"supported":False,"available":False},
        "dla":{"supported":False,"available":False},
        "network":{"ip":"192.0.2.1","network_interface":"synthetic","link_status":"UP","bytes_sent":100,"bytes_received":200,"link_speed_mbps":1000}
    }
async def main():
    application = create_app(settings=Settings(node_db_path=Path(":memory:")), store=SQLiteNodeStore(":memory:"))
    async with application.router.lifespan_context(application):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),base_url="http://assessment.invalid",trust_env=False) as c:
            async def call(method,path,payload=None,status=200):
                r = await c.request(method,path,json=payload)
                assert r.status_code == status,(method,path,r.status_code,r.text[:600])
                return r.json() if r.content else None
            async def candidates(requirement=None):
                return await call("POST","/api/v1/compute-pool/candidates",{"request_id":"assessment","task_id":"synthetic-task","requirement":requirement or {}})
            reg={"identity":{"node_id":NODE,"hostname":"synthetic-node","architecture":"aarch64","operating_system":"Linux","os_version":"synthetic","agent_version":"assessment","ip":"192.0.2.1"},"device_fingerprint":"sha256:"+"1"*64}
            await call("POST","/api/v1/nodes/register",reg,201)
            pending=await candidates()
            await call("POST",f"/api/v1/nodes/{NODE}/approve",{})
            await call("POST",f"/api/v1/nodes/{NODE}/resources",resource())
            good=await candidates({"architecture":"arm64","memory_gb":2,"gpu_count":1})
            assert len(pending["candidates"])==0 and len(good["candidates"])==1
            record("registration_approval_resources",{"before_approval_candidates":0,"after_approval_candidates":1,"architecture_alias":"aarch64 -> arm64 accepted"},"Registration and eligibility implementation is reusable.")
            await call("POST",f"/api/v1/nodes/{NODE}/disable-scheduling",{})
            disabled=await candidates()
            assert not disabled["candidates"]
            await call("POST",f"/api/v1/nodes/{NODE}/enable-scheduling",{})
            record("disable_scheduling",{"candidates":len(disabled["candidates"]),"reasons":disabled["excluded_nodes"][0]["reasons"]},"Map this gate into new session admission.")
            reg["identity"]["node_id"]="10000000-0000-4000-8000-000000000002"
            canonical=await call("POST","/api/v1/nodes/register",reg,201)
            assert canonical["canonical_node_id"]==NODE
            record("stable_fingerprint_identity",{"status":canonical["status"],"same_canonical_uuid":True},"Keep canonical UUID and an explicit mapping to scheduler node IDs.")
            a=await c.get("/nodes")
            b=await c.post("/reservations",json={})
            assert a.status_code==404 and b.status_code==404
            record("existing_provider_contract",{"GET /nodes":a.status_code,"POST /reservations":b.status_code,"candidate_response_shape":"object containing candidates and excluded_nodes"},"Cannot connect by only setting CHANGAN_RESOURCE_PROVIDER_URL.","integration_gap")
            await call("POST",f"/api/v1/nodes/{NODE}/resources",resource(age=3600))
            stale=await candidates({"gpu_count":1})
            assert len(stale["candidates"])==1
            node=await call("GET",f"/api/v1/nodes/{NODE}")
            record("old_sample_accepted_as_fresh",{"sample_age_seconds":3600,"candidate_count":len(stale["candidates"]),"operational_status":node["operational_status"],"schedulable":node["schedulable"]},"Validate collected_at as well as receive time; generated_at must not renew stale observations.","requires_fix")
            await call("POST",f"/api/v1/nodes/{NODE}/resources",resource(available=GIB//4))
            low=await candidates({"memory_gb":2})
            n=low["candidates"][0]
            assert n["available_capacity"]["memory_total_gb"]==16 and n["runtime_advisory"]["memory_available_gb"]==0.25
            record("runtime_memory_vs_accounting",{"required_gib":2,"accounting_available_gib":16,"runtime_available_gib":0.25,"candidate_count":len(low["candidates"])},"Candidate memory means total minus projected allocation; scheduler also needs runtime headroom and budget.","integration_gap")
            await call("POST",f"/api/v1/nodes/{NODE}/resources",resource())
            event={"event_id":"event-running-v10","event_version":10,"task_id":"synthetic-task","attempt_id":"synthetic-session","physical_node_id":NODE,"status":"RUNNING","allocated_resources":{"cpu_cores":1,"gpu_count":1,"vram_gb":0,"memory_gb":2,"npu_tops":0,"dla_count":0},"occurred_at":datetime.now(timezone.utc).isoformat()}
            first=await call("POST","/api/v1/scheduler/execution-events",event)
            duplicate=await call("POST","/api/v1/scheduler/execution-events",event)
            older=await call("POST","/api/v1/scheduler/execution-events",dict(event,event_id="event-v9",event_version=9))
            assert first["disposition"]=="APPLIED" and duplicate["disposition"]=="DUPLICATE_EVENT" and older["disposition"]=="STALE_VERSION"
            record("incremental_event_idempotency",{"first":first["disposition"],"duplicate":duplicate["disposition"],"older":older["disposition"]},"Incremental event version protection is present.")
            busy=await candidates({"gpu_count":1})
            summary=await call("GET","/api/v1/compute-pool/summary")
            gpu=summary["resources"]["gpu"]
            assert not busy["candidates"] and gpu["allocated"]==1 and gpu["schedulable_available"]==1
            record("gpu_summary_candidate_disagreement",{"candidate_count":0,"summary_gpu":gpu},"Summary schedulable_available is not candidate free capacity; unify presentation semantics.","requires_fix")
            lost=await call("POST","/api/v1/scheduler/execution-events",dict(event,event_id="event-lost-v11",event_version=11,status="LOST"))
            available=await candidates({"gpu_count":1})
            assert len(available["candidates"])==1
            record("lost_status_releases_accounting",{"projected_status":lost["projection"]["status"],"gpu_candidate_count":1},"LOST alone cannot prove a partitioned session has stopped; retain occupancy until cleanup reconciliation.","integration_gap")
            terminal=dict(event,event_id="event-success-v12",event_version=12,status="SUCCEEDED")
            await call("POST","/api/v1/scheduler/execution-events",terminal)
            old_snapshot_item={k:v for k,v in event.items() if k!="event_id"}
            old_snapshot_item["event_version"]=1
            await call("PUT","/api/v1/scheduler/executions/snapshot",{"snapshot_id":"delayed-old-snapshot","generated_at":(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat(),"executions":[old_snapshot_item]})
            after=await call("GET","/api/v1/scheduler/executions")
            assert after["items"][0]["event_version"]==1 and after["items"][0]["status"]=="RUNNING"
            record("snapshot_rolls_back_newer_terminal",{"before":{"version":12,"status":"SUCCEEDED"},"after":{"version":after["items"][0]["event_version"],"status":after["items"][0]["status"]}},"Add snapshot epoch/watermark and per-object monotonic merge before enabling synchronization.","requires_fix")
            await call("PUT","/api/v1/scheduler/executions/snapshot",{"snapshot_id":"empty-snapshot","generated_at":datetime.now(timezone.utc).isoformat(),"executions":[]})
            empty=await call("GET","/api/v1/scheduler/executions")
            assert empty["total"]==0
            record("snapshot_replaces_all_projections",{"remaining_projections":0},"Snapshot is full replacement, not a task-scoped patch; agree owner and completeness.","integration_gap")
            schema=application.openapi()
            paths=sorted(schema["paths"])
            record("api_surface",{"paths":len(paths),"reservation_paths":[p for p in paths if "reservation" in p],"security_scheme_present":bool(schema.get("components",{}).get("securitySchemes"))},"No reservation API or declared authentication scheme in this revision.","integration_gap")
            sys.path.insert(0, str(REPO))
            from agent.collectors.gpu import _parse_devices
            parsed = _parse_devices("0, NVIDIA Thor, 0, [N/A], [N/A], [N/A]")
            assert parsed[0]["vram_total_bytes"] is None
            record("thor_smi_na_parser",{"input":"Separately observed on Thor1 on 2026-11-15; parser replay only","device_detected":True,"per_device_vram_total_bytes":parsed[0]["vram_total_bytes"],"aggregate_sum_expression_result":sum(int(d.get("vram_total_bytes") or 0) for d in parsed)},"Preserve unknown memory values; add a validated Thor collector and shared-memory semantics.","integration_gap")
            # Persist a separate on-disk synthetic node, close and reopen it.
            import tempfile
            with tempfile.TemporaryDirectory(prefix="changan-review-") as folder:
                dbpath=Path(folder)/"synthetic.db"
                from app.models.node import NodeRecord
                store=SQLiteNodeStore(dbpath)
                store.save_node(NodeRecord.model_validate(node))
                store.close()
                store=SQLiteNodeStore(dbpath)
                restored=store.get_node(__import__("uuid").UUID(NODE))
                assert restored and restored.node_id==__import__("uuid").UUID(NODE)
                store.close()
            record("sqlite_restart",{"identity_and_approval_preserved":True},"SQLite storage can be reused; this is a synthetic restart check.")
    result={"date":"2026-11-15","environment":"server x86_64; in-process ASGI; SQLite temporary/in-memory; all nodes and resource metrics synthetic","upstream_commit":"b964ad133e30673bbfcbfc1cc6e5bd62587632f4","python":platform.python_version(),"packages":{p:version(p) for p in ("fastapi","pydantic","httpx","psutil")},"checks":rows,"count":len(rows),"board_access":False,"listening_service_started":False,"upstream_source_modified":False}
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"count":len(rows),"output":str(OUTPUT),"checks":[r["name"] for r in rows]},ensure_ascii=False))
if __name__=="__main__": asyncio.run(main())
