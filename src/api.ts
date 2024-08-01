import axios, { AxiosInstance, AxiosResponse } from 'axios'
import credentials from './utils/credentials'
import { ComponentListResponse, LoginPayload, TemplateListResponse, TokenResponse } from './types'

const DOMAIN = 'http://ui.coderscantina.test'

function getToken() {
  const creds = credentials.get()
  if (!creds || !creds.token) {
    throw new Error('Not logged in. Please login first.')
  }

  return creds.token
}

function getClient() {
  const token = getToken()

  return axios.create({
    baseURL: DOMAIN,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
}

function handleError(error: any, type: string = null, key: string = null) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please check your Login.')
    } else if (error.response?.status === 404) {
      if (type && key) {
        throw new Error(`${type} with key "${key}" not found.`)
      }
      throw new Error('Resource not found.')
    } else {
      throw new Error(`API error: ${error.response?.statusText || error.message}`)
    }
  } else {
    throw new Error('An unexpected error occurred while downloading the component.')
  }
}

class API {
  private client: AxiosInstance

  constructor() {
    this.client = getClient()
  }

  async login(input: LoginPayload) {
    try {
      const response: AxiosResponse<TokenResponse> = await axios.post('http://ui.coderscantina.test/auth/v1/token', input)
      const { data } = response

      return data
    } catch (error) {
      handleError(error)
    }
  }

  async getComponents() {
    try {
      const { data }: AxiosResponse<ComponentListResponse> = await this.client.get('/api/v1/components')

      return data
    } catch (error) {
      handleError(error)
    }
  }

  async downloadComponent(key: string): Promise<Buffer> {
    try {
      const response: AxiosResponse<ArrayBuffer> = await this.client.get(`/api/v1/components/${key}/download`, {
        responseType: 'arraybuffer',
      })
      return Buffer.from(response.data)
    } catch (error) {
      handleError(error, 'Component', key)
    }
  }

  async getTemplates() {
    const { data }: AxiosResponse<TemplateListResponse> = await this.client.get('/api/v1/templates')

    return data
  }

  async downloadTemplate(key: string): Promise<Buffer> {
    try {
      const response: AxiosResponse<ArrayBuffer> = await this.client.get(`/api/v1/templates/${key}/download`, {
        responseType: 'arraybuffer',
      })
      return Buffer.from(response.data)
    } catch (error) {
      handleError(error, 'Template', key)
    }
  }
}

export default API