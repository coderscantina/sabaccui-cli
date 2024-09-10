export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface ComponentResource {
  key: string
  name: string
  description: string
  group: string
  type: string
  version: string
  updated_at: string
}

export interface TemplateResource {
  key: string
  name: string
  description: string
  version: string
  updated_at: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
}

export interface ComponentListResponse {
  data: ComponentResource[]
}

export interface TemplateListResponse {
  data: TemplateResource[]
}

export interface ConfigFile {
  name?: string
  version?: string
  space?: string
  domain?: string
  storyblokToken?: string
}