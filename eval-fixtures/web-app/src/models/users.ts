export interface User {
  id: number
  name: string
  email: string
  createdAt: string
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'Bob', email: 'bob@example.com', createdAt: '2024-01-02T00:00:00Z' },
]

let nextId = 3

export function findAll(): User[] {
  return [...users]
}

export function findById(id: number): User | undefined {
  return users.find((u) => u.id === id)
}

export function create(name: string, email: string): User {
  const user: User = { id: nextId++, name, email, createdAt: new Date().toISOString() }
  users.push(user)
  return user
}
