import * as crypto from '../crypto/crypto.js'
import {base16, base64} from '../util/encoding.js'

/**
 * Creates a blank repo on the sync server.
 */
export function repoCreate (io, login, keysJson) {
  keysJson.dataKey = keysJson.dataKey || base16.encode(crypto.random(32))
  keysJson.syncKey = keysJson.syncKey || base16.encode(crypto.random(20))

  const request = {
    'l1': login.userId,
    'lp1': base64.encode(login.passwordAuth),
    'repo_wallet_key': keysJson.syncKey
  }
  return io.authRequest('POST', '/v1/wallet/create', request).then(reply => keysJson)
}

/**
 * Marks a repo as being used.
 * This should be called after the repo is securely attached
 * to the login or account.
 */
export function repoActivate (io, login, keysJson) {
  const request = {
    'l1': login.userId,
    'lp1': base64.encode(login.passwordAuth),
    'repo_wallet_key': keysJson.syncKey
  }
  return io.authRequest('POST', '/v1/wallet/activate', request).then(reply => null)
}
