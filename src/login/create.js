import bip39 from 'bip39'

import * as crypto from '../crypto.js'
import {Login} from './login.js'
import * as userMap from '../userMap.js'
import {UserStorage} from '../userStorage.js'

/**
 * Determines whether or not a username is available.
 */
export function usernameAvailable (ctx, username, callback) {
  username = userMap.normalize(username)

  var userId = userMap.getUserId(ctx.localStorage, username)
  var request = {
    'l1': userId
  }
  ctx.authRequest('POST', '/v1/account/available', request, function (err, reply) {
    if (err) return callback(err)
    return callback(null)
  })
}

/**
 * Creates a new login on the auth server.
 */
export function create (ctx, username, password, opts, callback) {
  username = userMap.normalize(username)
  var userId = userMap.getUserId(ctx.localStorage, username)

  // Create random key material:
  var passwordKeySnrp = crypto.makeSnrp()
  var dataKey = crypto.random(32)
  var syncKey = opts.syncKey || crypto.random(20)

  // Derive keys from password:
  var passwordAuth = crypto.scrypt(username + password, crypto.passwordAuthSnrp)
  var passwordKey = crypto.scrypt(username + password, passwordKeySnrp)

  // Encrypt:
  var passwordBox = crypto.encrypt(dataKey, passwordKey)
  var passwordAuthBox = crypto.encrypt(passwordAuth, dataKey)
  var syncKeyBox = crypto.encrypt(syncKey, dataKey)

  // Package:
  var carePackage = {
    'SNRP2': passwordKeySnrp
  }
  var loginPackage = {
    'EMK_LP2': passwordBox,
    'ESyncKey': syncKeyBox,
    'ELP1': passwordAuthBox
  }
  var request = {
    'l1': userId,
    'lp1': passwordAuth.toString('base64'),
    'care_package': JSON.stringify(carePackage),
    'login_package': JSON.stringify(loginPackage),
    'repo_account_key': syncKey.toString('hex')
  }

  ctx.authRequest('POST', '/v1/account/create', request, function (err, reply) {
    if (err) return callback(err)

    // Cache everything for future logins:
    userMap.insert(ctx.localStorage, username, userId)
    var userStorage = new UserStorage(ctx.localStorage, username)
    userStorage.setJson('passwordKeySnrp', passwordKeySnrp)
    userStorage.setJson('passwordBox', passwordBox)
    userStorage.setJson('passwordAuthBox', passwordAuthBox)
    userStorage.setJson('syncKeyBox', syncKeyBox)

    // Now upgrade:
    upgrade(ctx, userStorage, userId, passwordAuth, dataKey, function (err) {
      if (err) return callback(err)

      // Now activate:
      var request = {
        'l1': userId,
        'lp1': passwordAuth.toString('base64')
      }
      ctx.authRequest('POST', '/v1/account/activate', request, function (err, reply) {
        if (err) return callback(err)
        return callback(null, Login.offline(ctx.localStorage, username, dataKey))
      })
    })
  })
}

export function upgrade (ctx, userStorage, userId, passwordAuth, dataKey, callback) {
  // Create a BIP39 mnemonic, and use it to derive the rootKey:
  var entropy = crypto.random(256 / 8)
  var mnemonic = bip39.entropyToMnemonic(entropy.toString('hex'))
  var rootKey = bip39.mnemonicToSeed(mnemonic)
  var infoKey = crypto.hmacSha256(rootKey, 'infoKey')

  // Pack the keys into various boxes:
  var rootKeyBox = crypto.encrypt(rootKey, dataKey)
  var mnemonicBox = crypto.encrypt(new Buffer(mnemonic, 'utf-8'), infoKey)
  var dataKeyBox = crypto.encrypt(dataKey, infoKey)

  var request = {
    'l1': userId,
    'lp1': passwordAuth.toString('base64'),
    'rootKeyBox': rootKeyBox,
    'mnemonicBox': mnemonicBox,
    'syncDataKeyBox': dataKeyBox
  }
  ctx.authRequest('POST', '/v1/account/upgrade', request, function (err, reply) {
    if (err) return callback(err)
    userStorage.setJson('rootKeyBox', rootKeyBox)
    return callback(null)
  })
}
