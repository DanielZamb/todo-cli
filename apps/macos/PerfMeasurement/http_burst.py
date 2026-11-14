import asyncio
import json
import time
import uuid

async def burst(port, paths, credential):
    connections=[]
    setup=time.monotonic()
    try:
        for _ in paths:
            start=time.time()*1000
            reader,writer=await asyncio.wait_for(asyncio.open_connection('127.0.0.1',port),timeout=60)
            connections.append((reader,writer,start,time.time()*1000))
        setup_ms=(time.monotonic()-setup)*1000
        ready=asyncio.Event()
        async def read(path,connection):
            reader,writer,connect_start,connect_end=connection
            await ready.wait()
            began=time.monotonic()
            row=dict(id=str(uuid.uuid4()),path=path,status=0,bytes=0,decodeMS=0,beforeSocketMS=connect_start,connectEndMS=connect_end)
            try:
                async with asyncio.timeout(180):
                    request=f'GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {credential}\r\nX-Mac-Perf-ID: {row["id"]}\r\nConnection: close\r\n\r\n'
                    row['requestStartMS']=time.time()*1000
                    writer.write(request.encode());await writer.drain()
                    row['requestEndMS']=time.time()*1000
                    first=await reader.readexactly(1)
                    row['responseStartMS']=time.time()*1000
                    head=first+await reader.readuntil(b'\r\n\r\n')
                    row['headersEndMS']=time.time()*1000
                    lines=head.decode('iso-8859-1').split('\r\n')
                    row['status']=int(lines[0].split()[1])
                    headers={key.lower():value.strip() for line in lines[1:] if ':' in line for key,value in [line.split(':',1)]}
                    if 'chunked' in headers.get('transfer-encoding','').lower():
                        parts=[]
                        while True:
                            size=int((await reader.readline()).split(b';')[0],16)
                            if not size:
                                while await reader.readline() not in [b'\r\n',b'\n',b'']: pass
                                break
                            parts.append(await reader.readexactly(size))
                            assert await reader.readexactly(2)==b'\r\n'
                        body=b''.join(parts)
                    elif 'content-length' in headers: body=await reader.readexactly(int(headers['content-length']))
                    else: body=await reader.read()
                    row.update(elapsedMS=(time.monotonic()-began)*1000,bytes=len(body),responseEndMS=time.time()*1000)
                    return row,body
            except Exception as error:
                row.update(elapsedMS=(time.monotonic()-began)*1000,error=repr(error))
                return row,b''
        tasks=[asyncio.create_task(read(path,connection)) for path,connection in zip(paths,connections)]
        began=time.monotonic();ready.set()
        values=await asyncio.gather(*tasks)
        wall_ms=(time.monotonic()-began)*1000
        return values,wall_ms,setup_ms
    finally:
        for _,writer,_,_ in connections: writer.close()
        await asyncio.gather(*(writer.wait_closed() for _,writer,_,_ in connections),return_exceptions=True)

def run(port,paths,credential,validate):
    values,wall,setup=asyncio.run(burst(port,paths,credential))
    rows=[]
    for row,body in values:
        if 'error' not in row:
            began=time.monotonic()
            try:
                value=json.loads(body)
                row['decodeMS']=(time.monotonic()-began)*1000
                validate(row,value)
            except Exception as error: row['error']=repr(error)
        rows.append(row)
    return rows,wall,setup
