import { LoginPayload, RegisterPayload } from '../types'
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

  async register(input: RegisterPayload) {
    return await this.api.register(input)
  }
}

export default Service
