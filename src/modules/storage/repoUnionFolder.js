import { makeUnionFolder, mapFiles, mapFolders } from 'disklet'

import { encrypt } from '../../util/crypto/crypto'
import { utf8 } from '../../util/encoding'
import { RepoFolder } from './repoFolder.js'

function removeDuplicates (master, fallback) {
  const blacklist = {}
  const out = []
  master.forEach(item => {
    if (/\._x_$/.test(item)) {
      blacklist[item] = true
    } else {
      blacklist[item + '._x_'] = true
      out.push(item)
    }
  })

  fallback.forEach(item => {
    if (!blacklist[item + '._x_']) out.push(item)
  })

  return out
}

/**
 * A file within a unionFolder.
 */
class RepoUnionFile {
  constructor (io, dataKey, master, fallback, whiteout) {
    this.io = io
    this.dataKey = dataKey
    this._master = master
    this._fallback = fallback
    this._whiteout = whiteout
  }

  delete () {
    return Promise.all([
      this._whiteout.setData([]),
      this._master.delete().catch(e => null)
    ])
  }

  getData () {
    return this.io.encryptedDisklet.getData(
      this._master.getPath(),
      this._fallback.getPath(),
      this._whiteout.getPath(),
      this.dataKey
    )
  }

  getText () {
    return this.io.encryptedDisklet.getText(
      this._master.getPath(),
      this._fallback.getPath(),
      this._whiteout.getPath(),
      this.dataKey
    )
  }

  setData (data) {
    return this._master.setText(
      JSON.stringify(encrypt(this.io, data, this.dataKey))
    )
  }

  setText (text) {
    return this.setData(utf8.parse(text))
  }
}

/**
 * Reads and writes go to a master folder, but if a read fails,
 * we will also try the fallback folder.
 */
class RepoUnionFolder {
  constructor (io, dataKey, master, fallback) {
    this.io = io
    this.dataKey = dataKey
    this._master = master
    this._fallback = fallback
  }

  delete () {
    return Promise.all([
      mapFiles(this, file => file.delete()),
      mapFolders(this, folder => folder.delete())
    ]).then(() => {})
  }

  file (name) {
    return new RepoUnionFile(
      this.io,
      this.dataKey,
      this._master.file(name),
      this._fallback.file(name),
      this._master.file(name + '._x_')
    )
  }

  folder (name) {
    return new RepoUnionFolder(
      this.io,
      this.dataKey,
      this._master.folder(name),
      this._fallback.folder(name)
    )
  }

  listFiles () {
    return Promise.all([
      this._master.listFiles(),
      this._fallback.listFiles()
    ]).then(values => removeDuplicates(values[0], values[1]))
  }

  listFolders () {
    return Promise.all([
      this._master.listFolders(),
      this._fallback.listFolders()
    ]).then(values => removeDuplicates(values[0], values[1]))
  }
}

export function makeRepoUnionFolder (io, dataKey, master, fallback) {
  if (io.encryptedDisklet) {
    // This only works if we are on RN and have an io.encryptedDisklet object
    return new RepoUnionFolder(io, dataKey, master, fallback)
  } else {
    // Fallback to software encryption
    const folder = makeUnionFolder(master, fallback)
    return new RepoFolder(io, dataKey, folder)
  }
}
