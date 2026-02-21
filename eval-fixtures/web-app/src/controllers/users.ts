import type { Request, Response } from 'express'
import * as UserModel from '../models/users.js'

export function listUsers(req: Request, res: Response): void {
  const users = UserModel.findAll()
  res.json({ users })
}

export function getUser(req: Request, res: Response): void {
  const id = parseInt(req.params.id, 10)
  const user = UserModel.findById(id)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ user })
}

export function createUser(req: Request, res: Response): void {
  const { name, email } = req.body as { name?: string; email?: string }
  if (!name || !email) {
    res.status(400).json({ error: 'name and email are required' })
    return
  }
  const user = UserModel.create(name, email)
  res.status(201).json({ user })
}
