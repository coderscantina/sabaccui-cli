import credentials from './utils/credentials'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs'
import path from 'path'
import ProjectConfig from './utils/projectConfig'

const SOURCE_TAGS = {
  47877: 'Molecule',
  47874: 'Atom',
  47875: 'Text',
  47878: 'Organism',
  50625: 'Menu'
} as const

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOMAIN = process.env.STORYBLOK_API_DOMAIN || 'https://mapi.storyblok.com/v1/'

interface StoryblokResponse {
  internal_tags?: Array<{ name: string; id: string }>;
  components?: Array<{ id: string; name: string }>;
  internal_tag?: { id: string };
}

export default class Storyblok {
  private space: string
  private oauthToken: string
  private headers: Record<string, string>

  constructor(space: string) {
    this.space = space
    this.oauthToken = credentials.get('sabaccui.storyblok.com').password
    this.headers = this.getHeaders()
  }

  private getHeaders(): Record<string, string> {
    const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    const pkg = JSON.parse(rawPkg ?? '{}')

    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': this.oauthToken,
      'User-Agent': `sabaccui-cli/${pkg.version}`
    }
  }

  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    const response = await fetch(`${DOMAIN}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: this.headers
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return await response.json() as T
  }

  async ensureTags(): Promise<Record<string, string>> {
    const response = await this.request<StoryblokResponse>('GET', `spaces/${this.space}/internal_tags`)
    const currentTags = response.internal_tags || []
    const existingTagMap = new Map(currentTags.map(tag => [tag.name, tag.id]))
    const sourceTagMapping: Record<string, string> = {}

    for (const [sourceTag, tagName] of Object.entries(SOURCE_TAGS)) {
      if (existingTagMap.has(tagName)) {
        sourceTagMapping[sourceTag] = existingTagMap.get(tagName) || ''
      } else {
        const response = await this.request<StoryblokResponse>('POST', `/spaces/${this.space}/internal_tags`, {
          name: tagName,
          object_type: 'component'
        })
        sourceTagMapping[sourceTag] = response.internal_tag?.id || ''
      }
    }

    ProjectConfig.set('tags', sourceTagMapping)
    await ProjectConfig.save()

    return sourceTagMapping
  }

  replaceTags(obj: any, tagMapping: Record<string, string>): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceTags(item, tagMapping))
    } else if (typeof obj === 'object' && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
          if (key === 'component_tag_whitelist' || key === 'internal_tag_ids') {
            return [key, (value as string[]).map(tag => tagMapping[tag] || tag)]
          } else if (key === 'internal_tags_list') {
            return [key, (value as Array<{ id: string }>).map(tag => ({
              ...tag,
              id: tagMapping[tag.id] || tag.id
            }))]
          } else {
            return [key, this.replaceTags(value, tagMapping)]
          }
        })
      )
    }
    return obj
  }

  async getBlock(name: string): Promise<{ id: string; name: string } | null> {
    const response = await this.request<StoryblokResponse>('GET', `spaces/${this.space}/components?search=${name}`)
    return response.components?.[0] ?? null
  }

  async pushBlock(definition: Record<string, any>): Promise<StoryblokResponse> {
    const block = await this.getBlock(definition.name)
    return block ? this.updateBlock(block.id, definition) : this.createBlock(definition)
  }

  private async updateBlock(id: string, definition: Record<string, any>): Promise<StoryblokResponse> {
    const tags = await this.getOrEnsureTags()
    return this.request<StoryblokResponse>('PUT', `spaces/${this.space}/components/${id}`, this.replaceTags(definition, tags))
  }

  private async createBlock(definition: Record<string, any>): Promise<StoryblokResponse> {
    const tags = await this.getOrEnsureTags()
    return this.request<StoryblokResponse>('POST', `spaces/${this.space}/components`, this.replaceTags(definition, tags))
  }

  private async getOrEnsureTags(): Promise<Record<string, string>> {
    let tags = ProjectConfig.get('tags')
    if (!tags) {
      tags = await this.ensureTags()
    }
    return tags
  }
}