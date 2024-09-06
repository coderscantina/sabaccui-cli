import { LoginPayload } from '../types'
import credentials from '../utils/credentials'
import BaseService from './BaseService'

class Service extends BaseService{
  async login(input: LoginPayload) {
    const data = await this.api.login(input)
    credentials.set(input.email, data.access_token)

    return true
  }

  async logout() {
    await this.api.logout()
    credentials.clear()
  }

  async license(input: { license: string }) {
    return await this.api.license(input.license)
  }
}

export default Service
