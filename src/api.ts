import credentials from './utils/credentials'
import { ComponentListResponse, LoginPayload, TemplateListResponse, TokenResponse } from './types'

const DOMAIN = process.env.SABACCUI_API_DOMAIN || 'https://ui.coderscantina.com'

function getToken() {
  const creds = credentials.get()
  if (!creds || !creds.token) {
    throw new Error('Not logged in. Please login first.')
  }

  return creds.token
}

function getHeaders() {
  const token = getToken()

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

async function handleError(response: Response, type: string = null, key: string = null) {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your Login.')
    } else if (response.status === 404) {
      if (type && key) {
        throw new Error(`${type} with key "${key}" not found.`)
      }
      throw new Error('Resource not found.')
    } else {
      const errorText = await response.text()
      throw new Error(`API error: ${response.statusText || errorText}`)
    }
  }
}

class API {
  private headers: Record<string, string>

  constructor() {
    this.headers = getHeaders()
  }

  async login(input: LoginPayload) {
    const response = await fetch(`${DOMAIN}/auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })

    await handleError(response)

    const data: TokenResponse = await response.json()
    return data
  }

  async getComponents() {
    const response = await fetch(`${DOMAIN}/api/v1/components`, {
      headers: this.headers
    })

    await handleError(response)

    const data: ComponentListResponse = await response.json()
    return data
  }

  async downloadComponent(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/components/${key}/download`, {
      headers: this.headers
    })

    await handleError(response, 'Component', key)

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async getTemplates() {
    const response = await fetch(`${DOMAIN}/api/v1/templates`, {
      headers: this.headers
    })

    await handleError(response)

    const data: TemplateListResponse = await response.json()
    return data
  }

  async downloadTemplate(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/templates/${key}/download`, {
      headers: this.headers
    })

    await handleError(response, 'Template', key)

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

export default API