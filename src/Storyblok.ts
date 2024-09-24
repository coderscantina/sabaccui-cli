import credentials from './utils/credentials'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs'
import path from 'path'
import ProjectConfig from './utils/projectConfig'

const sourceTags = {
  47877: 'Molecule',
  47874: 'Atom',
  47875: 'Text',
  47878: 'Organism'
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'))
const pkg = JSON.parse(rawPkg.toString())
const DOMAIN = process.env.STORYBLOK_API_DOMAIN || 'https://mapi.storyblok.com/v1/'
export default class Storyblok {
  space: string

  constructor(space: string) {
    this.space = space
  }

  async request(method, path, body) {
    const { password: oauthToken } = credentials.get('sabaccui.storyblok.com')

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': oauthToken,
      'User-Agent': `sabaccui-cli/${pkg.version}`
    }

    const response = await fetch(`${DOMAIN}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers
    })

    return await response.json()
  }

  async ensureTags() {
    // Get tags from Storyblok via API
    const response = await this.request('GET', `spaces/${this.space}/internal_tags`)
    const currentTags = response.internal_tags
    const existingTagMap = new Map(currentTags.map(tag => [tag.name, tag.id]))
    const sourceTagMapping = {}

    for (const [sourceTag, tagName] of Object.entries(sourceTags)) {
      if (!existingTagMap.has(tagName)) {
        const response = await this.request('POST', `/spaces/${this.space}/internal_tags`, {
          name: tagName,
          object_type: 'component'
        })
        sourceTagMapping[sourceTag] = response.internal_tag.id
      } else {
        sourceTagMapping[sourceTag] = existingTagMap.get(tagName)
      }
    }

    ProjectConfig.set('tags', sourceTagMapping)
    await ProjectConfig.save()

    return sourceTagMapping
  }

  replaceTags(obj, tagMapping) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceTags(item, tagMapping))
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {}
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'component_tag_whitelist' || key === 'internal_tag_ids') {
          newObj[key] = value.map(tag => tagMapping[tag] || tag)
        } else if (key === 'internal_tags_list') {
          newObj[key] = value.map(tag => ({
            ...tag,
            id: tagMapping[tag.id] || tag.id
          }))
        } else {
          newObj[key] = this.replaceTags(value, tagMapping)
        }
      }
      return newObj
    }
    return obj
  }

  async getBlock(name: string) {
    const response = await this.request('GET', `spaces/${this.space}/components?search=${name}`)
    return response.components[0] ?? null
  }

  async pushBlock(definition: Object) {
    const block = await this.getBlock(definition.name)
    if (block) {
      return this.updateBlock(block.id, definition)
    }

    return this.createBlock(definition)
  }

  async updateBlock(id: string, definition: Object) {
    let tags = ProjectConfig.get('tags')
    if (!tags) {
      tags = await this.ensureTags()
    }

    return await this.request('PUT', `spaces/${this.space}/components/${id}`, this.replaceTags(definition, tags))
  }

  async createBlock(definition: Object) {
    let tags = ProjectConfig.get('tags')
    if (!tags) {
      tags = await this.ensureTags()
    }

    return await this.request('POST', `spaces/${this.space}/components`, this.replaceTags(definition, tags))
  }
}