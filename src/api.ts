import credentials from './utils/credentials'
import {
  BlokListResponse,
  ComponentListResponse,
  LoginPayload,
  RegisterPayload,
  TemplateListResponse,
  TokenResponse
} from './types'
import fs from 'fs'
import path from 'path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const DOMAIN = process.env.SABACCUI_API_DOMAIN || 'https://www.sabaccui.com'
const __dirname = dirname(fileURLToPath(import.meta.url))

interface ApiError extends Error {
  status?: number;
  errors?: Record<string, string[]>;
}

class API {
  private headers: Record<string, string>

  constructor() {
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `sabaccui-cli/${this.getVersion()}`
    }
  }

  private getVersion(): string {
    const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'))
    const pkg = JSON.parse(rawPkg.toString())

    return pkg.version
  }

  private getToken(): string {
    const creds = credentials.get()
    if (!creds?.password) {
      throw new Error('Not logged in. Please login first.')
    }
    return creds.password
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      ...this.headers,
      'Authorization': `Bearer ${this.getToken()}`
    }
  }

  private async handleResponse<T>(response: Response, type?: string, key?: string): Promise<T>
  private async handleResponse<Buffer>(response: Response, type?: string, key?: string, asBuffer?: boolean): Promise<Buffer> {
    if (!response.ok) {
      const error: ApiError = new Error('API error')
      error.status = response.status

      switch (response.status) {
        case 401:
          error.message = 'Authentication failed. Please check your Login.'
          break
        case 403:
          error.message = 'Access denied. Please check for a valid license.'
          break
        case 404:
          error.message = type && key ? `${type} with key "${key}" not found.` : 'Resource not found.'
          break
        case 422:
          const errorData = await response.json()
          if (errorData.errors) {
            error.errors = errorData.errors
            error.message = Object.entries(errorData.errors)
              .map(([key, value]) => `${key}: ${(value as string[]).join(', ')}`)
              .join(', ')
          }
          break
        default:
          error.message = (await response.json()).error || response.statusText
      }

      throw error
    }

    return asBuffer ? Buffer.from(await response.arrayBuffer()) : response.json();
  }

  private async makeRequest<T>(url: string, options: RequestInit = {}, type?: string, key?: string): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: options.headers || this.getAuthHeaders()
    })
    return this.handleResponse<T>(response, type, key)
  }

  async login(input: LoginPayload): Promise<TokenResponse> {
    return this.makeRequest<TokenResponse>(`${DOMAIN}/auth/v1/token`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(input)
    })
  }

  async logout(): Promise<boolean> {
    try {
      await this.makeRequest(`${DOMAIN}/auth/v1/token`, {
        method: 'POST',
        body: JSON.stringify({ _method: 'DELETE' })
      })
      return true
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
      return false
    }
  }

  async register(input: RegisterPayload): Promise<boolean> {
    try {
      await this.makeRequest(`${DOMAIN}/auth/v1/register`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(input)
      })
      return true
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
      return false
    }
  }

  async license(key: string): Promise<boolean> {
    try {
      await this.makeRequest(`${DOMAIN}/api/v1/licenses/activate`, {
        method: 'POST',
        body: JSON.stringify({ key })
      })
      return true
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
      return false
    }
  }

  async getBloks(): Promise<BlokListResponse> {
    return this.makeRequest<BlokListResponse>(`${DOMAIN}/api/v1/bloks`)
  }

  async getComponents(): Promise<ComponentListResponse> {
    return this.makeRequest<ComponentListResponse>(`${DOMAIN}/api/v1/components`)
  }

  async downloadComponent(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/components/${key}/download`, {
      headers: this.getAuthHeaders()
    })

    return await this.handleResponse<Buffer>(response, 'Component', key, true)
  }

  async downloadBlok(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/bloks/${key}/download`, {
      headers: this.getAuthHeaders()
    })

    return await this.handleResponse<Buffer>(response, 'Blok', key, true)
  }

  async getTemplates(): Promise<TemplateListResponse> {
    return this.makeRequest<TemplateListResponse>(`${DOMAIN}/api/v1/templates`)
  }

  async downloadTemplate(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/templates/${key}/download`, {
      headers: this.getAuthHeaders()
    })

    return await this.handleResponse<Buffer>(response, 'Template', key, true)
  }
}

export default API