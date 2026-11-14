import statistics

OWNER = {
    'work': dict(total=178, open=50, done=126, cancelled=2, projects=6, tags=39, tagLinks=278, attachments=108, descriptionChars=222312, descriptionMedian=1260, descriptionMax=5244, keepExternal=90),
    'personal': dict(total=92, open=49, done=43, cancelled=0, projects=4, tags=28, tagLinks=95, attachments=31, descriptionChars=57764, descriptionMedian=470, descriptionMax=3615, keepExternal=30),
}

def description_lengths(shape):
    count, middle, maximum, total = (shape[key] for key in ['total','descriptionMedian','descriptionMax','descriptionChars'])
    if (total-maximum)/(count-1) >= middle:
        fixed=count//2+1
        values=[middle]*fixed
        remaining=count-fixed-1
        q,r=divmod(total-maximum-sum(values),remaining)
        values += [q+1]*r+[q]*(remaining-r)
    else:
        fixed=count//2
        remaining=count-fixed-1
        q,r=divmod(total-maximum-fixed*middle,remaining)
        values=[q+1]*r+[q]*(remaining-r)+[middle]*fixed
    values.append(maximum)
    assert len(values)==count and sum(values)==total and statistics.median(values)==middle and max(values)==maximum
    return values

def owner_items(profile, dependencies=False):
    shape=OWNER[profile]
    lengths=description_lengths(shape)
    prose='Planning notes for the scratch workload. Review the linked source and the next concrete action.\n'
    items=[]
    for i,length in enumerate(lengths):
        status='open' if i < shape['open'] else 'done' if i < shape['open']+shape['done'] else 'cancelled'
        names=[f'Tag {i%shape["tags"]:02}']
        if i < shape['tagLinks']-shape['total']: names.append(f'Tag {(i+13)%shape["tags"]:02}')
        item=dict(external_id=f'perf-{i}',title=f'Measurement Task {i:03}',description=(prose*(length//len(prose)+1))[:length],priority=['P1','P2','P3','P4'][i%4],project_name=f'Project {i%shape["projects"]:02}',tag_names=names,energy=i%5+1,estimate_min=25,status=status)
        if i < shape['attachments']:
            item['attachments']=[dict(kind='link',url=f'https://example.invalid/scratch/{profile}/reference/{i:03}',label=f'Source reference {i:03}',name=f'Reference {i:03}')]
        if dependencies and profile=='personal' and i==0: item['depends_on']=[f'perf-{j}' for j in range(1,5)]
        items.append(item)
    assert sum(len(item['tag_names']) for item in items)==shape['tagLinks']
    return items

def default_items():
    return [dict(external_id=f'default-{i}',title=f'Default Task {i:03}',description='Ordinary scratch note.',project_name=f'Default Project {i%2}',tag_names=[f'Default Tag {i%8}']) for i in range(11)]

def witness(tasks):
    lengths=[len(task.get('description') or '') for task in tasks]
    return dict(total=len(tasks),open=sum(task['status']=='open' for task in tasks),done=sum(task['status']=='done' for task in tasks),cancelled=sum(task['status']=='cancelled' for task in tasks),tagLinks=sum(len(task['tags']) for task in tasks),attachments=sum(len(task.get('attachments') or []) for task in tasks),descriptionChars=sum(lengths),descriptionMedian=statistics.median(lengths),descriptionMax=max(lengths),externalIds=sum(task.get('external_id') is not None for task in tasks))

def finish_owner_fixture(execute, request, cli, scratch, env, label):
    import json
    for profile in OWNER:
        tasks=sorted(request('GET',f'/profiles/{profile}/tasks'),key=lambda task:task['title'])
        for task in tasks[OWNER[profile]['keepExternal']:]:
            request('PATCH',f"/profiles/{profile}/tasks/{task['id']}",{'from_version':task['row_version'],'changes':{'external_id':None}})
    execute([cli,'login','--password-stdin','--profile','default','--format','json'],'login-default-'+label,env=env,input='scratch verification passphrase\n')
    path=scratch/'default.json';path.write_text(json.dumps(default_items()))
    execute([cli,'import',path,'--profile','default','--format','json'],'import-default-'+label,env=env)
    for name in ['extra-a','extra-b','deleted-a','deleted-b']:
        execute([cli,'init','--profile',name,'--format','json'],'init-'+name+'-'+label,env=env)
    for name in ['deleted-a','deleted-b']:
        execute([cli,'profile','delete',name,'--profile','work','--format','json'],'delete-'+name+'-'+label,env=env)
    assert len(request('GET','/profiles'))==5
    result={}
    for profile,shape in OWNER.items():
        tasks=request('GET',f'/profiles/{profile}/tasks')
        observed=witness(tasks)
        for key in ['total','open','done','cancelled','tagLinks','attachments','descriptionChars','descriptionMedian','descriptionMax']:
            assert observed[key]==shape[key],(profile,key,observed[key],shape[key])
        assert observed['externalIds']==shape['keepExternal']
        assert len(request('GET',f'/profiles/{profile}/projects'))==shape['projects']
        assert len(request('GET',f'/profiles/{profile}/tags'))==shape['tags']
        text=execute([cli,'list','--profile',profile,'--format','json'],'list-shape-'+profile+'-'+label,env=env)
        json.loads(text)
        observed['cliReplyBytes']=len(text.encode())
        observed['httpReplyBytes']=len(json.dumps(tasks,separators=(',',':')).encode())
        observed['edges']=sum(len(task.get('depends_on') or []) for task in tasks)
        result[profile]=observed
    return result
