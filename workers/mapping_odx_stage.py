"""Pinned ODX 3.8.6 stage adapter, not an additional scheduler.
Uses upstream OSFMContext / splitmerge primitives (AGPL-3.0, WebODM/ODX
commit aff8287f42006e73a51264ebef1e54dede0de3b4). Upstream files stay unchanged.
Only preparation and merge intercept ODMSplitStage; no LocalRemoteExecutor.
All paths are inside the disposable Thor Job, identical across attempts.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/code")
from modules import config, log
from modules.osfm import OSFMContext
from stages.odm_app import ODMApp
from stages.splitmerge import ODMSplitStage
from opensfm.large import metadataset

ROOT = Path("/work/project")

def prepare(stage, args, outputs):
    tree, reconstruction = outputs["tree"], outputs["reconstruction"]
    if not reconstruction.has_geotagged_photos():
        raise ValueError("协同建图需要可用GPS照片；本版不接收任意image_groups文件")
    octx = OSFMContext(tree.opensfm)
    settings = [
        "submodels_relpath: ../submodels/opensfm",
        "submodel_relpath_template: ../submodels/submodel_%04d/opensfm",
        "submodel_images_relpath_template: ../submodels/submodel_%04d/images",
        "submodel_size: %s" % args.split,
        "submodel_overlap: %s" % args.split_overlap,
    ]
    octx.setup(args, tree.dataset_raw, reconstruction.photos, reconstruction=reconstruction, append_config=settings, rerun=False)
    octx.photos_to_metadata(reconstruction.photos, args.rolling_shutter, args.rolling_shutter_readout, args.gps_accuracy, False)
    # Matching deliberately happens in the independently scheduled reconstruction Jobs.
    octx.run("create_submodels")
    paths = sorted(Path(p).resolve() for p in metadataset.MetaDataSet(tree.opensfm).get_submodel_paths())
    if not 2 <= len(paths) <= 8:
        raise ValueError("空间分组得到%s个子模型，本版要求2～8个；请调整每组照片数" % len(paths))
    groups = []
    for sp in paths:
        images = sorted(p.name for p in (sp.parent / "images").iterdir() if p.is_file())
        if len(images) < 3:
            raise ValueError("子模型照片不足3张：" + sp.parent.name)
        groups.append({"id": sp.parent.name, "images": images})
    all_images = {p.filename for p in reconstruction.photos}
    if set().union(*(set(g["images"]) for g in groups)) != all_images:
        raise ValueError("空间分组未完整覆盖输入照片")
    edges = []
    for i, a in enumerate(groups):
        for b in groups[i+1:]:
            shared = sorted(set(a["images"]) & set(b["images"]))
            if set(a["images"]) == set(b["images"]):
                raise ValueError("重叠范围过大，子模型完全重复；请减小重叠半径")
            if len(shared) >= 3:
                edges.append({"source": a["id"], "target": b["id"], "images": shared})
    seen = {groups[0]["id"]}
    for _ in groups:
        for e in edges:
            if seen & {e["source"], e["target"]}: seen.update([e["source"], e["target"]])
    if len(seen) != len(groups):
        raise ValueError("子模型共同照片图不连通（每条连接至少3张）；请增加重叠半径")
    plan = {"version": 1, "submodels": groups, "overlap_edges": edges, "images": sorted(all_images), "split_size": args.split, "overlap_m": args.split_overlap}
    (ROOT / "plan.json").write_text(json.dumps(plan))
    stage.next_stage = None


def merge(stage, args, outputs):
    # Original ODMMergeStage follows immediately; it receives validated submodels.
    outputs["large"] = True


def main():
    phase = os.environ["CHANGAN_MAPPING_PHASE"]
    if phase == "align":
        plan = json.loads((ROOT / "plan.json").read_text())
        octx = OSFMContext(str(ROOT / "opensfm"))
        octx.align_reconstructions(False)
        registered = {}
        for g in plan["submodels"]:
            sp = ROOT / "submodels" / g["id"] / "opensfm"
            aligned = sp / "reconstruction.aligned.json"
            if not aligned.is_file():
                raise ValueError("子模型没有对齐结果，拒绝部分成功：" + g["id"])
            recon = json.loads(aligned.read_text())
            shots = sorted({s for r in recon for s in r.get("shots", {})})
            if not shots or not set(shots) <= set(g["images"]):
                raise ValueError("无效对齐照片清单：" + g["id"])
            aligned.replace(sp / "reconstruction.json")
            registered[g["id"]] = shots
        reached = {plan["submodels"][0]["id"]}
        for _ in registered:
            for name, shots in registered.items():
                if any(len(set(shots) & set(registered[other])) >= 3 for other in reached): reached.add(name)
        if len(reached) != len(registered):
            raise ValueError("配准后的共同照片图不连通，拒绝发布不可靠对齐")
        (ROOT / "alignment.json").write_text(json.dumps({"submodels": registered}))
        return
    if phase in ("prepare", "merge"):
        ODMSplitStage.process = prepare if phase == "prepare" else merge
    args = config.config()
    args.project_path = os.path.join(args.project_path, args.name)
    code = ODMApp(args).execute()
    if code: raise SystemExit(code)

if __name__ == "__main__": main()
