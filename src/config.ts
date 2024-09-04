import fs from 'fs-extra'
import path from 'path'
import os from 'os'

export class Config {
  private configPath: string
  private config: any

  constructor() {
    this.configPath = path.join(os.homedir(), '.sabaccui', 'config.json')
    this.loadConfig()
  }

  private loadConfig() {
    try {
      this.config = fs.readJsonSync(this.configPath)
    } catch (error) {
      this.config = {}
    }
  }

  private saveConfig() {
    fs.ensureFileSync(this.configPath)
    fs.writeJsonSync(this.configPath, this.config, { spaces: 2 })
  }

  get(key: string): any {
    const keys = key.split('.')
    let value = this.config
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return undefined
      }
    }
    return value
  }

  set(key: string, value: any) {
    const keys = key.split('.')
    let current = this.config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
    this.saveConfig()
  }

  getAll(): any {
    return this.config
  }
}