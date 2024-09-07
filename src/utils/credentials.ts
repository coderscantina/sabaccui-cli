import path from 'path'
import fs from 'fs'
import netrc from 'netrc'
import os from 'os'

const host = 'sabaccui.com'

const getFile = () => {
  const home = process.env[(/^win/.test(process.platform)) ? 'USERPROFILE' : 'HOME']
  return path.join(home, '.netrc')
}

const getNrcFile = () => {
  let obj = {}

  try {
    obj = netrc(getFile())
  } catch (e) {
    obj = {}
  }

  return obj
}

const get = function () {
  const obj = getNrcFile()

  if (process.env.SABACCUI_LOGIN && process.env.SABACCUI_TOKEN) {
    return {
      email: process.env.SABACCUI_LOGIN,
      token: process.env.SABACCUI_TOKEN
    }
  }

  if (Object.hasOwnProperty.call(obj, host)) {
    return {
      email: obj[host].login,
      token: obj[host].password,
    }
  }

  return null
}

const set = function (email?: string|null, token?: string|null) {
  const file = getFile()
  let obj = {}

  try {
    obj = netrc(file)
  } catch (e) {
    obj = {}
  }

  if (email === null) {
    delete obj[host]
    fs.writeFileSync(file, netrc.format(obj) + os.EOL)
    return null
  } else {
    obj[host] = {
      login: email,
      password: token
    }
    fs.writeFileSync(file, netrc.format(obj) + os.EOL)
    return get()
  }
}

export default {
  set: set,
  get: get,
  clear: () => set(null, null)
}