// SPDX-License-Identifier: AGPL-3.0-or-later
import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs'

// Local inputs may be untrusted downloads. Refuse devices, pipes, symlinks and
// oversized files before allocating memory or opening the chat transport.
export function readInput(path, limit) {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try {
    const stat=fstatSync(fd)
    if(!stat.isFile() || stat.size>limit)throw Error('input must be a bounded regular file')
    const buffer=Buffer.alloc(limit+1)
    let offset=0,n
    while(offset<buffer.length && (n=readSync(fd,buffer,offset,buffer.length-offset,null))>0)offset+=n
    if(offset>limit)throw Error('input exceeds size limit')
    return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,offset))
  }finally{closeSync(fd)}
}
