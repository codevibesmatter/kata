import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as UserModel from '../src/models/users.js'

describe('UserModel', () => {
  it('findAll returns array', () => {
    const users = UserModel.findAll()
    assert.ok(Array.isArray(users))
    assert.ok(users.length >= 2)
  })

  it('findById returns user for valid id', () => {
    const user = UserModel.findById(1)
    assert.ok(user)
    assert.equal(user.id, 1)
  })

  it('findById returns undefined for missing id', () => {
    const user = UserModel.findById(9999)
    assert.equal(user, undefined)
  })

  it('create adds a new user', () => {
    const before = UserModel.findAll().length
    const user = UserModel.create('TestUser', 'test@example.com')
    const after = UserModel.findAll().length
    assert.equal(after, before + 1)
    assert.equal(user.name, 'TestUser')
    assert.equal(user.email, 'test@example.com')
  })
})
