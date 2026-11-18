"""Activate a verified Mac release after quiescence. Intended for an operator;
refuses live tasks/unclean attempts, preserves existing DBs, restores service on error.
Back up control/pool SQLite before a schema change independently of this command.
"""
import argparse,hashlib,json,os,re,sqlite3,subprocess,sys,tarfile,time,urllib.request
from pathlib import Path


def activate(root,archive,image):
    if not re.fullmatch(r'[^@\s]+@sha256:[0-9a-f]{64}',image):raise ValueError('需要完整镜像摘要')
    root=root.resolve();cur=root/'current';old=cur.resolve();envfile=root/'config/platform.env';old_env=envfile.read_text();env=dict(os.environ,CHANGAN_SKIP_REDIS='1')
    def manage(p,*args):subprocess.run([sys.executable,str(p/'scripts/manage.py'),*args],env=env,check=True)
    def switch(path):
        tmp=root/('.activate-'+str(os.getpid()));tmp.symlink_to(path.relative_to(root));tmp.replace(cur)
    def quiescent():
        with sqlite3.connect(f'file:{root}/data/control.sqlite?mode=ro',uri=True) as c:
            for table,where in [('tasks',"status NOT IN ('SUCCEEDED','FAILED','CANCELED','TIMED_OUT')"),('attempts',"cleanup_state!='DONE'"),('execution_sessions',"cleanup_state!='DONE'")]:
                if c.execute('SELECT 1 FROM '+table+' WHERE '+where+' LIMIT 1').fetchone():raise RuntimeError('有在途任务或未清理资源，不切换：'+table)
    quiescent()
    with tarfile.open(archive) as t:
        data=json.load(t.extractfile('DEPLOYMENT.json'));commit=data['source_commit'];assert re.fullmatch('[0-9a-f]{40}',commit) and not data['working_tree_dirty']
        dest=root/'releases'/('mapping-'+commit[:12]);dest.mkdir(exist_ok=False);t.extractall(dest,filter='data')
    if not all(hashlib.sha256((dest/n).read_bytes()).hexdigest()==digest for n,digest in data['files'].items()):raise RuntimeError('发布包文件校验失败')
    (dest/'.env').symlink_to('../../config/platform.env');(dest/'logs').symlink_to('../../logs')
    manage(old,'stop','api','container-gateway')
    try:
        quiescent()
        lines=[line for line in old_env.splitlines() if not line.startswith('CHANGAN_MAPPING_COLLAB_IMAGE=')]
        lines=[('CHANGAN_ENVIRONMENT_NOTE=Mac原生管理；真实Thor K3s执行；视频会话、单节点建图与同图多节点协同按任务记录核验' if line.startswith('CHANGAN_ENVIRONMENT_NOTE=') else line) for line in lines]
        envfile.write_text('\n'.join(lines+['CHANGAN_MAPPING_COLLAB_IMAGE='+image])+'\n')
        switch(dest);manage(dest,'start');health=None
        for _ in range(25):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8310/health',timeout=2) as response:health=json.load(response)
                if health.get('status')=='ok':break
            except OSError:pass
            time.sleep(.5)
        if not health or health.get('status')!='ok':raise RuntimeError('管理端未通过健康检查')
        print(json.dumps({'release':str(dest),'commit':commit,'health':health},ensure_ascii=False))
    except BaseException:
        manage(dest,'stop','api','container-gateway');envfile.write_text(old_env);switch(old);manage(old,'start');raise

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('archive',type=Path);p.add_argument('image');a=p.parse_args();activate(a.root,a.archive,a.image)
