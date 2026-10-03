import { describe, expect, it } from 'vitest'
import { isAllowedRequest } from '../src/node/server.js'

const hosts = new Set(['localhost', '127.0.0.1', '[::1]'])
const req = (method: string, headers: Record<string, string>) => ({ method, headers }) as any
const ok = { 'x-doc-review': '1', host: 'localhost:5173' }

describe('isAllowedRequest', () => {
  it('allows a same-origin request from the dev server', () => {
    expect(isAllowedRequest(req('GET', ok), hosts, 5173).ok).toBe(true)
    expect(isAllowedRequest(req('POST', { ...ok, origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }), hosts, 5173).ok).toBe(true)
  })
  it('refuses another origin', () => {
    expect(isAllowedRequest(req('POST', { ...ok, origin: 'https://evil.example' }), hosts, 5173).ok).toBe(false)
    expect(isAllowedRequest(req('POST', { ...ok, origin: 'http://localhost:9999' }), hosts, 5173).ok).toBe(false)
  })
  it('refuses a POST without Origin', () => {
    expect(isAllowedRequest(req('POST', ok), hosts, 5173).ok).toBe(false)
  })
  it('refuses a request without the review header (simple cross-site form posts)', () => {
    expect(isAllowedRequest(req('POST', { host: 'localhost:5173', origin: 'http://localhost:5173' }), hosts, 5173).ok).toBe(false)
  })
  it('refuses DNS rebinding (Host and Origin are the attacker name)', () => {
    expect(isAllowedRequest(req('POST', { 'x-doc-review': '1', host: 'evil.example:5173', origin: 'http://evil.example:5173' }), hosts, 5173).ok).toBe(false)
  })
  it('refuses a cross-site fetch metadata header', () => {
    expect(isAllowedRequest(req('GET', { ...ok, 'sec-fetch-site': 'cross-site' }), hosts, 5173).ok).toBe(false)
  })
})
