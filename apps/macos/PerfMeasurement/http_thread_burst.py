import concurrent.futures
import http.client
import json
import socket
import threading
import time
import uuid

def run(port,paths,credential,validate):
    released={}
    barrier=threading.Barrier(len(paths),action=lambda:released.update(at=time.time()*1000))
    def read(item):
        path,queued=item
        row=dict(id=str(uuid.uuid4()),path=path,status=0,bytes=0,decodeMS=0,queuedMS=queued,threadEnteredMS=time.time()*1000)
        barrier.wait(timeout=60)
        row['releasedMS']=released['at']
        began=time.monotonic()
        connection=http.client.HTTPConnection('127.0.0.1',port,timeout=180)
        try:
            row['beforeSocketMS']=time.time()*1000
            connection.connect()
            row['connectEndMS']=time.time()*1000
            connection.request('GET',path,headers={'authorization':'Bearer '+credential,'X-Mac-Perf-ID':row['id']})
            row['requestEndMS']=time.time()*1000
            if not connection.sock.recv(1,socket.MSG_PEEK): raise ConnectionError('EOF before response')
            row['responseStartMS']=time.time()*1000
            response=connection.getresponse()
            row['headersEndMS']=time.time()*1000
            row['status']=response.status
            body=response.read()
            row.update(responseEndMS=time.time()*1000,elapsedMS=(time.monotonic()-began)*1000,bytes=len(body))
            decode=time.monotonic();value=json.loads(body)
            row['decodeMS']=(time.monotonic()-decode)*1000
            row['decodeEndMS']=time.time()*1000
            validate(row,value)
        except Exception as error: row.update(error=repr(error),elapsedMS=(time.monotonic()-began)*1000)
        finally: connection.close()
        return row
    begin=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(paths)) as pool:
        futures=[pool.submit(read,(path,time.time()*1000)) for path in paths]
        rows=[future.result() for future in futures]
    return rows,(time.monotonic()-begin)*1000,0
