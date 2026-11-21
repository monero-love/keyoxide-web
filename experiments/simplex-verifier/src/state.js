// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, lstatSync, openSync, closeSync, fstatSync, readFileSync, writeFileSync, fsyncSync, existsSync, unlinkSync, constants } from 'node:fs'
import { join } from 'node:path'

function privateFile(stat) {
  if (!stat.isFile() || (stat.mode & 0o077) || stat.nlink !== 1 ||
      (process.getuid && stat.uid !== process.getuid())) throw Error('state file must be private and owned by this user')
}
export class Store {
  constructor(dir) {
    this.dir = dir
    mkdirSync(dir, {recursive:true,mode:0o700})
    const stat = lstatSync(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
        (process.getuid && stat.uid !== process.getuid())) throw Error('state directory must be owned by this user with mode 0700')
  }
  path(id) { if (!/^[a-f0-9]{64}$/.test(id)) throw Error('invalid challenge id'); return join(this.dir,id) }
  sync() {
    const fd=openSync(this.dir,'r')
    try { fsyncSync(fd) } finally { closeSync(fd) }
  }
  create(record) {
    const fd=openSync(this.path(record.id),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    try { writeFileSync(fd,JSON.stringify(record));fsyncSync(fd) } finally { closeSync(fd) }
    this.sync()
  }
  read(id) {
    const path=this.path(id)
    if (existsSync(path+'.used')) throw Error('EEXIST: challenge already used')
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
    try {
      const stat=fstatSync(fd)
      privateFile(stat)
      if(stat.size>2*1024*1024)throw Error('oversized state record')
      return JSON.parse(readFileSync(fd,'utf8'))
    } finally { closeSync(fd) }
  }
  consume(id) {
    const path=this.path(id)
    const fd=openSync(path+'.used',constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    try {fsyncSync(fd)} finally {closeSync(fd)}
    this.sync()
    // Keep only the nonce tombstone after an attempt, not the address/public key.
    try {unlinkSync(path)} catch(error) {if(error.code!=='ENOENT')throw error}
    this.sync()
  }
}
