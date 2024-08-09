import credentials from './utils/credentials'
import { ComponentListResponse, LoginPayload, TemplateListResponse, TokenResponse } from './types'
import fs from 'fs'
import path from 'path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const DOMAIN = process.env.SABACCUI_API_DOMAIN || 'https://www.sabaccui.com'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'))
const pkg = JSON.parse(rawPkg.toString())

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
    'accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': `sabaccui-cli/${pkg.version}`
  }
}

async function handleError(response: Response, type: string | null = null, key: string | null = null) {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your Login.')
    } else if (response.status === 403) {
      throw new Error('Access denied. Please check for a valid license.')
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
  async login(input: LoginPayload) {
    const response = await fetch(`${DOMAIN}/auth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `sabaccui-cli/${pkg.version}`
      },
      body: JSON.stringify(input)
    })

    await handleError(response)

    const data: TokenResponse = await response.json()
    return data
  }

  async logout() {
    const response = await fetch(`${DOMAIN}/auth/v1/token`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ _method: 'DELETE' })
    })


    try {
      await handleError(response)
    } catch (error) {
      console.error(chalk.red('X'), error.message)
      return false
    }

    return true
  }

  async getComponents() {
    const response = await fetch(`${DOMAIN}/api/v1/components`, {
      headers: getHeaders()
    })

    await handleError(response)

    const data: ComponentListResponse = await response.json()
    return data
  }

  async downloadComponent(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/components/${key}/download`, {
      headers: getHeaders()
    })

    await handleError(response, 'Component', key)

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async getTemplates() {
    const response = await fetch(`${DOMAIN}/api/v1/templates`, {
      headers: getHeaders()
    })

    await handleError(response)

    const data: TemplateListResponse = await response.json()
    return data
  }

  async downloadTemplate(key: string): Promise<Buffer> {
    const response = await fetch(`${DOMAIN}/api/v1/templates/${key}/download`, {
      headers: getHeaders()
    })

    await handleError(response, 'Template', key)

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

export default API