import path from 'path'
import fs from 'fs-extra'

class ProjectConfig {
  private static instance: ProjectConfig

  private path: string|null = null

  private config: Record<string, any> = {}

  constructor() {
    if (!ProjectConfig.instance) {
      ProjectConfig.instance = this
    }
    return ProjectConfig.instance
  }

  async init(path: string) {
    this.path = path
    await this.load()
  }

  async load() {
    if (!this.path) {
      throw new Error('No path set.')
    }
    const configFile = path.join(this.path, 'sabaccui.config.json')
    this.config = await fs.readJSON(configFile).catch(() => ({}))
  }

  async save() {
    if (!this.path) {
      throw new Error('No path set.')
    }
    const configFile = path.join(this.path, 'sabaccui.config.json')
    await fs.writeJSON(configFile, this.config, { spaces: 2 })
  }

  get(key?: string) {
    return key ? this.config[key] : this.config
  }

  set(key: string, value: any) {
    this.config[key] = value
  }

  apply(data: Record<string, any>) {
    this.config = { ...this.config, ...data }
  }

  delete(key: string) {
    delete this.config[key]
  }
}

const instance = new ProjectConfig()

export default instance

