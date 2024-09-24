import path from 'path'
import fs from 'fs'
import netrc from 'netrc'
import os from 'os'

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

const get = function (host: string = 'sabaccui.com') {
  const obj = getNrcFile()

  if (process.env.SABACCUI_LOGIN && process.env.SABACCUI_TOKEN) {
    return {
      email: process.env.SABACCUI_LOGIN,
      token: process.env.SABACCUI_TOKEN
    }
  }

  if (Object.hasOwnProperty.call(obj, host)) {
    return obj[host]
  }

  return null
}

const set = function (content: {} | null, host: string = 'sabaccui.com') {
  const file = getFile()
  let obj = {}

  try {
    obj = netrc(file)
  } catch (e) {
    obj = {}
  }

  if (content === null) {
    delete obj[host]
    fs.writeFileSync(file, netrc.format(obj) + os.EOL)
    return null
  } else {
    obj[host] = content
    fs.writeFileSync(file, netrc.format(obj) + os.EOL)
    return get()
  }
}

export default {
  set: set,
  get: get,
  clear: () => set(null)
}